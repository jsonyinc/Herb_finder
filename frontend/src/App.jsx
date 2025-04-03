import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from './firebaseConfig'; // storage, API_BASE_URL은 PostForm 등에서 사용
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Auth from './components/Auth';
import PostForm from './components/PostForm';
import './App.css';

// 스켈레톤 UI 컴포넌트 (간단한 예시)
const SkeletonPost = () => (
  <div className="post-item skeleton">
    <div className="skeleton-title"></div>
    <div className="skeleton-image"></div>
    <div className="skeleton-content"></div>
    <div className="skeleton-meta"></div>
  </div>
);

function App() {
    const [users, setUsers] = useState({});
    const [posts, setPosts] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [authInitialized, setAuthInitialized] = useState(false);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [isLoadingPosts, setIsLoadingPosts] = useState(false);
    const [usersError, setUsersError] = useState(null);
    const [postsError, setPostsError] = useState(null);
    const [lastVisiblePost, setLastVisiblePost] = useState(null);
    const [hasMorePosts, setHasMorePosts] = useState(true);
  
    const getUserNickname = useCallback((userId) => {
      return users[userId]?.nickname || '탐험가';
    }, [users]);
  
    const loadPosts = useCallback(async (loadMore = false) => {
      setIsLoadingPosts(true);
      setPostsError(null);
      try {
        let postsQuery = query(
          collection(db, 'posts'),
          orderBy('created_at', 'desc'),
          limit(10)
        );
        if (loadMore && lastVisiblePost) {
          postsQuery = query(postsQuery, startAfter(lastVisiblePost));
        }
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Firestore 응답 시간 초과")), 5000)
        );
        const postsPromise = getDocs(postsQuery);
        const documentSnapshots = await Promise.race([postsPromise, timeoutPromise]);
        const newPosts = documentSnapshots.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          created_at: doc.data().created_at?.toDate ? doc.data().created_at.toDate() : null,
          updated_at: doc.data().updated_at?.toDate ? doc.data().updated_at.toDate() : null,
        }));
        setLastVisiblePost(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
        setHasMorePosts(documentSnapshots.docs.length === 10);
        setPosts((prevPosts) => (loadMore ? [...prevPosts, ...newPosts] : newPosts));
      } catch (err) {
        console.error("Error loading posts:", err);
        setPostsError(
          err.message === "Firestore 응답 시간 초과"
            ? "게시물 로딩이 너무 느립니다. 네트워크를 확인하세요."
            : "게시물을 불러오는 중 오류가 발생했습니다."
        );
        if (err.code === 'permission-denied') {
          setPostsError("게시물 읽기 권한이 없습니다. Firestore 규칙을 확인하세요.");
        }
      } finally {
        setIsLoadingPosts(false);
      }
    }, [lastVisiblePost]);
  
    const loadUsers = useCallback(async () => {
      console.log("loadUsers 호출 시작");
      setIsLoadingUsers(true);
      setUsersError(null);
      try {
        const usersCollection = collection(db, 'users');
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Firestore 응답 시간 초과")), 5000)
        );
        const userPromise = getDocs(usersCollection);
        const userSnapshot = await Promise.race([userPromise, timeoutPromise]);
        const userMap = {};
        userSnapshot.forEach((doc) => {
          userMap[doc.id] = { id: doc.id, ...doc.data() };
        });
        setUsers(userMap);
      } catch (err) {
        console.error("Error loading users:", err);
        setUsersError(
          err.message === "Firestore 응답 시간 초과"
            ? "사용자 정보 로딩이 너무 느립니다. 네트워크를 확인하세요."
            : "사용자 정보를 불러오는 중 오류가 발생했습니다."
        );
        if (err.code === 'permission-denied') {
          setUsersError("사용자 정보 읽기 권한이 없습니다. Firestore 규칙을 확인하세요.");
        }
      } finally {
        setIsLoadingUsers(false);
        console.log("loadUsers 호출 완료");
      }
    }, []);
  
    useEffect(() => {
      const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        setAuthInitialized(true);
      });
      return () => unsubscribeAuth();
    }, []);
  
    useEffect(() => {
      if (!authInitialized) return;
      if (currentUser) {
        loadUsers();
        loadPosts(false);
      } else {
        setUsers({});
        setPosts([]);
        setLastVisiblePost(null);
        setHasMorePosts(true);
        setIsLoadingUsers(false);
        setIsLoadingPosts(false);
        setUsersError(null);
        setPostsError(null);
      }
    }, [currentUser, authInitialized]);
  

  // --- 이벤트 핸들러 함수들 ---

  const handleLogout = async () => {
    try {
      await signOut(auth);
      alert('로그아웃되었습니다!');
    } catch (err) {
      console.error('Logout error:', err);
      setPostsError(`로그아웃 중 오류 발생: ${err.message}`);
    }
  };

  const handlePostCreated = () => {
    setLastVisiblePost(null);
    loadPosts(false);
  };

  // --- 렌더링 로직 ---

  if (!authInitialized) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>인증 상태 확인 중...</div>;
  }

  return (
    <div className="App">
      {currentUser ? (
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

          <PostForm currentUser={currentUser} onPostCreated={handlePostCreated} />

          <section className="posts-section">
            <h2>발견된 허브들</h2>

            {isLoadingUsers && <p>사용자 정보 로딩 중...</p>}
            {usersError && <p className="error-message">{usersError}</p>}

            {isLoadingPosts && posts.length === 0 && (
              <div className="skeleton-list">
                {Array.from({ length: 5 }).map((_, index) => (
                  <SkeletonPost key={index} />
                ))}
              </div>
            )}
            {postsError && <p className="error-message">{postsError}</p>}
            {!isLoadingPosts && posts.length === 0 && !postsError && (
              <p>아직 발견된 허브가 없어요. 첫 발견을 등록해보세요!</p>
            )}

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
                        loading="lazy"
                      />
                    )}
                    <p><strong>식물 이름:</strong> {post.plantName || '분석 정보 없음'}</p>
                    {post.content && <p>{post.content}</p>}
                    <p className="post-meta">
                      작성자: {getUserNickname(post.user_id)} | 작성일:{' '}
                      {post.created_at ? post.created_at.toLocaleString() : 'N/A'}
                    </p>
                  </li>
                ))}
              </ul>
            )}

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
        <Auth />
      )}
    </div>
  );
}

export default App;