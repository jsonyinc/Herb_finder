import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react({
    jsxImportSource: '@emotion/react',
    babel: {
      plugins: ['@emotion/babel-plugin']
    }
  })],
  server: {
    host: '0.0.0.0', // 모든 네트워크에서 접근 가능
    port: 5173 // 포트 번호 고정
  },
  resolve: {
    alias: {
      '@': '/src',
      // require.resolve 대신 직접 경로 지정
      '@emotion/react': path.resolve('./node_modules/@emotion/react'),
      '@emotion/styled': path.resolve('./node_modules/@emotion/styled')
    },
  },
  optimizeDeps: {
    include: [
      'firebase/app', 
      'firebase/auth', 
      'firebase/firestore', 
      'firebase/storage',
      '@emotion/react', 
      '@emotion/styled'
    ],
  },
  build: {
    sourcemap: true,
  },
});