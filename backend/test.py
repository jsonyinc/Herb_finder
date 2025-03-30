#!/usr/bin/env python3
print("=== FIREBASE INIT TEST ===")

# 1. 기본 모듈 테스트
import os
from pathlib import Path
print("✓ 기본 모듈 임포트 완료")

# 2. .env 파일 확인
env_path = Path(__file__).parent / '.env'
print(f".env 경로: {env_path}")

if env_path.exists():
    print(f".env 파일 크기: {env_path.stat().st_size} bytes")
    with open(env_path) as f:
        print("파일 내용 첫 줄:", f.readline().strip())
else:
    print("✗ .env 파일 없음")

# 3. 환경 변수 로드
from dotenv import load_dotenv
load_dotenv(env_path)
print("✓ dotenv 로드 완료")

# 4. 서비스 계정 경로 확인
service_key = os.getenv("SERVICE_ACCOUNT_KEY_PATH")
print(f"SERVICE_ACCOUNT_KEY_PATH: {service_key}")

if service_key:
    key_path = Path(__file__).parent / service_key
    print(f"계정 키 절대 경로: {key_path}")
    print(f"파일 존재: {key_path.exists()}")
else:
    print("✗ 환경 변수 없음")

print("=== TEST COMPLETE ===")