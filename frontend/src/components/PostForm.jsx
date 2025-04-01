import React, { useState } from 'react';
import { db, storage, auth, API_BASE_URL } from '../firebaseConfig'; // auth 추가
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
// import { addDoc, collection, serverTimestamp } from 'firebase/firestore'; // 직접 Firestore에 쓰는 대신 API 호출

const PostForm = ({ currentUser, onPostCreated }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [plantName, setPlantName] = useState(''); // 식물 분석 결과 상태

  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  // 이미지 업로드 및 게시물 생성/분석 요청 핸들러
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser || !imageFile || !title) {
      setError('제목과 이미지는 필수입니다.');
      return;
    }
    setError('');
    setIsUploading(true);

    // 1. Firebase Storage에 이미지 업로드
    const storageRef = ref(storage, `herb_images/${currentUser.uid}/${Date.now()}_${imageFile.name}`);
    const uploadTask = uploadBytesResumable(storageRef, imageFile);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (uploadError) => {
        console.error("Upload failed:", uploadError);
        setError(`이미지 업로드 실패: ${uploadError.message}`);
        setIsUploading(false);
      },
      async () => {
        // 2. 업로드 완료 후 다운로드 URL 가져오기
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('File available at', downloadURL);

          // 3. (선택적) 백엔드에 이미지 분석 요청
          let analyzedPlantName = '';
          try {
            const idToken = await currentUser.getIdToken(true); // 항상 최신 토큰 사용
            const analyzeResponse = await fetch(`${API_BASE_URL}/analyze_plant_image`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify({ imageUrl: downloadURL })
            });
            if (!analyzeResponse.ok) {
              const errData = await analyzeResponse.json();
              throw new Error(errData.error || '이미지 분석 요청 실패');
            }
            const analysisResult = await analyzeResponse.json();
            analyzedPlantName = analysisResult.plantName;
            setPlantName(analyzedPlantName); // 상태 업데이트 (UI 표시용)
            console.log("Analysis result:", analysisResult);
          } catch (analyzeError) {
             console.error("Image analysis error:", analyzeError);
             // 분석 실패해도 게시물 생성은 계속 진행할 수 있도록 에러 처리
             setError(`이미지 분석 실패: ${analyzeError.message}. 게시물은 생성됩니다.`);
          }


          // 4. 백엔드에 게시물 생성 요청 (분석 결과 포함)
          const idToken = await currentUser.getIdToken(); // 토큰 재사용 또는 갱신
          const postResponse = await fetch(`${API_BASE_URL}/posts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              title: title,
              content: content,
              imageUrl: downloadURL,
              user_id: currentUser.uid,
              plantName: analyzedPlantName, // 분석 결과 포함
              // location, recipeLink 등 추가 필드 포함
            })
          });

          if (!postResponse.ok) {
            const errData = await postResponse.json();
            throw new Error(errData.error || '게시물 생성 요청 실패');
          }

          // 성공 처리
          setTitle('');
          setContent('');
          setImageFile(null);
          setUploadProgress(0);
          setPlantName('');
          alert('게시물이 성공적으로 등록되었습니다!');
          if (onPostCreated) {
            onPostCreated(); // 부모 컴포넌트에 알림 (목록 새로고침 등)
          }

        } catch (submitError) {
          console.error("Post creation failed:", submitError);
          setError(`게시물 생성 실패: ${submitError.message}`);
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
          accept="image/*" // 이미지 파일만 허용
          required
          className="form-input"
        />
        {/* 추가 필드 (위치, 레시피 링크 등) 입력 UI */}

        {isUploading && <progress value={uploadProgress} max="100" />}
        {plantName && <p>분석된 식물 이름: {plantName}</p>}

        <button type="submit" disabled={isUploading} className="form-button">
          {isUploading ? '업로드 중...' : '등록하기'}
        </button>
      </form>
    </div>
  );
};

export default PostForm;