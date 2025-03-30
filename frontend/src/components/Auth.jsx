import React, { useState } from 'react';
import { auth } from '../firebaseConfig';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';


const Auth = ({ onLogin }) => {
  // 상태 관리: 이메일, 비밀번호, 회원가입/로그인 모드, 에러 메시지
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  // 로그인/회원가입 처리 함수
  const handleAuth = async () => {
    try {
      if (isSignUp) {
        // 회원가입: Firebase Authentication으로 사용자 생성
        await createUserWithEmailAndPassword(auth, email, password);
        alert('회원가입이 완료되었습니다!');
      } else {
        // 로그인: Firebase Authentication으로 로그인
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        onLogin(userCredential.user); // 로그인 성공 시 상위 컴포넌트에 사용자 정보 전달
        alert('로그인에 성공했습니다!');
      }
      setError(''); // 에러 초기화
    } catch (err) {
      console.log('Authentication error:', err); // 디버깅용 로그
      // 예외 처리: 한글 에러 메시지로 사용자 친화적으로 표시
      if (err.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 이메일입니다.');
      } else if (err.code === 'auth/invalid-email') {
        setError('유효하지 않은 이메일 형식입니다.');
      } else if (err.code === 'auth/wrong-password') {
        setError('비밀번호가 틀렸습니다.');
      } else if (err.code === 'auth/user-not-found') {
        setError('등록되지 않은 사용자입니다.');
      } else {
        setError(`오류: ${err.message}`);
      }
    }
  };

  return (
    <div className="auth-container">
      <h2>{isSignUp ? '회원가입' : '로그인'}</h2>
      {error && <p className="error-message">{error}</p>}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일"
        className="auth-input"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="비밀번호"
        className="auth-input"
      />
      <button onClick={handleAuth} className="auth-button">
        {isSignUp ? '회원가입' : '로그인'}
      </button>
      <button onClick={() => setIsSignUp(!isSignUp)} className="toggle-button">
        {isSignUp ? '로그인으로 전환' : '회원가입으로 전환'}
      </button>
    </div>
  );
};
export default Auth;
