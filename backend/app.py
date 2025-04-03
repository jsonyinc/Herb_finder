import firebase_admin
from firebase_admin import credentials, firestore, auth, storage
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
from functools import wraps
import logging
from google.cloud import storage as gcs_storage
import requests
from urllib.parse import unquote
from google.cloud import translate_v2 as translate

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 환경변수 로드
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# 필수 환경 변수 확인
required_env_vars = {
    "SERVICE_ACCOUNT_KEY_PATH": os.getenv("SERVICE_ACCOUNT_KEY_PATH"),
    "FIREBASE_STORAGE_BUCKET_NAME": os.getenv("FIREBASE_STORAGE_BUCKET_NAME"),
    "PLANTNET_API_KEY": os.getenv("PLANTNET_API_KEY"),
    "GOOGLE_TRANSLATE_API_KEY": os.getenv("GOOGLE_TRANSLATE_API_KEY"),  # 추가
    "CORS_ALLOWED_ORIGINS": os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
}
for var_name, var_value in required_env_vars.items():
    if not var_value:
        logger.error(f"필수 환경 변수 {var_name}가 설정되지 않았습니다.")
        raise ValueError(f"환경 변수 {var_name}가 누락됐습니다.")

key_path = required_env_vars["SERVICE_ACCOUNT_KEY_PATH"]
bucket_name = required_env_vars["FIREBASE_STORAGE_BUCKET_NAME"]

# Flask 앱 초기화
app = Flask(__name__)
CORS(app, origins=required_env_vars["CORS_ALLOWED_ORIGINS"].split(','))

# Firebase Admin SDK 초기화
try:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred, {'storageBucket': bucket_name})
    db = firestore.client()
    bucket = storage.bucket()
    logger.info("Firebase Admin SDK 초기화 성공")
except Exception as e:
    logger.error(f"Firebase Admin SDK 초기화 실패: {e}")
    db = None
    bucket = None

# GCS 클라이언트 초기화
try:
    gcs_client = gcs_storage.Client.from_service_account_json(key_path)
    logger.info("GCS 클라이언트 초기화 성공")
except Exception as e:
    logger.error(f"GCS 클라이언트 초기화 실패: {e}")
    gcs_client = None

# Google Translate 클라이언트 초기화
try:
    translate_client = translate.Client()
    logger.info("Google Translate 클라이언트 초기화 성공")
except Exception as e:
    logger.error(f"Google Translate 클라이언트 초기화 실패: {e}")
    translate_client = None

# 인증 토큰 검증 데코레이터
def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            logger.error("인증 토큰이 제공되지 않았습니다.")
            return jsonify({"error": "인증 토큰이 필요합니다."}), 401
        try:
            decoded_token = auth.verify_id_token(token)
            logger.info(f"토큰 검증 성공: UID={decoded_token['uid']}")
            return f(*args, **kwargs, current_user_uid=decoded_token['uid'])
        except Exception as e:
            logger.error(f"토큰 검증 중 오류: {e}")
            return jsonify({"error": f"토큰 검증 중 오류 발생: {str(e)}"}), 500
    return decorated_function

# 루트 경로
@app.route('/')
def home():
    return "Herb Finder API에 오신 것을 환영합니다!"

# 사용자 생성 API (변경 없음)
@app.route('/create_user', methods=['POST'])
def create_user():
    if not db:
        return jsonify({"error": "데이터베이스 연결 실패"}), 500
    try:
        data = request.json
        if not data or not all(k in data for k in ['email', 'password', 'nickname']):
            return jsonify({"error": "이메일, 비밀번호, 닉네임은 필수입니다."}), 400

        user = auth.create_user(email=data['email'], password=data['password'])
        db.collection('users').document(user.uid).set({
            'nickname': data['nickname'],
            'avatar': data.get('avatar', ''),
            'email': data['email'],
            'created_at': firestore.SERVER_TIMESTAMP
        }, merge=True)
        logger.info(f"사용자 생성 성공: UID={user.uid}")
        return jsonify({"uid": user.uid, "message": "사용자 생성 성공"}), 201
    except Exception as e:
        logger.error(f"사용자 생성 중 오류: {e}")
        return jsonify({"error": f"사용자 생성 중 서버 오류 발생: {str(e)}"}), 500

# 게시물 생성 API (변경 없음)
@app.route('/posts', methods=['POST'])
@token_required
def create_post(current_user_uid):
    if not db:
        return jsonify({"error": "데이터베이스 연결 실패"}), 500
    try:
        data = request.get_json()
        required_fields = ['title', 'imageUrl', 'user_id']
        if not data or not all(field in data for field in required_fields):
            return jsonify({"error": "제목, 이미지 URL, 사용자 ID는 필수입니다."}), 400

        if data['user_id'] != current_user_uid:
            return jsonify({"error": "자신의 게시물만 생성할 수 있습니다."}), 403

        post_data = {
            'title': data['title'],
            'content': data.get('content', ''),
            'imageUrl': data['imageUrl'],
            'user_id': data['user_id'],
            'plantName': data.get('plantName', ''),
            'location': data.get('location'),
            'recipeLink': data.get('recipeLink', ''),
            'youtubeLink': data.get('youtubeLink', ''),
            'efficacy': data.get('efficacy', ''),
            'precautions': data.get('precautions', ''),
            'likesCount': 0,
            'commentsCount': 0,
            'created_at': firestore.SERVER_TIMESTAMP,
            'updated_at': firestore.SERVER_TIMESTAMP,
        }
        _, post_ref = db.collection('posts').add(post_data)
        logger.info(f"게시물 생성 성공: post_id={post_ref.id}")
        return jsonify({"post_id": post_ref.id, "message": "게시물 생성 성공"}), 201
    except Exception as e:
        logger.error(f"게시물 생성 중 오류: {e}")
        return jsonify({"error": f"게시물 생성 중 서버 오류 발생: {str(e)}"}), 500

# 게시물 목록 조회 API (변경 없음)
@app.route('/posts', methods=['GET'])
def get_posts():
    if not db:
        return jsonify({"error": "데이터베이스 연결 실패"}), 500
    try:
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
            if 'created_at' in post_data and hasattr(post_data['created_at'], 'isoformat'):
                post_data['created_at'] = post_data['created_at'].isoformat()
            if 'updated_at' in post_data and hasattr(post_data['updated_at'], 'isoformat'):
                post_data['updated_at'] = post_data['updated_at'].isoformat()
            posts.append(post_data)

        return jsonify(posts), 200
    except Exception as e:
        logger.error(f"게시물 조회 중 오류: {e}")
        return jsonify({"error": f"게시물 조회 중 서버 오류 발생: {str(e)}"}), 500

# 식물 이미지 분석 API
@app.route('/analyze_plant_image', methods=['POST'])
@token_required
def analyze_plant_image(current_user_uid):
    logger.info(f"analyze_plant_image 요청 수신: UID={current_user_uid}")
    if not bucket or not gcs_client or not translate_client:
        logger.error("서비스 초기화 실패: bucket, gcs_client 또는 translate_client가 None")
        return jsonify({"error": "서비스 초기화 실패"}), 500

    try:
        data = request.get_json()
        logger.info(f"요청 데이터: {data}")
        if not data or 'imageUrl' not in data:
            logger.error("이미지 URL이 누락됨")
            return jsonify({"error": "이미지 URL(imageUrl)은 필수입니다."}), 400

        image_url = data['imageUrl']
        if not image_url.startswith(f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/"):
            logger.error(f"유효하지 않은 URL: {image_url}")
            return jsonify({"error": "유효하지 않은 Firebase Storage URL입니다."}), 403

        blob_path = unquote(image_url.split(f"/o/")[1].split("?")[0])
        logger.info(f"추출된 blob_path: {blob_path}")
        blob = bucket.blob(blob_path)
        if not blob.exists():
            logger.error(f"이미지가 존재하지 않음: {blob_path}")
            return jsonify({"error": "이미지가 존재하지 않습니다."}), 404

        signed_url = blob.generate_signed_url(version="v4", expiration=3600, method="GET")
        logger.info(f"Signed URL 생성: {signed_url}")

        plantnet_api_key = os.getenv("PLANTNET_API_KEY")
        if not plantnet_api_key:
            logger.error("PlantNet API 키가 설정되지 않음")
            return jsonify({"error": "PlantNet API 키가 설정되지 않았습니다."}), 500

        api_url = "https://my-api.plantnet.org/v2/identify/all"
        params = {
            "api-key": plantnet_api_key,
            "images": [signed_url],
            "organs": ["auto"]
        }
        logger.info(f"PlantNet API 요청: {api_url}, params={params}")
        response = requests.get(api_url, params=params)
        response.raise_for_status()

        result = response.json()
        logger.info(f"PlantNet 응답: {result}")
        if result.get("results"):
            plant_name = result["results"][0]["species"]["scientificNameWithoutAuthor"]
            common_names = result["results"][0]["species"].get("commonNames", [])
            family = result["results"][0]["species"]["family"]["scientificNameWithoutAuthor"]
            
            # Google Translate로 한국어 번역
            common_names_kr = [translate_client.translate(name, target_language='ko')['translatedText'] 
                              for name in common_names if name.strip()]
            family_kr = translate_client.translate(family, target_language='ko')['translatedText']
        else:
            plant_name = "식별 불가"
            common_names_kr = []
            family_kr = ""

        logger.info(f"이미지 분석 성공: plantName={plant_name}")
        return jsonify({
            "plantName": plant_name,  # 학명은 번역 안 함
            "commonNames": common_names_kr,
            "family": family_kr
        }), 200

    except requests.exceptions.RequestException as e:
        logger.error(f"PlantNet API 요청 실패: {e}")
        return jsonify({"error": f"이미지 분석 중 오류 발생: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"이미지 분석 중 오류: {e}")
        return jsonify({"error": f"이미지 분석 중 서버 오류 발생: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=os.getenv('FLASK_DEBUG', 'True') == 'True', host='0.0.0.0', port=int(os.getenv('PORT', 5000)))