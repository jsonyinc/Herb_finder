import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // 인증 모듈 추가
import { getAnalytics } from "firebase/analytics";

// Firebase 콘솔에서 복사한 설정값 (프로젝트 설정 > 앱 추가 > 웹)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};
// const firebaseConfig = {
//     apiKey: "AIzaSyDXA-uxZnfynKOBck_J6-9o1Fs5uvVp9Pg",
//     authDomain: "elite-cascade-452009-h3.firebaseapp.com",
//     projectId: "elite-cascade-452009-h3",
//     storageBucket: "elite-cascade-452009-h3.firebasestorage.app",
//     messagingSenderId: "1050988738801",
//     appId: "1:1050988738801:web:65c1add0adc4e1c8865150",
//     measurementId: "G-QNMGKSHPV6"
//   };

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app); // 인증 객체 내보내기