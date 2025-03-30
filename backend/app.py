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
            'created_at': firestore.SERVER_TIMESTAMP  # 지금 시간 자동으로
        })

        # 성공 응답: "잘 됐어요!"라는 메시지와 사용자 ID를 돌려줘요
        return jsonify({"uid": user.uid, "message": "사용자 생성 성공"}), 201

    except auth.EmailAlreadyExistsError:
        # 이미 존재하는 이메일: 중복 에러
        return jsonify({"error": "이미 존재하는 이메일입니다."}), 409  # 충돌 에러
    except auth.InvalidPasswordError:
        # 비밀번호가 잘못됨: 인증 에러
        return jsonify({"error": "비밀번호는 6자 이상이어야 합니다."}), 401  # 인증 실패 에러
    except Exception as e:
        # 기타 에러: 서버에서 문제가 생겼을 때
        return jsonify({"error": f"서버 오류: {str(e)}"}), 500  # 서버 에러
    
# 게시물 생성 엔드포인트
@app.route('/create_post', methods=['POST'])  # POST 요청을 받아 새로운 게시물 생성
def create_post():
    try:
        # 요청 데이터 받기: 클라이언트에서 보낸 JSON 데이터를 추출
        data = request.get_json()

        # 데이터 검증: 필수 필드(title, content, author, user_id)가 있는지 확인
        if not data or 'title' not in data or 'content' not in data or 'author' not in data or 'user_id' not in data:
            return jsonify({"error": "제목, 내용, 작성자, 사용자 ID는 필수입니다."}), 400

        # 사용자 존재 여부 확인: Firestore에서 user_id로 사용자 문서 조회
        user_ref = db.collection('users').document(data['user_id']).get()
        if not user_ref.exists:
            return jsonify({"error": "존재하지 않는 사용자입니다."}), 404

        # 게시물 데이터 준비: Firestore에 저장할 데이터 구성
        post_data = {
            'title': data['title'],  # 게시물 제목
            'content': data['content'],  # 게시물 내용
            'author': data['author'],  # 작성자 이름
            'user_id': data['user_id'],  # 작성자의 사용자 ID
            'created_at': firestore.SERVER_TIMESTAMP  # 서버 시간으로 생성 시간 기록
        }

        # Firestore에 게시물 저장: posts 컬렉션에 새 문서 추가
        post_ref = db.collection('posts').add(post_data)

        # 성공 응답: 생성된 게시물의 ID와 성공 메시지 반환
        return jsonify({"post_id": post_ref[1].id, "message": "게시물 생성 성공"}), 201

    except Exception as e:
        # 기타 에러 처리: 서버에서 발생한 오류를 클라이언트에 전달
        return jsonify({"error": f"서버 오류: {str(e)}"}), 500

# 인증 토큰 검증 API    
@app.route('/verify_token', methods=['POST'])
def verify_token():
    try:
        id_token = request.json.get('idToken')
        if not id_token:
            return jsonify({"error": "토큰이 필요합니다."}), 400

        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        return jsonify({"uid": uid, "message": "인증 성공"}), 200
    
    except Exception as e:
        return jsonify({"error": f"인증 실패: {str(e)}"}), 401


# Flask 앱 실행: 도서관 사서 창구를 열고 손님 대기하기
    # debug=True: 문제가 생기면 자세한 에러 메시지를 보여줘 (개발 중 유용)
    # host='0.0.0.0': 모든 네트워크에서 접근 가능 (로컬 네트워크의 다른 기기에서도 접속 가능)
    # port=5000: 5000번 문으로 열어 (포트 번호를 명확히 지정)
if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000) 
    
