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
import hashlib
from datetime import datetime

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
    "GOOGLE_TRANSLATE_API_KEY": os.getenv("GOOGLE_TRANSLATE_API_KEY"),
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
CORS(app, origins=required_env_vars["CORS_ALLOWED_ORIGINS"].split(','), supports_credentials=True)

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

# 한국 식물 DB API 호출 함수
def fetch_korean_plant_info(plant_name):
    try:
        api_url = "https://korean-plant-db.example.com/api/plants"  # 가상의 API URL
        params = {"query": plant_name, "lang": "kr"}
        response = requests.get(api_url, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
        return {
            "description_kr": data.get("description", ""),
            "image_url_kr": data.get("image_url", "")
        }
    except requests.RequestException as e:
        logger.error(f"한국 식물 DB API 오류: {e}")
        return {"description_kr": "", "image_url_kr": ""}

# 식물 정보 조회/저장 함수
def get_plant_info(plant_name):
    plant_ref = db.collection('plant_info').document(plant_name)
    plant_data = plant_ref.get()
    if plant_data.exists:
        logger.info(f"식물 정보 캐시 히트: {plant_name}")
        data = plant_data.to_dict()
        if 'updated_at' in data and hasattr(data['updated_at'], 'isoformat'):
            data['updated_at'] = data['updated_at'].isoformat()
        return data
    return None

def save_plant_info(plant_name, scientific_name, common_names, family):
    common_names_kr = [translate_client.translate(name, target_language='ko')['translatedText'] for name in common_names if name.strip()]
    family_kr = translate_client.translate(family, target_language='ko')['translatedText']
    
    korean_info = fetch_korean_plant_info(plant_name)
    
    plant_data = {
        'scientificName': scientific_name,
        'commonNames_kr': common_names_kr,
        'family_kr': family_kr,
        'description_kr': korean_info['description_kr'],
        'image_url_kr': korean_info['image_url_kr'],
        'updated_at': datetime.utcnow().isoformat()  # Sentinel 대신 현재 시간 사용
    }
    db.collection('plant_info').document(plant_name).set({
        **plant_data,
        'updated_at': firestore.SERVER_TIMESTAMP  # Firestore 저장용
    })
    return plant_data

# 캐싱 결과 가져오기 함수
def get_cached_result(image_url):
    cache_key = hashlib.sha256(image_url.encode()).hexdigest()
    cache_ref = db.collection('analysis_cache').document(cache_key)
    cached = cache_ref.get()
    if cached.exists:
        logger.info("캐시에서 결과 가져옴")
        data = cached.to_dict()
        if 'analyzed_at' in data and hasattr(data['analyzed_at'], 'isoformat'):
            data['analyzed_at'] = data['analyzed_at'].isoformat()
        return data
    return None

# 루트 경로
@app.route('/')
def home():
    return "Herb Finder API에 오신 것을 환영합니다!"

# 사용자 생성 API
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

# 게시물 생성 및 분석 통합 API
@app.route('/posts', methods=['POST'])
@token_required
def create_post(current_user_uid):
    if not db or not bucket or not gcs_client or not translate_client:
        logger.error("서비스 초기화 실패")
        return jsonify({"error": "서비스 초기화 실패"}), 500

    try:
        data = request.get_json()
        required_fields = ['title', 'imageUrl', 'user_id']
        if not data or not all(field in data for field in required_fields):
            return jsonify({"error": "제목, 이미지 URL, 사용자 ID는 필수입니다."}), 400

        if data['user_id'] != current_user_uid:
            return jsonify({"error": "자신의 게시물만 생성할 수 있습니다."}), 403

        image_url = data['imageUrl']
        blob_path = unquote(image_url.split(f"/o/")[1].split("?")[0])
        blob = bucket.blob(blob_path)
        if not blob.exists():
            return jsonify({"error": "이미지가 존재하지 않습니다."}), 404

        signed_url = blob.generate_signed_url(version="v4", expiration=3600, method="GET")
        plantnet_api_key = os.getenv("PLANTNET_API_KEY")
        if not plantnet_api_key:
            return jsonify({"error": "PlantNet API 키가 설정되지 않았습니다."}), 500

        api_url = "https://my-api.plantnet.org/v2/identify/all"
        params = {
            "api-key": plantnet_api_key,
            "images": [signed_url],
            "organs": ["auto"]
        }
        response = requests.get(api_url, params=params)
        response.raise_for_status()
        result = response.json()

        plant_name = "식별 불가"
        common_names_kr = []
        family_kr = ""
        if result.get("results"):
            plant_name = result["results"][0]["species"]["scientificNameWithoutAuthor"]
            common_names = result["results"][0]["species"].get("commonNames", [])
            family = result["results"][0]["species"]["family"]["scientificNameWithoutAuthor"]
            common_names_kr = [translate_client.translate(name, target_language='ko')['translatedText']
                               for name in common_names if name.strip()]
            family_kr = translate_client.translate(family, target_language='ko')['translatedText']

        post_data = {
            'title': data['title'],
            'content': data.get('content', ''),
            'imageUrl': data['imageUrl'],
            'user_id': current_user_uid,
            'plantName': plant_name,
            'commonNames_kr': common_names_kr,
            'family_kr': family_kr,
            'likesCount': 0,
            'commentsCount': 0,
            'created_at': datetime.utcnow().isoformat()
        }
        db.collection('posts').add({**post_data, 'created_at': firestore.SERVER_TIMESTAMP})
        return jsonify({"post_id": post_data['user_id'], "message": "게시물 생성 성공"}), 201
    except requests.RequestException as e:
        logger.error(f"PlantNet API 요청 실패: {e}")
        return jsonify({"error": f"이미지 분석 중 오류 발생: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"게시물 생성 중 오류: {e}")
        return jsonify({"error": f"게시물 생성 중 서버 오류 발생: {str(e)}"}), 500

# 분석 전용 API
@app.route('/analyze_plant_image', methods=['POST'])
def analyze_plant_image():
    try:
        data = request.get_json()
        if not data or 'imageUrl' not in data:
            return jsonify({"error": "이미지 URL(imageUrl)은 필수입니다."}), 400

        image_url = data['imageUrl']
        cached = get_cached_result(image_url)
        if cached:
            plant_name = cached['plantName']
            plant_info = get_plant_info(plant_name)
            if plant_info:
                return jsonify(plant_info), 200

        blob_path = unquote(image_url.split(f"/o/")[1].split("?")[0])
        blob = bucket.blob(blob_path)
        if not blob.exists():
            return jsonify({"error": "이미지가 존재하지 않습니다."}), 404

        signed_url = blob.generate_signed_url(version="v4", expiration=3600, method="GET")
        plantnet_api_key = os.getenv("PLANTNET_API_KEY")
        api_url = "https://my-api.plantnet.org/v2/identify/all"
        params = {"api-key": plantnet_api_key, "images": [signed_url], "organs": ["auto"]}
        response = requests.get(api_url, params=params)
        response.raise_for_status()
        result = response.json()

        if not result.get("results"):
            return jsonify({"plantName": "식별 불가", "commonNames_kr": [], "family_kr": "", "description_kr": "", "image_url_kr": ""}), 200

        plant_name = result["results"][0]["species"]["scientificNameWithoutAuthor"]
        common_names = result["results"][0]["species"].get("commonNames", [])
        family = result["results"][0]["species"]["family"]["scientificNameWithoutAuthor"]

        plant_info = get_plant_info(plant_name)
        if not plant_info:
            plant_info = save_plant_info(plant_name, plant_name, common_names, family)

        cache_key = hashlib.sha256(image_url.encode()).hexdigest()
        db.collection('analysis_cache').document(cache_key).set({
            'imageUrl': image_url,
            'plantName': plant_name,
            'analyzed_at': firestore.SERVER_TIMESTAMP
        })
        return jsonify(plant_info), 200
    except requests.RequestException as e:
        logger.error(f"PlantNet API 요청 실패: {e}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"분석 중 오류: {e}")
        return jsonify({"error": str(e)}), 500

# 전체 게시물 목록 조회 API
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
            posts.append(post_data)

        return jsonify(posts), 200
    except Exception as e:
        logger.error(f"게시물 조회 중 오류: {e}")
        return jsonify({"error": f"게시물 조회 중 서버 오류 발생: {str(e)}"}), 500

# 사용자별 게시물 조회 API
@app.route('/users/<user_id>/posts', methods=['GET'])
@token_required
def get_user_posts(user_id):
    try:
        posts_ref = db.collection('posts').where('user_id', '==', user_id)
        posts = posts_ref.get()
        posts_data = []
        for post in posts:
            post_data = post.to_dict()
            post_data['id'] = post.id
            if 'created_at' in post_data and hasattr(post_data['created_at'], 'isoformat'):
                post_data['created_at'] = post_data['created_at'].isoformat()
            posts_data.append(post_data)
        posts_data.sort(key=lambda x: x.get('created_at', 0), reverse=True)
        return jsonify(posts_data), 200
    except Exception as e:
        logger.error(f"사용자 게시물 조회 중 오류: {e}")
        return jsonify({"error": str(e)}), 500

# 좋아요 API
@app.route('/posts/<post_id>/like', methods=['POST'])
@token_required
def like_post(post_id, current_user_uid):
    if not db:
        return jsonify({"error": "데이터베이스 연결 실패"}), 500
    try:
        post_ref = db.collection('posts').document(post_id)
        post = post_ref.get()
        if not post.exists:
            logger.error(f"게시물 {post_id} 존재하지 않음")
            return jsonify({"error": "게시물이 존재하지 않습니다."}), 404
        
        like_ref = db.collection('likes').document(f"{current_user_uid}_{post_id}")
        if like_ref.get().exists:
            return jsonify({"message": "이미 좋아요를 눌렀습니다."}), 200
        
        post_ref.update({'likesCount': firestore.Increment(1)})
        like_ref.set({'user_id': current_user_uid, 'post_id': post_id, 'created_at': firestore.SERVER_TIMESTAMP})
        logger.info(f"좋아요 성공: post_id={post_id}, user_id={current_user_uid}")
        return jsonify({"message": "좋아요 성공"}), 200
    except Exception as e:
        logger.error(f"좋아요 처리 중 오류: {e}")
        return jsonify({"error": f"좋아요 처리 중 오류: {str(e)}"}), 500

# 댓글 추가 API
@app.route('/posts/<post_id>/comments', methods=['POST'])
@token_required
def add_comment(post_id, current_user_uid):
    data = request.get_json()
    if not data or 'content' not in data:
        return jsonify({"error": "댓글 내용이 필요합니다."}), 400
    comment_data = {
        'post_id': post_id,
        'user_id': current_user_uid,
        'content': data['content'],
        'created_at': firestore.SERVER_TIMESTAMP
    }
    _, comment_ref = db.collection('comments').add(comment_data)
    db.collection('posts').document(post_id).update({'commentsCount': firestore.Increment(1)})
    return jsonify({"comment_id": comment_ref.id, "message": "댓글 추가 성공"}), 201

if __name__ == "__main__":
    app.run(debug=os.getenv('FLASK_DEBUG', 'True') == 'True', host='0.0.0.0', port=int(os.getenv('PORT', 5000)))