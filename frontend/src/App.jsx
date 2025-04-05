import React, { useState, useEffect, useCallback } from 'react';
import { db, auth, storage } from './firebaseConfig';
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { BrowserRouter as Router, Route, Routes, Link, Navigate } from 'react-router-dom';
import './App.css';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Card,
  CardMedia,
  CardContent,
  Grid,
  Box,
  createTheme,
  ThemeProvider,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField as MuiTextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import Footer from './components/Footer.jsx';

const theme = createTheme({
  palette: {
    primary: { main: '#4caf50' },
    secondary: { main: '#ff5722' },
  },
});

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [lastVisiblePost, setLastVisiblePost] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [openLoginDialog, setOpenLoginDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/posts?limit=10`);
      if (!response.ok) throw new Error('게시물 로드 실패');
      const newPosts = await response.json();
      setPosts(newPosts);
      setLastVisiblePost(newPosts.length > 0 ? newPosts[newPosts.length - 1].id : null);
      setHasMorePosts(newPosts.length === 10);
    } catch (err) {
      console.error('게시물 로드 오류:', err);
    }
  }, []);

  const loadMorePosts = useCallback(async () => {
    if (!hasMorePosts || !lastVisiblePost) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/posts?limit=10&startAfter=${lastVisiblePost}`
      );
      if (!response.ok) throw new Error('추가 게시물 로드 실패');
      const newPosts = await response.json();
      setPosts((prevPosts) => [...prevPosts, ...newPosts]);
      setLastVisiblePost(newPosts.length > 0 ? newPosts[newPosts.length - 1].id : null);
      setHasMorePosts(newPosts.length === 10);
    } catch (err) {
      console.error('추가 게시물 로드 오류:', err);
    }
  }, [hasMorePosts, lastVisiblePost]);

  useEffect(() => {
    if (currentUser) loadPosts();
  }, [currentUser, loadPosts]);

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setOpenLoginDialog(false);
    } catch (err) {
      console.error('로그인 오류:', err);
      alert('로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setOpenLoginDialog(false);
    } catch (err) {
      console.error('구글 로그인 오류:', err);
      alert('구글 로그인에 실패했습니다.');
    }
  };

  const PrivateRoute = ({ element }) => {
    return currentUser ? element : <Navigate to="/" state={{ showLogin: true }} />;
  };

  return (
    <ThemeProvider theme={theme}>
      <Router>
        <AppBar position="static" color="primary">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              허브 파인더
            </Typography>
            {currentUser ? (
              <>
                <Typography variant="body1" sx={{ marginRight: 2 }}>
                  {currentUser.email}
                </Typography>
                <Button color="secondary" onClick={handleLogout}>
                  로그아웃
                </Button>
              </>
            ) : (
              <Button color="secondary" onClick={() => setOpenLoginDialog(true)}>
                로그인
              </Button>
            )}
          </Toolbar>
        </AppBar>

        <Container sx={{ mt: 4, mb: 4 }}>
          <Routes>
            <Route
              path="/"
              element={<LandingPage currentUser={currentUser} onLoginRequested={() => setOpenLoginDialog(true)} />}
            />
            <Route
              path="/results"
              element={<PrivateRoute element={<PlantResultPage posts={posts} loadMorePosts={loadMorePosts} hasMorePosts={hasMorePosts} />} />}
            />
            <Route
              path="/user/posts"
              element={<PrivateRoute element={<UserPostsPage currentUser={currentUser} />} />}
            />
          </Routes>
        </Container>

        <Footer />

        <Dialog open={openLoginDialog} onClose={() => setOpenLoginDialog(false)}>
          <DialogTitle>로그인</DialogTitle>
          <DialogContent>
            <MuiTextField
              label="이메일"
              type="email"
              fullWidth
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <MuiTextField
              label="비밀번호"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleLogin} color="primary">
              이메일로 로그인
            </Button>
            <Button onClick={handleGoogleLogin} color="secondary">
              구글로 로그인
            </Button>
          </DialogActions>
        </Dialog>
      </Router>
    </ThemeProvider>
  );
}

function LandingPage({ currentUser, onLoginRequested }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const handleCameraClick = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      document.body.appendChild(video);
      video.srcObject = stream;
      video.play();

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d');
      const captureButton = document.createElement('button');
      captureButton.textContent = '캡처';
      document.body.appendChild(captureButton);

      captureButton.onclick = () => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          setImageFile(blob);
          setImageUrl(URL.createObjectURL(blob));
        }, 'image/png');
        stream.getTracks().forEach(track => track.stop());
        video.remove();
        captureButton.remove();
        canvas.remove();
      };
    } catch (error) {
      console.error('카메라 오류:', error);
      alert('카메라 접근 오류: ' + (error.name === 'NotFoundError' ? '카메라 없음' : '권한 거부'));
    }
  };

  const resizeImage = (file, maxWidth, maxHeight) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
      };
    });
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const resizedFile = await resizeImage(file, 800, 800);
      setImageFile(resizedFile);
      setImageUrl(URL.createObjectURL(resizedFile));
    }
  };

  const handleAnalyze = async () => {
    if (!imageFile) {
      alert('이미지를 업로드하세요.');
      return;
    }
    setLoading(true);
    try {
      const storageRef = ref(storage, `images/${Date.now()}_${imageFile.name || 'captured.png'}`);
      await uploadBytes(storageRef, imageFile);
      const uploadedImageUrl = await getDownloadURL(storageRef);
      console.log('업로드된 URL:', uploadedImageUrl);

      const apiUrl = `${import.meta.env.VITE_API_BASE_URL}/analyze_plant_image`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: uploadedImageUrl }),
      });
      const analysis = await response.json();
      if (!response.ok) throw new Error(analysis.error || '분석 실패');
      setAnalysisResult(analysis);
    } catch (err) {
      console.error('분석 오류:', err);
      alert('분석 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ textAlign: 'center', p: 2 }}>
      <Typography variant="h4" gutterBottom>
        식물 이미지 분석
      </Typography>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<CameraAltIcon />}
          onClick={handleCameraClick}
        >
          사진 촬영
        </Button>
        <Button variant="contained" component="label">
          파일 업로드
          <input type="file" hidden onChange={handleFileChange} accept="image/*" />
        </Button>
      </Box>
      {imageUrl && <img src={imageUrl} alt="미리보기" style={{ maxWidth: '100%', marginBottom: '16px', borderRadius: '8px' }} />}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        {loading ? (
          <CircularProgress />
        ) : (
          <Button variant="contained" color="secondary" onClick={handleAnalyze}>
            분석하기
          </Button>
        )}
      </Box>
      {analysisResult && (
        <Box sx={{ mt: 4, p: 2, backgroundColor: '#f8f9fa', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
          <Typography variant="h6" gutterBottom>
            분석 결과
          </Typography>
          <TableContainer component={Paper} sx={{ boxShadow: 'none', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#e9ecef', borderBottom: '1px solid #e0e0e0' }}>
                    항목
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#e9ecef', borderBottom: '1px solid #e0e0e0' }}>
                    내용
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ borderBottom: '1px solid #e0e0e0' }}>식물 이름</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid #e0e0e0' }}>{analysisResult.plantName || '정보 없음'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ borderBottom: '1px solid #e0e0e0' }}>일반 이름</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid #e0e0e0' }}>{analysisResult.commonNames_kr?.join(', ') || '없음'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ borderBottom: '1px solid #e0e0e0' }}>과</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid #e0e0e0' }}>{analysisResult.family_kr || '없음'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ borderBottom: 'none' }}>설명</TableCell>
                  <TableCell sx={{ borderBottom: 'none' }}>{analysisResult.description_kr || '추가 정보 없음'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          {analysisResult.image_url_kr && (
            <Box sx={{ mt: 2 }}>
              <img
                src={analysisResult.image_url_kr}
                alt="식물 이미지"
                style={{ maxWidth: '100%', borderRadius: '8px' }}
              />
            </Box>
          )}
        </Box>
      )}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Button
          variant="outlined"
          endIcon={<ArrowForwardIcon />}
          component={Link}
          to="/results"
          onClick={(e) => !currentUser && onLoginRequested()}
        >
          전체 검색 기록 보기
        </Button>
        <Button
          variant="outlined"
          endIcon={<ArrowForwardIcon />}
          component={Link}
          to="/user/posts"
          onClick={(e) => !currentUser && onLoginRequested()}
        >
          나의 분석 히스토리
        </Button>
      </Box>
    </Box>
  );
}

function PlantResultPage({ posts, loadMorePosts, hasMorePosts }) {
  const [likedPosts, setLikedPosts] = useState(new Set());

  const handleLike = async (postId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('좋아요 실패');
      setLikedPosts((prev) => new Set(prev.add(postId)));
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === postId ? { ...post, likesCount: (post.likesCount || 0) + 1 } : post
        )
      );
    } catch (err) {
      console.error('좋아요 오류:', err);
      alert('좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" gutterBottom>
        커뮤니티 - 발견된 허브들
      </Typography>
      <Grid container spacing={2}>
        {posts.map((post) => (
          <Grid item xs={12} sm={6} md={4} key={post.id}>
            <Card>
              <CardMedia
                component="img"
                height="200"
                image={post.imageUrl || 'https://via.placeholder.com/200'}
                alt={post.title}
              />
              <CardContent>
                <Typography variant="h6">{post.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  식물 이름: {post.plantName || '분석 정보 없음'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  내용: {post.content || '없음'}
                </Typography>
                <Typography variant="caption">
                  작성자: 탐험가 | 작성일: {post.created_at ? new Date(post.created_at).toLocaleString() : 'N/A'}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    좋아요: {post.likesCount || 0}
                  </Typography>
                  <Button
                    startIcon={<ThumbUpIcon />}
                    onClick={() => handleLike(post.id)}
                    disabled={likedPosts.has(post.id)}
                    color={likedPosts.has(post.id) ? 'primary' : 'inherit'}
                  >
                    좋아요
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {hasMorePosts && (
        <Button onClick={loadMorePosts} variant="contained" sx={{ mt: 2 }}>
          더 보기
        </Button>
      )}
    </Box>
  );
}

function UserPostsPage({ currentUser }) {
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUserPosts = useCallback(async (userId) => {
    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/users/${userId}/posts`, {
        headers: {
          'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`사용자 게시물 조회 중 서버 오류 발생: ${errorData.error || response.status}`);
      }
      const data = await response.json();
      setUserPosts(data);
      setError(null);
      return data;
    } catch (error) {
      console.error('사용자 게시물 조회 오류:', error);
      if (error.message && error.message.includes('index')) {
        try {
          const postsRef = collection(db, 'posts').where('user_id', '==', userId);
          const snapshot = await getDocs(postsRef);
          const posts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            created_at: doc.data().created_at?.toDate(),
          }));
          posts.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          setUserPosts(posts);
          setError(null);
          return posts;
        } catch (fallbackError) {
          console.error('대체 조회 실패:', fallbackError);
          setUserPosts([]);
          setError('게시물을 가져올 수 없습니다. 나중에 다시 시도해주세요.');
          throw new Error('게시물 조회 실패');
        }
      } else {
        setUserPosts([]);
        setError(`게시물 조회 중 오류 발생: ${error.message}`);
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchUserPosts(currentUser.uid)
        .catch(error => {
          setError(`게시물 조회 중 오류 발생: ${error.message}`);
        });
    }
  }, [currentUser, fetchUserPosts]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" gutterBottom>
        나의 분석 히스토리
      </Typography>
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}
      {loading ? (
        <CircularProgress />
      ) : userPosts.length === 0 ? (
        <Typography>게시물이 없습니다.</Typography>
      ) : (
        <Grid container spacing={2}>
          {userPosts.map((post) => (
            <Grid item xs={12} sm={6} md={4} key={post.id}>
              <Card>
                <CardMedia
                  component="img"
                  height="200"
                  image={post.imageUrl || 'https://via.placeholder.com/200'}
                  alt={post.title}
                />
                <CardContent>
                  <Typography variant="h6">{post.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    식물 이름: {post.plantName || '분석 정보 없음'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    내용: {post.content || '없음'}
                  </Typography>
                  <Typography variant="caption">
                    작성일: {new Date(post.created_at).toLocaleString() || 'N/A'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

export default App;