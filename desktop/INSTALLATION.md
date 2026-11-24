# 설치와 업데이트

정식 `main.mjs` / `preload.cjs` 앱을 패키징한다. 원격 뷰어로 바꾸지 않으며 기존 파일·Git·터미널 기능을 유지한다. 웹 화면은 연결한 서버에서 불러온다.

## 사용하는 방법

1. GitHub Releases에서 Apple Silicon용 `Bridgain-<버전>-mac-arm64.dmg`를 받는다.
2. 기존 앱을 종료하고 DMG의 Bridgain을 응용 프로그램 폴더에 복사한다.
3. 앱을 열면 HTTPS 프론트 `https://bridgain-dev-tool.nxithub.com`으로 바로 연결된다. 서버 주소를 입력하지 않는다.
4. 왼쪽 업데이트 아이콘 또는 앱 메뉴의 **업데이트 확인 / 화면 새로고침**을 누른다.

- 새 데스크톱 버전이 없으면 저장 여부를 확인한 뒤 서버 화면을 새로 불러온다.
- Developer ID 인증서 없는 배포(임시 서명): 새 버전 다운로드 페이지를 열고, 사용자가 앱을 종료한 후 새 DMG의 앱으로 교체한다. App Store 등록은 필요 없다. macOS 실행 허용 절차가 필요할 수 있다.
- Developer ID 인증서로 서명된 배포: 다운로드 진행률을 표시하고 설치 시점을 확인한다. ‘나중에’를 선택하면 임의로 종료하거나 다음 종료 시 자동 설치하지 않는다.
- 업데이트 실패는 최신 버전으로 표시하지 않는다. 재시도하거나 서버 화면만 새로 불러올 수 있다.
- 기존 앱에 업데이트 기능이 없다면 이 기능이 포함된 설치 파일을 한 번 직접 설치해야 한다.
- 개발 중 소스 실행과 웹 브라우저에서는 앱 바이너리를 업데이트하지 않고 화면 새로고침만 제공한다.

기존 `@bridgain/desktop` 사용자 프로필 경로를 유지해 서버 주소, 세션, 계정별 폴더 설정을 보존한다. 개발·검증의 명시적 `--user-data-dir` 지정은 존중한다. Git 및 AI CLI처럼 기존 기능에 필요한 외부 도구는 별도로 설치되어 있어야 한다.

## 최초 빌드와 배포

공개 저장소 `a1sept/bridgain-web-developer`의 Releases를 기본 다운로드 위치로 사용한다. 비공개 토큰을 앱에 포함하지 않는다. 다른 공개 배포 저장소를 사용하려면 Actions 변수 `DESKTOP_RELEASE_REPOSITORY=owner/repo`와 그 저장소의 Contents 쓰기 권한을 가진 secret `DESKTOP_RELEASE_TOKEN`을 설정한다. 기본 저장소를 그대로 쓰면 추가 토큰이 필요 없다.

`.github/workflows/desktop-release.yml`이 Apple Silicon DMG와 ZIP 및 업데이트 메타데이터를 만든다.

- `workflow_dispatch` 또는 `codex/desktop-release` 브랜치 push: 테스트와 빌드 후 Actions artifact로만 저장. 공개 배포하지 않는다.
- `desktop-v0.1.0` 형태의 태그 push: `desktop/package.json` 버전과 일치하는지 확인하고 테스트·빌드 후 `v0.1.0` Release를 게시한다. 모든 파일 업로드가 끝난 뒤 draft를 해제한다.
- 새 버전에서는 `desktop` 디렉토리에서 `npm version <버전> --no-git-tag-version`으로 package.json과 lockfile을 같이 갱신한다. 검토한 코드를 커밋한 후 일치하는 `desktop-v<버전>` 태그를 push한다.
- 동일 버전의 공개 파일을 바꾸지 않는다. 새 버전으로 배포한다. 업로드 실패로 draft가 남았다면 draft를 정리하고 재실행한다.

Mac에서 직접 빌드하려면 개발자 저장소에서:

```sh
npm run desktop:install
npm run desktop:dist -- --mac --arm64
```

산출물은 `desktop/release/`에 생긴다. CI는 DMG를 마운트해 앱을 복사한 뒤 codesign 무결성 검사, Apple Silicon 실행, 고정 서버 자동 연결, preload와 네이티브 PTY를 검증한다. 인터넷 다운로드 후 Gatekeeper 승인 및 실제 사용자의 설치/교체는 별도로 확인해야 한다. Linux의 `npm run desktop:pack`은 패키지 실행과 포함 파일을 점검하는 용도다.

## 나중에 자동 설치로 전환

App Store 등록 없이 Developer ID 서명과 공증을 사용할 수 있다. Actions secrets:

- `DESKTOP_CSC_LINK`: Developer ID Application 인증서(P12)의 base64
- `DESKTOP_CSC_KEY_PASSWORD`: P12 비밀번호
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: 공증 설정

인증서를 설정하면 빌드에 `desktopUpdateMode=automatic`이 기록된다. Developer ID 인증서 없는 기존 앱은 서명된 새 버전을 한 번 수동 설치한 뒤부터 자동 설치를 사용한다. 인증서가 제공됐는데 서명에 실패하면 빌드를 실패시켜야 하므로 배포 로그에서 서명·공증 결과를 확인한다. 인증서·비밀번호는 저장소나 채팅에 넣지 않는다.

## 검증

```sh
npm run desktop:test
npm run build
npm run desktop:check
npm run desktop:pack
```

`desktop/test/updates.test.mjs`는 최신 버전·업데이트 취소·진행률·설치 보류·재시도·다운로드 실패·동시 클릭·서명 없는 다운로드 경로를 검사한다.

`scripts/desktop-update-ui-check.mjs`는 로컬 Vite 서버(15411), Playwright와 Chrome, 패키징한 Linux 앱을 사용해 업데이트 버튼 상태와 네이티브 PTY를 검사한다. 실제 배포 서버 다운로드·Mac 설치·업데이트는 별도 검증 대상이다.

## 0.1.3 Mac 손상 경고 수정

0.1.1은 Developer ID 인증서가 없는 CI에서 서명이 생략됐다. 인증서가 없으면 `mac.identity: "-"`로 임시 서명을 명시한다. Hardened Runtime은 유지하고 임시 서명 전용 entitlement에만 `disable-library-validation`을 추가한다. Developer ID 빌드는 기존 entitlement를 유지한다. 새 DMG의 무결성·서명·실행 검증이 통과해야 업로드와 공개 배포가 진행된다. Apple 공증이나 Gatekeeper의 자동 승인을 의미하지 않는다.

## 0.1.5 고정 연결

설치 앱은 환경변수나 예전에 저장한 서버 주소와 무관하게 기존 프론트 `http://nexusnas.iptime.org:15174`를 바로 연다. 이 프론트의 API_PROXY_TARGET은 `https://bridgain-dev.nxithub.com`이다. API 전용 도메인의 역방향 프록시 대상 15175와 프론트 포트 15174를 유지한다. 주소 변경 메뉴 대신 다시 연결 메뉴를 제공하며 네트워크 실패 시 주소 입력 없이 재시도한다. 소스 실행의 개발 서버 선택 기능은 유지한다. 기존 서버별 폴더 설정을 다른 서버로 복사하지 않는다.

## 0.1.6 HTTPS 프론트 연결 복구

0.1.5의 원격 HTTP 연결은 사용하지 않는다. 설치 앱은 `https://bridgain-dev-tool.nxithub.com`으로 고정 연결하며 패키지 앱도 기존 serverOrigin 검증을 통과해야 한다. 메인 화면의 다른 Origin 리디렉션을 차단한다. API 전용 도메인 `https://bridgain-dev.nxithub.com`과 내부 프론트 포트 15174는 유지한다. 새 HTTPS Origin의 로그인 허용 설정이 필요하다. 0.1.5 공개 배포는 철회한다.
