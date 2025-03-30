import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // 인증 모듈 추가
import { getStorage } from 'firebase/storage'; // Storage 모듈 추가
import { getAnalytics } from "firebase/analytics";

// Firebase 콘솔에서 복사한 설정값 (프로젝트 설정 > 앱 추가 > 웹)
// Vite 환경 변수에서 Firebase 설정값 읽기
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};


// Firebase 초기화
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);


export const db = getFirestore(app);
export const auth = getAuth(app); // 인증 객체 내보내기
export const storage = getStorage(app); // Storage 객체 내보내기
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; // API 기본 URL 내보내기