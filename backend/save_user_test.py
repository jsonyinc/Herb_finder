import firebase_admin
from firebase_admin import credentials, firestore

# 도서관 열쇠로 문을 열기
cred = credentials.Certificate("serviceAccountKey.json")  # 열쇠 파일 경로
firebase_admin.initialize_app(cred)  # "도서관, 문 열어!"
db = firestore.client()  # 도서관 안으로 들어가기

# "식물러버"라는 탐험가를 users 책장에 등록하기
db.collection("users").document("user123").set({
    "nickname": "식물러버",  # 탐험가 이름
    "avatar": "https://example.com/plantlover.jpg",  # 사진 URL (가짜로 넣음)
    "created_at": firestore.SERVER_TIMESTAMP  # 지금 시간 자동으로
})
print("식물러버가 도서관에 저장됐어요!")



