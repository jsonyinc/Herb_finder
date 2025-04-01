import React, { useState } from 'react'; // useEffect 제거
import { auth } from '../firebaseConfig';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

// onLogin prop은 더 이상 받지 않음
const Auth = () => {
  // --- 상태 변수들 ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); // true: 회원가입 모드, false: 로그인 모드
  const [error, setError] = useState(''); // 에러 메시지 상태
  const [isLoading, setIsLoading] = useState(false); // 로딩 상태 추가 (버튼 비활성화용)

  // --- 이벤트 핸들러 ---

  // 로그인 또는 회원가입 처리
  const handleAuth = async () => {
    // 이전 에러 메시지 초기화 및 로딩 상태 시작
    setError('');
    setIsLoading(true);

    try {
      if (isSignUp) {
        // --- 회원가입 로직 ---
        await createUserWithEmailAndPassword(auth, email, password);
        alert('회원가입이 완료되었습니다! 이제 로그인해주세요.'); // 성공 메시지
        setIsSignUp(false); // 로그인 폼으로 자동 전환
        // setEmail(''); // 필요시 입력 필드 초기화
        // setPassword('');
      } else {
        // --- 로그인 로직 ---
        await signInWithEmailAndPassword(auth, email, password);
        // 로그인 성공 시 별도 처리 불필요 (onAuthStateChanged가 App.jsx에서 감지)
        // alert('로그인 성공!'); // 화면 전환으로 대체되므로 제거 또는 주석 처리
      }
      // 성공 시 로딩 상태 해제는 여기서 할 필요 없음 (컴포넌트가 언마운트될 수 있으므로)

    } catch (err) {
      // --- 에러 처리 ---
      console.error('Authentication error:', err.code, err.message); // 에러 코드와 메시지 로깅

      // 사용자 친화적인 한글 에러 메시지 설정
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('이미 사용 중인 이메일입니다.');
          break;
        case 'auth/invalid-email':
          setError('유효하지 않은 이메일 형식입니다.');
          break;
        case 'auth/wrong-password':
          setError('비밀번호가 틀렸습니다.');
          break;
        case 'auth/user-not-found':
          setError('등록되지 않은 사용자입니다. 회원가입을 진행해주세요.');
          break;
        case 'auth/weak-password':
          setError('비밀번호는 6자리 이상이어야 합니다.');
          break;
        case 'auth/operation-not-allowed':
          setError('이메일/비밀번호 로그인이 활성화되지 않았습니다.'); // Firebase 콘솔 설정 확인 필요
          break;
        default:
          setError('인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
          break;
      }
      setIsLoading(false); // 에러 발생 시 로딩 상태 해제
    }
    // finally 블록을 사용하여 로딩 상태를 해제할 수도 있습니다.
    // finally {
    //   setIsLoading(false);
    // }
  };

  // 로그인 <-> 회원가입 모드 전환
  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp); // 모드 반전
    setError(''); // 모드 전환 시 에러 메시지 초기화
    // setEmail(''); // 필요시 입력 필드 초기화
    // setPassword('');
  };


  // --- 렌더링 로직 ---
  return (
    <div className="auth-container">
      <h2>{isSignUp ? '회원가입' : '로그인'}</h2>

      {/* 에러 메시지 표시 */}
      {error && <p className="error-message">{error}</p>}

      {/* 이메일 입력 */}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일 주소"
        className="auth-input"
        required // HTML 기본 유효성 검사
        disabled={isLoading} // 로딩 중 비활성화
      />

      {/* 비밀번호 입력 */}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={isSignUp ? "비밀번호 (6자리 이상)" : "비밀번호"} // 모드에 따라 placeholder 변경
        className="auth-input"
        required
        minLength={isSignUp ? 6 : undefined} // 회원가입 시 최소 길이 검사
        disabled={isLoading} // 로딩 중 비활성화
      />

      {/* 로그인/회원가입 버튼 */}
      <button onClick={handleAuth} className="auth-button" disabled={isLoading}>
        {isLoading ? '처리 중...' : (isSignUp ? '가입하기' : '로그인')}
      </button>

      {/* 모드 전환 버튼 */}
      <button onClick={toggleAuthMode} className="toggle-button" disabled={isLoading}>
        {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
      </button>
    </div>
  );
};

export default Auth;