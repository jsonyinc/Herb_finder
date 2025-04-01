import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from './firebaseConfig'; // storage, API_BASE_URL 은 PostForm 등에서 사용
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Auth from './components/Auth';
import PostForm from './components/PostForm';
import './App.css';

function App() {
  // --- 상태 변수들 ---
  const [users, setUsers] = useState({}); // 사용자 닉네임 등을 저장할 객체
  const [posts, setPosts] = useState([]); // 게시물 목록 배열
  const [currentUser, setCurrentUser] = useState(null); // 현재 로그인 사용자 정보
  const [authInitialized, setAuthInitialized] = useState(false); // Firebase Auth 초기화 완료 여부
  const [isLoadingUsers, setIsLoadingUsers] = useState(false); // 사용자 로딩 상태 (초기값 false로 변경 가능)
  const [isLoadingPosts, setIsLoadingPosts] = useState(false); // 게시물 로딩 상태 (초기값 false로 변경 가능)
  const [usersError, setUsersError] = useState(null); // 사용자 로딩 에러
  const [postsError, setPostsError] = useState(null); // 게시물 로딩 에러
  const [lastVisiblePost, setLastVisiblePost] = useState(null); // 페이지네이션: 마지막으로 로드된 게시물
  const [hasMorePosts, setHasMorePosts] = useState(true); // 페이지네이션: 더 로드할 게시물 존재 여부

  // --- 콜백 함수들 (useCallback으로 메모이제이션) ---

  // 사용자 ID로 닉네임 찾기
  const getUserNickname = useCallback((userId) => {
    return users[userId]?.nickname || '탐험가'; // 기본값 설정
  }, [users]); // users 상태가 변경될 때만 함수 재생성

  // Firestore에서 게시물 로드 (페이지네이션 적용)
  const loadPosts = useCallback(async (loadMore = false) => {
    setIsLoadingPosts(true);
    setPostsError(null);
    try {
      let postsQuery = query(
        collection(db, 'posts'),
        orderBy('created_at', 'desc'),
        limit(10) // 한 번에 10개 로드
      );

      // "더 보기" 로드 시: lastVisiblePost 상태값을 사용
      if (loadMore && lastVisiblePost) {
        postsQuery = query(postsQuery, startAfter(lastVisiblePost));
      }

      const documentSnapshots = await getDocs(postsQuery);
      const newPosts = documentSnapshots.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        // Firestore Timestamp를 JS Date 객체로 변환
        created_at: doc.data().created_at?.toDate ? doc.data().created_at.toDate() : null,
        updated_at: doc.data().updated_at?.toDate ? doc.data().updated_at.toDate() : null,
      }));

      // 마지막 문서 상태 업데이트
      const lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
      setLastVisiblePost(lastVisible); // 이 상태 업데이트는 loadPosts 함수 자체를 바꾸지 않음

      // 더 로드할 문서 있는지 확인
      setHasMorePosts(documentSnapshots.docs.length === 10);

      // 상태 업데이트: 초기 로드 or 추가 로드
      setPosts(prevPosts => loadMore ? [...prevPosts, ...newPosts] : newPosts);

    } catch (err) {
      console.error("Error loading posts:", err);
      setPostsError("게시물을 불러오는 중 오류가 발생했습니다.");
      // Firestore 권한 오류가 아닌 다른 오류일 수 있음 (네트워크 등)
      if (err.code === 'permission-denied') {
          setPostsError("게시물 읽기 권한이 없습니다. Firestore 규칙을 확인하세요.");
      }
    } finally {
      setIsLoadingPosts(false);
    }
  // lastVisiblePost는 함수 내부에서 상태 값을 직접 읽어 사용하므로 useCallback 의존성 배열에 불필요
  }, []); // 빈 배열: 함수 참조는 항상 동일하게 유지

  // Firestore에서 모든 사용자 정보 로드 (닉네임 표시용)
  const loadUsers = useCallback(async () => {
    // 이미 로딩 중이거나 에러가 있으면 중복 실행 방지 (선택적)
    // if (isLoadingUsers || usersError) return;
    setIsLoadingUsers(true);
    setUsersError(null);
    try {
      const usersCollection = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollection);
      const userMap = {};
      userSnapshot.forEach((doc) => {
          userMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setUsers(userMap);
    } catch (err) {
      console.error("Error loading users:", err);
      setUsersError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
       if (err.code === 'permission-denied') {
           setUsersError("사용자 정보 읽기 권한이 없습니다. Firestore 규칙을 확인하세요.");
       }
    } finally {
      setIsLoadingUsers(false);
    }
  }, []); // 빈 배열: 함수 참조는 항상 동일하게 유지

  // --- useEffect 훅들 ---

  // 1. 컴포넌트 마운트 시 Firebase 인증 상태 리스너 설정
  useEffect(() => {
    console.log("App Mounted: Setting up auth listener...");
    // onAuthStateChanged는 인증 상태 변경 시 콜백 함수를 실행
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // 이 콜백은 로그인, 로그아웃, 또는 초기 인증 상태 확인 시 실행됨
      console.log("Auth state changed detected:", user ? user.uid : null);
      setCurrentUser(user); // user 객체 또는 null로 상태 업데이트
      setAuthInitialized(true); // 인증 상태 확인 완료
    });

    // 클린업 함수: 컴포넌트 언마운트 시 리스너 제거 (메모리 누수 방지)
    return () => {
      console.log("App Unmounting: Cleaning up auth listener...");
      unsubscribeAuth();
    };
  }, []); // 빈 배열: 마운트 시 단 한 번만 실행

  // 2. 로그인/로그아웃 상태 변경 시 데이터 로딩 또는 초기화 실행
  useEffect(() => {
    // authInitialized가 true가 된 이후 (초기 인증 확인 후)에만 실행
    if (!authInitialized) return;

    console.log(`Auth status confirmed. User: ${currentUser ? currentUser.uid : 'null'}`);

    if (currentUser) {
      // 사용자가 로그인 상태일 때
      console.log("User is logged in. Loading initial data...");
      loadUsers(); // 사용자 정보 로드 (닉네임 등)
      loadPosts(false); // 게시물 첫 페이지 로드
    } else {
      // 사용자가 로그아웃 상태일 때
      console.log("User is logged out. Resetting user-specific state...");
      // 사용자 관련 상태 초기화
      setUsers({});
      setPosts([]);
      setLastVisiblePost(null);
      setHasMorePosts(true); // 더보기 버튼 초기화
      // 로딩/에러 상태도 초기화할 수 있음 (선택적)
      setIsLoadingUsers(false);
      setIsLoadingPosts(false);
      setUsersError(null);
      setPostsError(null);
    }
    // 이 effect는 currentUser나 authInitialized 상태가 변경될 때 실행됨
    // loadUsers와 loadPosts 함수는 useCallback으로 메모이징되어 참조가 안정적이므로,
    // 이 함수들이 변경되어 effect가 불필요하게 실행될 가능성은 낮음.
  }, [currentUser, authInitialized, loadUsers, loadPosts]);

  // --- 이벤트 핸들러 함수들 ---

  // 로그아웃 버튼 클릭 시
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // 상태 초기화는 위의 useEffect에서 처리하므로 여기서는 불필요
      alert('로그아웃되었습니다!');
    } catch (err) {
      console.error('Logout error:', err);
      alert(`로그아웃 중 오류 발생: ${err.message}`);
    }
  };

  // 새 게시물 작성 완료 시 (PostForm 컴포넌트에서 호출)
  const handlePostCreated = () => {
    console.log("New post created, reloading posts list...");
    setLastVisiblePost(null); // 페이지네이션 상태 초기화
    loadPosts(false); // 게시물 목록 새로고침 (첫 페이지부터)
  }

  // --- 렌더링 로직 ---

  // Firebase Auth 초기화 중일 때 로딩 표시 (초기 화면 깜빡임 방지)
  if (!authInitialized) {
    // TODO: 좀 더 보기 좋은 로딩 스피너 컴포넌트로 교체 가능
    return <div style={{ padding: '20px', textAlign: 'center' }}>인증 상태 확인 중...</div>;
  }

  // Auth 초기화 완료 후, 로그인 상태에 따라 다른 화면 렌더링
  return (
    <div className="App">
      {currentUser ? (
        // --- 로그인 후 화면 ---
        <>
          <header className="header">
            <h1>Herb Finder</h1>
            <div className="user-info">
              <span>{currentUser.email}</span>
              <button onClick={handleLogout} className="logout-button">
                로그아웃
              </button>
            </div>
          </header>

          {/* 게시물 작성 폼 */}
          <PostForm currentUser={currentUser} onPostCreated={handlePostCreated} />

          {/* 게시물 목록 섹션 */}
          <section className="posts-section">
            <h2>발견된 허브들</h2>

            {/* 사용자 로딩/에러 상태 (필요시 표시) */}
            {isLoadingUsers && <p>사용자 정보 로딩 중...</p>}
            {usersError && <p className="error-message">{usersError}</p>}

            {/* 게시물 로딩/에러 상태 */}
            {isLoadingPosts && posts.length === 0 && <p>게시물을 불러오는 중...</p>}
            {postsError && <p className="error-message">{postsError}</p>}
            {!isLoadingPosts && posts.length === 0 && !postsError && <p>아직 발견된 허브가 없어요. 첫 발견을 등록해보세요!</p>}

            {/* 게시물 목록 */}
            {posts.length > 0 && (
              <ul className="post-list">
                {posts.map((post) => (
                  <li key={post.id} className="post-item">
                    <h3>{post.title}</h3>
                    {post.imageUrl && (
                      <img
                        src={post.imageUrl}
                        alt={post.title}
                        className="post-image"
                        loading="lazy" // 이미지 지연 로딩
                      />
                    )}
                    {/* 식물 이름 및 내용 등 표시 */}
                    <p><strong>식물 이름:</strong> {post.plantName || '분석 정보 없음'}</p>
                    {post.content && <p>{post.content}</p>}
                    {/* ... 기타 정보 표시 (위치, 링크 등) ... */}
                    <p className="post-meta">
                      작성자: {getUserNickname(post.user_id)} |
                      작성일: {post.created_at ? post.created_at.toLocaleString() : 'N/A'}
                    </p>
                    {/* TODO: 댓글 컴포넌트 추가 위치 */}
                  </li>
                ))}
              </ul>
            )}

            {/* 페이지네이션: "더 보기" 버튼 */}
            <div className="pagination">
              {isLoadingPosts && posts.length > 0 && <p>더 많은 게시물을 불러오는 중...</p>}
              {hasMorePosts && !isLoadingPosts && posts.length > 0 && (
                <button onClick={() => loadPosts(true)} className="load-more-button">
                  더 보기
                </button>
              )}
              {!hasMorePosts && posts.length > 0 && <p>모든 게시물을 불러왔습니다.</p>}
            </div>
          </section>
        </>
      ) : (
        // --- 로그인 전 화면 ---
        <Auth /> // Auth 컴포넌트 (onLogin prop 없음)
      )}
    </div>
  );
}

export default App;