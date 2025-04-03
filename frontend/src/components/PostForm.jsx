import React, { useState } from 'react';
import { db, storage, auth, API_BASE_URL } from '../firebaseConfig';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

const PostForm = ({ currentUser, onPostCreated }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [plantName, setPlantName] = useState('');
  const [analysisFailed, setAnalysisFailed] = useState(false); // 새 상태 추가

  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const getFriendlyErrorMessage = (error) => {
    console.error("Detailed error:", error);
    if (error.message.includes("storage/unauthorized")) {
      return "이미지 업로드 권한이 없습니다. 로그인 상태를 확인해주세요.";
    }
    if (error.message.includes("이미지 분석 요청 실패")) {
      return "식물 이미지 분석에 실패했습니다. 잠시 후 다시 시도해주세요.";
    }
    if (error.message.includes("게시물 생성 요청 실패")) {
      return "게시물 생성 요청 중 오류가 발생했습니다.";
    }
    return "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser || !imageFile || !title) {
      setError('제목과 이미지는 필수입니다.');
      return;
    }
    console.log('Current User:', currentUser.uid); // UID 출력 추가(테스트 확인용 코드 16시 19분)
    if (!currentUser.getIdToken) {
      setError('인증 오류: 다시 로그인해주세요.');
      return;
    }
    setError('');
    setIsUploading(true);
    setAnalysisFailed(false); // 분석 실패 초기화

    const storageRef = ref(storage, `herb_images/${currentUser.uid}/${Date.now()}_${imageFile.name}`);
    const uploadTask = uploadBytesResumable(storageRef, imageFile);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (uploadError) => {
        console.error("Upload failed:", uploadError);
        setError(getFriendlyErrorMessage(uploadError));
        setIsUploading(false);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('File available at', downloadURL);
          console.log('Checking URL accessibility:', fetch(downloadURL, { method: 'HEAD' }).then(res => res.ok));

          const idToken = await currentUser.getIdToken(true);
          console.log('Generated ID Token:', idToken); // 오류 체크용 라인(16시 15분)

          let analyzedPlantName = '';
          try {
            const analyzeResponse = await fetch(`${API_BASE_URL}/analyze_plant_image`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
              },
              body: JSON.stringify({ imageUrl: downloadURL }),
            });
            if (!analyzeResponse.ok) {
              const errData = await analyzeResponse.json();
              throw new Error(errData.error || '이미지 분석 요청 실패');
            }
            const analysisResult = await analyzeResponse.json();
            analyzedPlantName = analysisResult.plantName;
            setPlantName(analyzedPlantName);
            console.log("Analysis result:", analysisResult);
          } catch (analyzeError) {
            console.error("Image analysis error:", analyzeError);
            setError(getFriendlyErrorMessage(analyzeError));
            setAnalysisFailed(true); // 분석 실패 상태 설정
          }

          const postResponse = await fetch(`${API_BASE_URL}/posts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              title: title,
              content: content,
              imageUrl: downloadURL,
              user_id: currentUser.uid,
              plantName: analyzedPlantName,
            }),
          });

          if (!postResponse.ok) {
            const errData = await postResponse.json();
            throw new Error(errData.error || '게시물 생성 요청 실패');
          }

          setTitle('');
          setContent('');
          setImageFile(null);
          setUploadProgress(0);
          setPlantName('');
          setAnalysisFailed(false);
          alert('게시물이 성공적으로 등록되었습니다!');
          if (onPostCreated) {
            onPostCreated();
          }
        } catch (submitError) {
          console.error("Post creation failed:", submitError);
          setError(getFriendlyErrorMessage(submitError));
        } finally {
          setIsUploading(false);
        }
      }
    );
  };

  return (
    <div className="post-form-container">
      <h3>새로운 허브 발견 등록</h3>
      {error && <p className="error-message">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="발견한 허브 이름 또는 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="form-input"
        />
        <textarea
          placeholder="내용 (선택 사항)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="form-textarea"
        />
        <input
          type="file"
          onChange={handleImageChange}
          accept="image/*"
          required
          className="form-input"
        />
        {isUploading && <progress value={uploadProgress} max="100" />}
        {plantName ? (
          <p>분석된 식물 이름: {plantName}</p>
        ) : analysisFailed ? (
          <p>식물 분석에 실패했습니다.</p>
        ) : isUploading ? (
          <p>분석 중...</p>
        ) : null}
        <button type="submit" disabled={isUploading} className="form-button">
          {isUploading ? '업로드 중...' : '등록하기'}
        </button>
      </form>
    </div>
  );
};

export default PostForm;