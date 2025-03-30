import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()], // React 플러그인 사용: React 앱을 실행하기 위한 설정
  server: {
    host: '0.0.0.0', // 모든 네트워크에서 접근 가능: 같은 Wi-Fi에 있는 기기에서도 접속 가능
    port: 5173 // 포트 번호 고정: 5173번 문으로 열기
  }
})
