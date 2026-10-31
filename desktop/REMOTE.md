# 원격 개발자 웹 실행

기존 Electron 설치를 활용해 서버 웹앱을 그대로 표시하는 **웹 뷰어 전용 모드**입니다. 정식 데스크톱과 분리되어 있으며 로컬 AI·파일·Git 기능을 제공하지 않습니다.

**로컬 폴더 연결이나 Git 작업이 필요하면 이 모드를 사용하지 마세요.** `apps/developer`에서 `npm run desktop`을 실행합니다(`desktop/main.mjs`). 정식 앱도 공용 서버에 연결하므로 로컬 DB/API를 실행할 필요는 없습니다. 원격 서버 작업이나 배포를 이유로 정식 앱을 `start:remote`로 대체하지 않습니다.

프로젝트 설정에서 두 디렉토리 연결 버튼이 비활성이고 데스크톱 안내가 보인다면 실행 모드를 먼저 확인하세요. 뷰어에 파일 접근 권한을 추가해 우회하지 말고 정식 앱을 사용합니다. 유지 조건과 검증 절차는 루트의 `docs/agents/local-github-handoff.md`를 따릅니다.

## 실행과 설정

Node.js 24가 필요합니다. 최초 설치 시 이 폴더에서 `npm ci`를 실행합니다. 이미 설치했다면 바로 실행합니다.

```sh
cd /Users/jirehjung/WORKSPACE/bridgAI_v2/apps/developer/desktop
BRIDGAIN_REMOTE_URL=http://nexusnas.iptime.org:15174 npm run start:remote
```

`BRIDGAIN_REMOTE_URL`은 필수 환경변수로, 코드에 기본 주소는 없습니다. 경로·쿼리·인증정보 없는 HTTP(S) 기본 주소를 사용합니다. `.env.dev`를 자동으로 읽지 않습니다. 주소 변경 후 앱을 종료하고 다시 실행하세요. 실행 중인 앱이 있으면 두 번째 실행은 기존 창을 활성화합니다.

- 개발자 웹 화면: `http://nexusnas.iptime.org:15174`
- API 서버: `http://nexusnas.iptime.org:15175`
- Electron에는 웹 화면 주소를 설정합니다. 웹의 기존 `/api` 프록시가 API 서버에 연결하므로 로컬 프론트/API 실행은 필요 없습니다.
- 쿠키와 세션은 별도 `Bridgain Remote` 사용자 데이터에 보존합니다. 기본 브라우저 및 기존 AI 데스크톱과 로그인 상태를 공유하지 않습니다.

## 동작과 보안

원격 화면은 `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`이며 preload와 IPC 브리지가 없습니다. 인증서 검증을 유지합니다.

창과 하위 프레임 이동은 설정한 정확한 origin(프로토콜·호스트·포트)으로 제한합니다. 외부 HTTP(S) 링크와 새 창 요청은 기본 브라우저로 열며 다른 프로토콜과 webview는 차단합니다. 외부 인증 제공자의 웹뷰 복귀 흐름은 별도 지원하지 않습니다. 현재 이메일·비밀번호 로그인은 같은 origin에서 처리합니다.

HTTP 4xx/5xx, 연결 실패, 30초 로딩 시간 초과 때 로컬 오류 안내와 **다시 시도**를 표시합니다. 메뉴의 **서버 다시 연결**도 사용할 수 있습니다. 웹 내부 API 오류는 기존 웹앱이 처리합니다.

## 검증 및 서버 조건

2026-10-30 로컬 macOS 확인 결과:

- `15175/`: 404(API 포트에는 웹 화면 없음).
- `15175/api/health`: 200, DB 연결 정상.
- `15175/api/auth/me`: 403 `PROXY_REQUIRED`(API 직접 접근 차단).
- `15174/`: 200, Electron 로그인 화면 표시.
- `15174/api/auth/me`: 401 `UNAUTHENTICATED`(웹 프록시 정상, 미로그인 상태).
- `15174/api/auth/csrf`: 200.
- 사용자 직접 로그인 완료 후 Electron에서 대시보드와 프로젝트·요청 데이터 표시 확인: 로그인 및 인증된 API 조회 정상.
- 로컬 Node WebSocket 클라이언트에서 원격 Vite HMR handshake 성공, `vite-hmr` 프로토콜 및 `connected` 메시지 수신 확인.
- 404에 대한 오류 화면·재시도 확인.
- JavaScript 문법 검사 및 보안 테스트 8개 통과. 전체 기존 테스트는 최초 32개 통과했으며 재실행에서는 기존 runtime 테스트 worker 종료 대기가 발생했습니다.

앱 재시작 후 세션 복원과 Electron 렌더러 내부 WebSocket 연결은 미검증입니다. 로컬 코드에는 업무용 WebSocket 기능이 없습니다. 개발 서버의 Vite HMR WebSocket은 별도 개발 기능입니다. Electron 콘솔 추가 확인 중 macOS 화면 캡처 도구 오류가 발생하여 내부 연결 검증은 완료하지 못했습니다.

현재 구성에는 Electron 전용 서버 변경이 필요하지 않습니다. 기존 웹 프록시와 `DEVELOPER_APP_ORIGIN`이 웹 주소와 일치해야 합니다. 프록시 비밀값을 Electron이나 브라우저에 넣지 마세요. 운영 Secure 쿠키 사용 시 서버에 HTTPS를 제공해야 하며 Electron 보안을 해제해 해결하지 않습니다.

```sh
npm run check
node --test test/remote-security.test.mjs test/security.test.mjs
```
