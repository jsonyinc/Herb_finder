import firebase_admin
from firebase_admin import credentials, firestore, auth, storage
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
from functools import wraps # 데코레이터용 functools 추가
from google.cloud import vision # Vertex AI Vision (또는 AutoML) 용

# 환경변수 로드: .env 파일에서 설정값 가져오기
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
# load_dotenv()
key_path = os.getenv("SERVICE_ACCOUNT_KEY_PATH")
google_application_credentials = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") # Vision API용 서비스 계정 키 경로 (key_path와 같을 수 있음)

# Flask 앱 초기화: 사서 창구를 여는 코드 (Flask는 API를 만드는 도구예요)
app = Flask(__name__)
# 개발 환경에서는 모든 출처 허용, 프로덕션에서는 특정 출처 지정 필요
CORS(app, origins=os.getenv("CORS_ALLOWED_ORIGINS", "*").split(','))
# CORS(app)  # React와 대화할 수 있게 허용 (CORS는 다른 앱과의 연결을 허용해줘요)

# Firebase Admin SDK 초기화: 도서관 문을 여는 코드
try:
    cred = credentials.Certificate(key_path)  # 도서관(데이터베이스) 열쇠 파일 경로
    firebase_admin.initialize_app(cred, {
        'storageBucket': os.getenv("FIREBASE_STORAGE_BUCKET_NAME") # .env 파일에 FIREBASE_STORAGE_BUCKET_NAME=your-bucket-name.appspot.com 추가 필요
    })  # 도서관(데이터베이스) 문 열기
    db = firestore.client()  # 도서관(데이터베이스) 안으로 들어가기
    bucket = storage.bucket() # Firebase Storage 버킷 객체
    print("Firebase Admin SDK 초기화 성공")
except Exception as e:
    print(f"Firebase Admin SDK 초기화 실패: {e}")
    # 앱 실행을 중단하거나 기본값으로 계속 진행할지 결정해야 함
    db = None # db 사용 전에 None 체크 필요
    bucket = None
# cred = credentials.Certificate(key_path)  # 도서관(데이터베이스) 열쇠 파일 경로
# firebase_admin.initialize_app(cred)  # 도서관(데이터베이스) 문 열기
# db = firestore.client()  # 도서관(데이터베이스) 안으로 들어가기
    
# --- Vertex AI Vision 클라이언트 초기화 ---
# GOOGLE_APPLICATION_CREDENTIALS 환경변수가 설정되어 있으면 자동으로 인증됨
try:
    vision_client = vision.ImageAnnotatorClient()
    print("Vertex AI Vision 클라이언트 초기화 성공")
except Exception as e:
    print(f"Vertex AI Vision 클라이언트 초기화 실패: {e}")
    vision_client = None
    
# --- 인증 토큰 검증 데코레이터 ---
def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        # Authorization 헤더에서 Bearer 토큰 추출
        if 'Authorization' in request.headers:
            try:
                token = request.headers['Authorization'].split('Bearer ')[1]
            except IndexError:
                return jsonify({"error": "잘못된 형식의 토큰입니다."}), 401

        if not token:
            return jsonify({"error": "인증 토큰이 필요합니다."}), 401

        try:
            # Firebase ID 토큰 검증
            decoded_token = auth.verify_id_token(token)
            # 검증된 사용자 UID를 request 객체 등에 저장하여 라우트 함수에서 사용 가능하게 할 수 있음
            # 예: request.user = decoded_token
            print(f"토큰 검증 성공: UID={decoded_token['uid']}")
        except auth.ExpiredIdTokenError:
            return jsonify({"error": "만료된 토큰입니다."}), 401
        except auth.InvalidIdTokenError:
            return jsonify({"error": "유효하지 않은 토큰입니다."}), 401
        except Exception as e:
            return jsonify({"error": f"토큰 검증 중 알 수 없는 오류 발생: {str(e)}"}), 500

        return f(*args, **kwargs, current_user_uid=decoded_token['uid']) # uid를 인자로 전달
    return decorated_function

# 로컬호스트 루트주소 접속시 보여줄 메시지(API Route 구동여부 테스트 환경용)
@app.route('/')  # 루트 URL 추가
def home():
    return "Herb Finder API에 오신 것을 환영합니다!"

# 사용자 생성 API: "/create_user"라는 창구를 만드는 코드
@app.route('/create_user', methods=['POST'])  # POST 요청만 받음 (새로운 데이터를 만들 때 사용)
def create_user():
    # (기존 코드 유지 - 단, Firestore 저장 시 에러 처리 강화 고려)
    if not db: return jsonify({"error": "데이터베이스 연결 실패"}), 500
    try:
        # 요청 데이터 받기: 사용자가 보낸 정보를 받아요
        data = request.json
        # 데이터 검증: 필수 정보가 있는지 확인해요
        if not data or 'email' not in data or 'password' not in data or 'nickname' not in data:
            return jsonify({"error": "이메일, 비밀번호, 닉네임은 필수입니다."}), 400  # 잘못된 요청 에러

        # Firebase Auth로 인증된 사용자 생성: 출입증 발급하기
        user = auth.create_user(
            email=data['email'],
            password=data['password']
        )

        # Firestore에 사용자 정보 저장: 도서관(데이터베이스)에 정보(책) 넣기
        db.collection('users').document(user.uid).set({
            'nickname': data['nickname'],  # 탐험가 이름
            'avatar': data.get('avatar', ''),  # 사진 URL, 없으면 빈 문자열
            'email': data['email'], # Firestore에도 이메일 저장 (선택적)
            'created_at': firestore.SERVER_TIMESTAMP  # 지금 시간 자동으로
        }, merge=True) # merge=True: 문서가 존재하면 병합 (더 안전)

        # 성공 응답: "잘 됐어요!"라는 메시지와 사용자 ID를 돌려줘요
        return jsonify({"uid": user.uid, "message": "사용자 생성 성공"}), 201

    except auth.EmailAlreadyExistsError:  # 이미 존재하는 이메일: 중복 에러       
        return jsonify({"error": "이미 존재하는 이메일입니다."}), 409  # 충돌 에러
    except auth.InvalidPasswordError:  # 비밀번호가 잘못됨: 인증 에러
        return jsonify({"error": "비밀번호는 6자 이상이어야 합니다."}), 401  # 인증 실패 에러
    except auth.FirebaseAuthError as e:  # 더 구체적인 Firebase Auth 에러 처리
         return jsonify({"error": f"Firebase 인증 오류: {str(e)}"}), 400
    except Exception as e:
        print(f"Error in create_user: {e}") # 서버 로그에 에러 기록
        return jsonify({"error": "사용자 생성 중 서버 오류 발생"}), 500
    
# 게시물 생성 (인증 필요, 이미지 URL 포함)
@app.route('/posts', methods=['POST']) # RESTful하게 경로 변경 고려 (/create_post -> /posts)
@token_required # 인증 토큰 검증 데코레이터 적용
def create_post(current_user_uid): # 데코레이터에서 전달된 uid 받기
    if not db: return jsonify({"error": "데이터베이스 연결 실패"}), 500
    try:
        # 요청 데이터 받기: 클라이언트에서 보낸 JSON 데이터를 추출
        data = request.get_json()

        # 데이터 검증: 필수 필드(title, user_id, imageUrl)가 있는지 확인
        required_fields = ['title', 'imageUrl', 'user_id'] # content는 선택 사항으로 가정
        if not data or not all(field in data for field in required_fields):
            return jsonify({"error": "제목, 이미지 URL, 사용자 ID는 필수입니다."}), 400
        
        # 요청한 user_id가 실제 인증된 사용자의 uid와 일치하는지 확인 (보안 강화)
        if data['user_id'] != current_user_uid:
            return jsonify({"error": "자신의 게시물만 생성할 수 있습니다."}), 403 # Forbidden
        
        # 사용자 존재 여부 확인 (선택적: 토큰 검증 시 이미 존재 확인됨)
        # user_ref = db.collection('users').document(data['user_id']).get()
        # if not user_ref.exists:
        #     return jsonify({"error": "존재하지 않는 사용자입니다."}), 404
        
        # 게시물 데이터 준비: Firestore에 저장할 데이터 구성
        post_data = {
            'title': data['title'], # 게시물 제목
            'content': data.get('content', ''), # 게시물 내용이 없으면 빈 문자열
            'imageUrl': data['imageUrl'], # 이미지 URL 저장
            'user_id': data['user_id'], # 작성자 ID (토큰에서 검증됨)
            'plantName': data.get('plantName', ''), # 식물 이름 (클라이언트에서 분석 후 전달받거나, 여기서 분석 후 저장)
            'location': data.get('location'), # 위치 정보 (GeoPoint 또는 위도/경도)
            'recipeLink': data.get('recipeLink', ''), # 레시피 링크
            'youtubeLink': data.get('youtubeLink', ''), # 유튜브 링크
            'efficacy': data.get('efficacy', ''), # 효능
            'precautions': data.get('precautions', ''), # 주의사항
            'likesCount': 0, # 좋아요 수 초기화
            'commentsCount': 0, # 댓글 수 초기화
            'created_at': firestore.SERVER_TIMESTAMP,
            'updated_at': firestore.SERVER_TIMESTAMP,
        }
        
        # Firestore에 게시물 저장 (add는 자동 ID 생성)
        update_time, post_ref = db.collection('posts').add(post_data)

        # 성공 응답
        return jsonify({"post_id": post_ref.id, "message": "게시물 생성 성공"}), 201

    except Exception as e:
        print(f"Error in create_post: {e}")
        return jsonify({"error": f"게시물 생성 중 서버 오류 발생: {str(e)}"}), 500 

 

        # Firestore에 게시물 저장: posts 컬렉션에 새 문서 추가
        post_ref = db.collection('posts').add(post_data)

        # 성공 응답: 생성된 게시물의 ID와 성공 메시지 반환
        return jsonify({"post_id": post_ref[1].id, "message": "게시물 생성 성공"}), 201

    except Exception as e:
        # 기타 에러 처리: 서버에서 발생한 오류를 클라이언트에 전달
        return jsonify({"error": f"서버 오류: {str(e)}"}), 500

# 게시물 목록 조회 (페이지네이션 고려) - 예시
@app.route('/posts', methods=['GET'])
def get_posts():
    if not db: return jsonify({"error": "데이터베이스 연결 실패"}), 500
    try:
        # 페이지네이션 파라미터 (예: /posts?limit=10&startAfter=DOCUMENT_ID)
        limit = int(request.args.get('limit', 10))
        start_after_doc_id = request.args.get('startAfter')

        posts_query = db.collection('posts').order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit)

        if start_after_doc_id:
            start_after_doc = db.collection('posts').document(start_after_doc_id).get()
            if start_after_doc.exists:
                posts_query = posts_query.start_after(start_after_doc)

        posts = []
        for doc in posts_query.stream():
            post_data = doc.to_dict()
            post_data['id'] = doc.id
            # created_at, updated_at을 문자열로 변환 (JSON 직렬화 가능하도록)
            if 'created_at' in post_data and hasattr(post_data['created_at'], 'isoformat'):
                 post_data['created_at'] = post_data['created_at'].isoformat()
            if 'updated_at' in post_data and hasattr(post_data['updated_at'], 'isoformat'):
                 post_data['updated_at'] = post_data['updated_at'].isoformat()
            posts.append(post_data)

        return jsonify(posts), 200

    except Exception as e:
        print(f"Error in get_posts: {e}")
        return jsonify({"error": f"게시물 조회 중 서버 오류 발생: {str(e)}"}), 500

# 식물 이미지 분석 (Vertex AI 연동)
@app.route('/analyze_plant_image', methods=['POST'])
@token_required # 인증된 사용자만 분석 요청 가능
def analyze_plant_image(current_user_uid):
    if not vision_client:
        return jsonify({"error": "Vertex AI Vision 클라이언트 초기화 실패"}), 500

    try:
        data = request.get_json()
        if not data or 'imageUrl' not in data:
            return jsonify({"error": "이미지 URL(imageUrl)은 필수입니다."}), 400

        image_url = data['imageUrl']

        # TODO: 이미지 URL이 Firebase Storage URL인지, 접근 권한이 있는지 등 검증 로직 추가 고려

        image = vision.Image()
        # GCS URI 또는 공개 URL 사용 가능
        # GCS URI 예시: "gs://{bucket_name}/{file_path}"
        # Firebase Storage URL을 GCS URI로 변환하거나, 공개 URL로 만들어야 할 수 있음
        # 또는 이미지 데이터를 직접 전송받는 방식도 고려 가능 (request.files)
        image.source.image_uri = image_url # 공개 접근 가능한 URL이어야 함

        # Vertex AI Vision API 호출 (예: 라벨 감지)
        # 실제 사용할 기능에 맞게 수정 필요 (예: AutoML 모델 예측, 객체 탐지 등)
        response = vision_client.label_detection(image=image)
        labels = response.label_annotations

        # 결과 파싱 (예시: 가장 확률 높은 라벨 이름 반환)
        plant_name = "식별 불가"
        if labels:
            # labels 리스트를 score 기준으로 정렬하여 가장 높은 것 선택 등 로직 추가
            plant_name = labels[0].description

        # 에러 처리
        if response.error.message:
             raise Exception(f"Vertex AI Vision API 오류: {response.error.message}")

        return jsonify({"plantName": plant_name, "analysis_details": [l.description for l in labels]}), 200

    except Exception as e:
        print(f"Error in analyze_plant_image: {e}")
        return jsonify({"error": f"이미지 분석 중 서버 오류 발생: {str(e)}"}), 500


# (기존 /verify_token 엔드포인트는 데코레이터 테스트용으로 남겨두거나 제거)
# @app.route('/verify_token', methods=['POST'])
# @token_required
# def verify_token_test(current_user_uid):
#     return jsonify({"uid": current_user_uid, "message": "인증 성공 (테스트)"}), 200


# Flask 앱 실행: 도서관 사서 창구를 열고 손님 대기하기
    # debug=True: 문제가 생기면 자세한 에러 메시지를 보여줘 (개발 중 유용)
    # host='0.0.0.0': 모든 네트워크에서 접근 가능 (로컬 네트워크의 다른 기기에서도 접속 가능)
    # port=5000: 5000번 문으로 열어 (포트 번호를 명확히 지정)
if __name__ == "__main__":
    # 프로덕션 환경에서는 Gunicorn 같은 WSGI 서버 사용 권장
    app.run(debug=os.getenv('FLASK_DEBUG', 'False') == 'True', host='0.0.0.0', port=int(os.getenv('PORT', 5000)))
    
