import React, { useState, useEffect, useCallback } from 'react';
import { db, auth, storage, API_BASE_URL } from './firebaseConfig'; // storage, API_BASE_URL 추가
import { collection, onSnapshot, query, orderBy, limit, startAfter, getDocs, doc, getDoc } from 'firebase/firestore'; // Firestore 쿼리 함수 추가
import { onAuthStateChanged, signOut } from 'firebase/auth'; // signOut 임포트
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // Storage 함수 (ImageUpload 컴포넌트에서 사용)
import Auth from './components/Auth';
import PostForm from './components/PostForm'; // 게시물 작성 폼 컴포넌트 (분리 추천)
import './App.css';


function App() {
  // 상태 변수들
  const [users, setUsers] = useState({}); // 사용자(탐험가) 목록 (ID를 key로 하는 객체로 관리하면 조회 용이)
  const [posts, setPosts] = useState([]); // 게시물 리스트 상ㅐ
  const [currentUser, setCurrentUser] = useState(null); // 현재 로그인한 사용자 상태
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [postsError, setPostsError] = useState(null);
  const [lastVisiblePost, setLastVisiblePost] = useState(null); // 페이지네이션용 마지막 문서
  const [hasMorePosts, setHasMorePosts] = useState(true); // 더 로드할 게시물이 있는지 여부

  // 사용자 닉네임 가져오기 함수 (메모이제이션 고려)
  const getUserNickname = useCallback((userId) => {
    return users[userId]?.nickname || '알 수 없음';
  }, [users]);
  
  // Firestore 데이터 로드 함수 (페이지네이션 적용)
  const loadPosts = useCallback(async (loadMore = false) => {
    if (!currentUser) return; // 로그인하지 않았으면 로드하지 않음
    setIsLoadingPosts(true);
    setPostsError(null);

    try {
      let postsQuery = query(
        collection(db, 'posts'),
        orderBy('created_at', 'desc'),
        limit(10) // 한 번에 10개씩 로드
      );

      // "더 보기" 클릭 시 마지막 문서 다음부터 로드
      if (loadMore && lastVisiblePost) {
        postsQuery = query(postsQuery, startAfter(lastVisiblePost));
      }

      const documentSnapshots = await getDocs(postsQuery);

      const newPosts = documentSnapshots.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        // Firestore 타임스탬프를 JavaScript Date 객체로 변환 (필요시)
        created_at: doc.data().created_at?.toDate ? doc.data().created_at.toDate() : null,
        updated_at: doc.data().updated_at?.toDate ? doc.data().updated_at.toDate() : null,
      }));

      // 마지막 문서 업데이트
      const lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
      setLastVisiblePost(lastVisible);

      // 더 로드할 문서가 있는지 확인
      setHasMorePosts(documentSnapshots.docs.length === 10); // limit 개수와 같으면 더 있을 가능성 있음

      // 기존 게시물 목록에 새 게시물 추가 또는 초기 로드
      setPosts(prevPosts => loadMore ? [...prevPosts, ...newPosts] : newPosts);

    } catch (err) {
      console.error("Error loading posts:", err);
      setPostsError("게시물을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoadingPosts(false);
    }
  }, [currentUser, lastVisiblePost]); // currentUser와 lastVisiblePost가 변경될 때 함수 재생성

  // 사용자 데이터 로드 (한 번 또는 필요시)
  const loadUsers = useCallback(async () => {
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
      } finally {
        setIsLoadingUsers(false);
      }
  }, []);

  // 인증 상태 및 Firestore 데이터 실시간 감지(가져오기) & 초기 데이터 로드
  useEffect(() => {
    // 인증 상태 감지: 로그인/로그아웃 시 상태 업데이트
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        // 로그인 시 사용자 정보 및 게시물 로드
        loadUsers(); // 사용자 정보 로드
        loadPosts(false); // 게시물 초기 로드
      } else {
        // 로그아웃 시 상태 초기화
        setUsers({});
        setPosts([]); // 로그아웃 시 게시물 리스트 초기화
        setLastVisiblePost(null);
        setHasMorePosts(true);
        setIsLoadingUsers(true); // 로딩 상태 초기화
        setIsLoadingPosts(true);
      }
    });
 
    // 클린업 함수
    return () => unsubscribeAuth();
  }, [loadUsers, loadPosts]); // loadUsers, loadPosts 의존성 추가

    // 로그아웃 처리
    const handleLogout = async () => {
      try {
        await signOut(auth); // 수정: auth.signOut() -> signOut(auth)
        alert('로그아웃되었습니다!');
      } catch (err) {
        console.error('Logout error:', err); // 수정: console.log -> console.error
        alert(`로그아웃 중 오류 발생: ${err.message}`);
      }
    };

    // 로그인 성공 시 호출 (Auth 컴포넌트에서 호출)
    const handleLogin = (user) => {
      // onAuthStateChanged가 자동으로 처리하므로 명시적 호출 불필요할 수 있음
      // setCurrentUser(user);
      // loadPosts(false); // 필요시 여기서 즉시 로드
      // loadUsers();
    };

    // 게시물 생성 후 목록 새로고침 (PostForm에서 호출)
    const handlePostCreated = () => {
      setLastVisiblePost(null); // 페이지네이션 초기화
      loadPosts(false); // 목록 새로고침
    }

    return (
      <div className="App">
        {currentUser ? (
          <>
            <div className="header">
              <h1>Herb Finder</h1>
              <button onClick={handleLogout} className="logout-button">
                로그아웃 ({currentUser.email})
              </button>
            </div>
  
            {/* 게시물 작성 폼 컴포넌트 */}
            <PostForm currentUser={currentUser} onPostCreated={handlePostCreated} />
  
            {/* <h2>탐험가 리스트 (디버깅용 또는 관리자용)</h2>
            {isLoadingUsers && <p>사용자 로딩 중...</p>}
            {usersError && <p className="error-message">{usersError}</p>}
            {!isLoadingUsers && !usersError && (
              <ul className="user-list">
                {Object.values(users).map((user) => (
                  <li key={user.id}>
                    {user.id} - 닉네임: {user.nickname} - 가입일: {user.created_at?.toDate ? user.created_at.toDate().toLocaleString() : 'N/A'}
                  </li>
                ))}
              </ul>
            )} */}
  
            <h2>발견된 허브들</h2>
            {isLoadingPosts && posts.length === 0 && <p>게시물 로딩 중...</p>} {/* 초기 로딩 */}
            {postsError && <p className="error-message">{postsError}</p>}
            {!isLoadingPosts && posts.length === 0 && !postsError && <p>아직 발견된 허브가 없어요!</p>}
  
            {posts.length > 0 && (
              <ul className="post-list">
                {posts.map((post) => (
                  <li key={post.id}>
                    <h3>{post.title}</h3>
                    {post.imageUrl && <img src={post.imageUrl} alt={post.title} style={{maxWidth: '100%', height: 'auto', marginBottom: '10px'}} />}
                    <p><strong>식물 이름:</strong> {post.plantName || '분석 정보 없음'}</p>
                    <p>{post.content}</p>
                    {/* 추가 정보 표시 */}
                    {post.location && <p><strong>발견 위치:</strong> 위도 {post.location?.latitude}, 경도 {post.location?.longitude}</p>}
                    {post.recipeLink && <p><strong>레시피:</strong> <a href={post.recipeLink} target="_blank" rel="noopener noreferrer">링크 보기</a></p>}
                    {/* ... 기타 필드 표시 */}
                    <p style={{fontSize: '0.9em', color: '#555'}}>
                      작성자: {getUserNickname(post.user_id)} ({post.created_at ? post.created_at.toLocaleString() : 'N/A'})
                    </p>
                    {/* 댓글 기능 추가 위치 */}
                  </li>
                ))}
              </ul>
            )}
  
            {/* "더 보기" 버튼 */}
            {isLoadingPosts && posts.length > 0 && <p>게시물 로딩 중...</p>} {/* 추가 로딩 */}
            {hasMorePosts && !isLoadingPosts && (
              <button onClick={() => loadPosts(true)} className="load-more-button">
                더 보기
              </button>
            )}
            {!hasMorePosts && posts.length > 0 && <p>모든 게시물을 불러왔습니다.</p>}
  
          </>
        ) : (
        // 임시 제거  <Auth onLogin={handleLogin} />
        <Auth /> // 임시 추가
        )}
      </div>
    );
  }
  
  export default App;

    // // Firestore에서 사용자("users") 데이터(책장)을 실시간으로 감시, 가져오기
    // const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
    //   const userList = snapshot.docs.map(doc => ({
    //     id: doc.id,
    //     ...doc.data()
    //   }));
    //   console.log("Firestore users data:", userList); // 디버깅 로그
    //   setUsers(userList);  // 탐험가 리스트 업데이트
    // });

    // // Firestore에서 게시물 데이터 실시간으로 가져오기 (로그인한 사용자만)
    // let unsubscribePosts = null;
    // if (currentUser) {
    //   unsubscribePosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
    //     const postList = snapshot.docs.map((doc) => ({
    //       id: doc.id,
    //       ...doc.data()
    //       }));
    //     console.log('Firestore posts data:', postList); // 디버깅 로그
    //     setPosts(postList);
    //   });
    // }
    // 게시물 데이터 실시간으로 가져오기(위 수정내용의 원래 코드)
    // const unsubscribePosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
    //   const postList = snapshot.docs.map(doc => ({
    //     id: doc.id,
    //     ...doc.data()
    //   }));
    //   console.log("Firestore posts data:", postList); // 디버깅 로그
    //   setPosts(postList);
    // });

    // // 컴포넌트 언마운트 시 구독 해제
    // return () => {
    //   unsubscribeAuth();
    //   unsubscribeUsers();
    //   if (unsubscribePosts) unsubscribePosts();
    // };
    // // 컴포넌트가 사라질 때 감시 중지 (위 수정내용의 원래 코드)
    // return () => {
    //   unsubscribeUsers();
    //   unsubscribePosts();
    // };
  
  // }, [currentUser]); // currentUser가 변경될 때마다 실행
  // // 로그아웃 처리 함수
  // const handleLogout = async () => {
  //   try {
  //     await auth.signOut();
  //     alert('로그아웃되었습니다!');
  //   } catch (err) {
  //     console.log('Logout error:', err);
  //     alert(`로그아웃 중 오류 발생: ${err.message}`);
  //   }
  // };
  // 로그인 성공 시 호출되는 함수
  // const handleLogin = (user) => {
  //   setCurrentUser(user);
  // };
   // []); '위 [currentUser]);~~ 수정내용의 원래 코드'
  
//    return (
//     <div className="App">
//       {currentUser ? (
//         <>
//           <div className="header">
//             <h1>Herb Finder</h1>
//             <button onClick={handleLogout} className="logout-button">
//               로그아웃
//             </button>
//           </div>
//           <h2>탐험가 리스트</h2>
//           {users.length === 0 ? (
//             <p>로딩 중...</p>
//           ) : (
//             <ul className="user-list">
//               {users.map((user) => (
//                 <li key={user.id}>
//                   {user.id} - 닉네임: {user.nickname} - 가입일: {user.created_at?.toDate().toLocaleString()}
//                 </li>
//               ))}
//             </ul>
//           )}
//           <h2>게시물 리스트</h2>
//           {posts.length === 0 ? (
//             <p>게시물이 없습니다.</p>
//           ) : (
//             <ul className="post-list">
//               {posts.map((post) => (
//                 <li key={post.id}>
//                   {post.id} - <strong>{post.title}</strong> by {post.author} on{' '}
//                   {post.created_at?.toDate().toLocaleString()} - {post.content}
//                 </li>
//               ))}
//             </ul>
//           )}
//         </>
//       ) : (
//         <Auth onLogin={handleLogin} />
//       )}
//     </div>
//   );
// }
// export default App;

//  위 return 수정내용의 원래 코드
//   return (
//     <div className="App">
//       <h1>위치기반 식물 커뮤니티</h1>
//         {/* 탐험가 리스트 */}
//         <h2>탐험가 리스트</h2>
//         {users.length === 0 ? (
//           <p>탐험가가 없습니다.</p>
//         ) : (
//           <ul>
//             {users.map(user => (
//               <li key={user.id}>
//                 {user.nickname} (가입: {user.created_at?.toDate().toLocaleString()})
//               </li>
//             ))}
//           </ul>
//         )}
//         {/* 게시물 리스트 */}
//         <h2>게시물 리스트</h2>
//         {posts.length === 0 ? (
//           <p>게시물이 없습니다.</p>
//         ) : (
//           <ul>
//             {posts.map(post => (
//               <li key={post.id}>
//                 <strong>{post.title}</strong> by {post.author} (작성: {post.created_at?.toDate().toLocaleString()})
//                 <p>{post.content}</p>
//               </li>
//             ))}
//           </ul>
//         )}
//     </div>
//   );
// }

// export default App;