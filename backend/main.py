# Cloud Functions에서 Flask 앱을 로드하기 위한 진입점 파일
from app import app as application # app.py에서 Flask app 객체를 application이라는 이름으로 임포트

# Cloud Functions는 'application'이라는 이름의 객체를 찾아서 실행합니다.
# 특별한 추가 코드는 일반적으로 필요하지 않습니다.
# 필요한 경우 여기서 추가적인 초기화나 설정을 할 수 있습니다.

# 예: 애플리케이션 컨텍스트 설정 등 (필요한 경우)
# with application.app_context():
#    pass