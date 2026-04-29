self.addEventListener('install', (e) => {
  console.log('보안 앱 서비스 워커 설치 완료!');
});

self.addEventListener('fetch', (e) => {
  // 요청 처리 (기본 상태)
});