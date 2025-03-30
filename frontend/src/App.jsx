import React, { useState, useEffect } from 'react';
import { db, auth } from './firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import Auth from './components/Auth';
import './App.css';


function App() {
  // 상태: 탐험가 리스트를 저장할 공간
  const [users, setUsers] = useState([]); // 탐험가 리스트 상태
  const [posts, setPosts] = useState([]); // 게시물 리스트 상태 
  const [currentUser, setCurrentUser] = useState(null); // 현재 로그인한 사용자 상태
 
  // Firestore 데이터 실시간 감지(가져오기) 및 인증 상태 관리
  useEffect(() => {

    // 인증 상태 감지: 로그인/로그아웃 시 상태 업데이트
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setPosts([]); // 로그아웃 시 게시물 리스트 초기화
      }
    });

    // Firestore에서 사용자("users") 데이터(책장)을 실시간으로 감시, 가져오기
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log("Firestore users data:", userList); // 디버깅 로그
      setUsers(userList);  // 탐험가 리스트 업데이트
    });

    // Firestore에서 게시물 데이터 실시간으로 가져오기 (로그인한 사용자만)
    let unsubscribePosts = null;
    if (currentUser) {
      unsubscribePosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
        const postList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
          }));
        console.log('Firestore posts data:', postList); // 디버깅 로그
        setPosts(postList);
      });
    }
    // 게시물 데이터 실시간으로 가져오기(위 수정내용의 원래 코드)
    // const unsubscribePosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
    //   const postList = snapshot.docs.map(doc => ({
    //     id: doc.id,
    //     ...doc.data()
    //   }));
    //   console.log("Firestore posts data:", postList); // 디버깅 로그
    //   setPosts(postList);
    // });

    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      unsubscribeAuth();
      unsubscribeUsers();
      if (unsubscribePosts) unsubscribePosts();
    };
    // // 컴포넌트가 사라질 때 감시 중지 (위 수정내용의 원래 코드)
    // return () => {
    //   unsubscribeUsers();
    //   unsubscribePosts();
    // };
  
  }, [currentUser]); // currentUser가 변경될 때마다 실행
  // 로그아웃 처리 함수
  const handleLogout = async () => {
    try {
      await auth.signOut();
      alert('로그아웃되었습니다!');
    } catch (err) {
      console.log('Logout error:', err);
      alert(`로그아웃 중 오류 발생: ${err.message}`);
    }
  };
  // 로그인 성공 시 호출되는 함수
  const handleLogin = (user) => {
    setCurrentUser(user);
  };
   // []); '위 [currentUser]);~~ 수정내용의 원래 코드'
  
   return (
    <div className="App">
      {currentUser ? (
        <>
          <div className="header">
            <h1>Herb Finder</h1>
            <button onClick={handleLogout} className="logout-button">
              로그아웃
            </button>
          </div>
          <h2>탐험가 리스트</h2>
          {users.length === 0 ? (
            <p>로딩 중...</p>
          ) : (
            <ul className="user-list">
              {users.map((user) => (
                <li key={user.id}>
                  {user.id} - 닉네임: {user.nickname} - 가입일: {user.created_at?.toDate().toLocaleString()}
                </li>
              ))}
            </ul>
          )}
          <h2>게시물 리스트</h2>
          {posts.length === 0 ? (
            <p>게시물이 없습니다.</p>
          ) : (
            <ul className="post-list">
              {posts.map((post) => (
                <li key={post.id}>
                  {post.id} - <strong>{post.title}</strong> by {post.author} on{' '}
                  {post.created_at?.toDate().toLocaleString()} - {post.content}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <Auth onLogin={handleLogin} />
      )}
    </div>
  );
}
export default App;

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