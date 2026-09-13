# Bridgain 개발자 웹

React + Vite + TypeScript로 구성한 독립 웹 프로젝트입니다. 현재는 개발 환경과 API 연결 상태를 확인하는 시작 화면만 제공합니다. 로그인과 업무 기능은 아직 구현하지 않았습니다.

## 실행

Node.js 24를 사용합니다. 상위 저장소의 개발 Compose 실행 방법은 상위 README를 따릅니다.

독립 실행:

```bash
npm ci
npm run dev
```

기본 포트는 5173입니다. 두 웹을 직접 동시에 실행할 때는 한쪽에서 `npm run dev -- --port 5174`를 사용하세요. `/api` 요청은 개발 서버가 `API_PROXY_TARGET`(기본 `http://localhost:3000`)으로 프록시합니다. API도 실행되어 있어야 연결 확인이 성공합니다.

```bash
npm run build
```

타입 검사와 빌드를 수행합니다. `npm run preview`는 빌드 결과 확인용이며 개발 API 프록시를 제공하지 않습니다.

## 환경 설정

실제 환경 파일은 상위 저장소의 `.env.dev`에서 관리하고 Compose가 필요한 값만 전달합니다. 이 프로젝트는 상위 환경 파일을 직접 읽지 않습니다. `API_PROXY_TARGET`과 선택적인 `DEV_ALLOWED_HOST`는 Vite 서버 설정 전용입니다. 브라우저에 공개 가능한 값에만 `VITE_PUBLIC_` 접두사를 사용하세요. DB 비밀번호와 비공개 API 키를 웹에 전달하지 마세요.
