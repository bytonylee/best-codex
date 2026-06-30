<p align="center">
  <img src="./public/assets/readme/best-codex-character.png" alt="best-codex app logo" width="140">
</p>

<h1 align="center">best-codex</h1>

<p align="center">
  <em>Codex 작업 흐름을 더 편하게 만드는 작고 실용적인 도구 모음.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/projects-4-111111?style=flat-square" alt="Projects: 4">
  <img src="https://img.shields.io/badge/Bun-%3E%3D1.3-111111?style=flat-square" alt="Bun >= 1.3">
  <img src="https://img.shields.io/badge/OpenAI-powered-111111?style=flat-square&logo=openai&logoColor=white" alt="OpenAI powered">
</p>

<p align="center">
  <sub><a href="./README.md">English</a> &middot; <a href="./README.ko.md">한국어</a></sub>
</p>

---

<p align="center">
  <img src="./public/assets/readme/best-codex-hero.png" alt="best-codex hero banner" width="100%">
</p>

`best-codex`는 로컬 개발, ChatGPT 핸드오프, 계정 전환, 이미지 생성,
긴 Codex 세션 상태 확인을 더 쉽게 만드는 도구 모음입니다. 각 프로젝트는
독립적으로 설치하고 실행하도록 구성되어 있습니다. 필요한 도구의 디렉토리로
들어가서 사용하면 됩니다.

> 이 저장소의 프로젝트들은 로컬 Codex와 ChatGPT 작업 흐름을 보조하는
> 도구입니다. 일부 기능은 비공개 또는 비공식 Codex/ChatGPT 경로를 사용하며,
> 사전 공지 없이 바뀔 수 있습니다.

## 프로젝트

| 프로젝트 | 용도 | 런타임 |
|---|---|---|
| [`codex-chatgpt-bridge`](./codex-chatgpt-bridge/) | ChatGPT Developer Mode를 로컬 저장소와 연결하는 MCP 브리지, 제한된 저장소 도구, 터미널 소유 Codex 핸드오프. | TypeScript, Bun/Node |
| [`codex-linker`](./codex-linker/) | 하나의 로컬 설정을 공유하면서 여러 Codex ChatGPT OAuth 계정을 전환. | TypeScript, Bun/Node |
| [`codex-status-bar`](./codex-status-bar/) | Codex CLI 상태를 실시간으로 보여주는 작은 macOS 메뉴 막대 앱. | Swift, Node hooks |
| [`codex-imagegen-api`](./codex-imagegen-api/) | 사용자의 Codex ChatGPT 로그인으로 동작하는 이미지 생성 API, CLI, 로컬 HTTP 서버. | TypeScript, Bun |

## 빠른 시작

워크스페이스를 클론하고 사용할 프로젝트로 이동합니다.

```bash
git clone https://github.com/bytonylee/best-codex.git
cd best-codex
```

대부분의 TypeScript 도구는 같은 로컬 설정 흐름을 사용합니다.

```bash
cd codex-imagegen-api
bun install
bun run build
bun link
```

macOS 메뉴 막대 앱은 자체 디렉토리에서 빌드합니다.

```bash
cd codex-status-bar
./build.sh
open -gj build/CodexStatusBar.app
```

## 도구 요약

### codex-chatgpt-bridge

`codex-chatgpt-bridge`는 ChatGPT Developer Mode가 하나의 로컬 저장소를
읽고 변경할 수 있도록 작은 MCP 도구 표면을 제공합니다. ChatGPT는 읽기,
검색, 편집, 제한된 검증 명령 실행, 이미지 아티팩트 저장, 핸드오프 계획
작성을 할 수 있습니다. Codex 실행은 `execute-handoff` 또는
`watch-handoff`를 통해 터미널에서만 이루어집니다.

```bash
cd codex-chatgpt-bridge
bun install
bun run build
bun link
cc-bridge start --no-auth
```

### codex-linker

`codex-linker`는 Codex 계정별로 `auth.json`을 분리해 두고, 기본 Codex
홈의 설정, MCP 파일, 스킬, 훅, 세션, 히스토리를 보조 계정 홈으로
심볼릭 링크합니다. 트래픽을 프록시하거나 토큰을 출력하지 않습니다.

```bash
cd codex-linker
bun install
bun run build
bun link
codex-linker setup --accounts 3
```

### codex-status-bar

`codex-status-bar`는 긴 Codex 작업을 위한 macOS 메뉴 막대 앱입니다. 훅이
`~/.codex/statusbar/` 아래에 로컬 상태를 쓰고, Swift 앱이 이를 폴링해
생각 중, 도구 실행, 권한 대기, 완료 상태를 보여줍니다.

```bash
cd codex-status-bar
./build.sh
open -gj build/CodexStatusBar.app
```

### codex-imagegen-api

`codex-imagegen-api`는 CLI, 라이브러리 API, 로컬 HTTP 서버에서 같은 이미지
생성 코어를 사용합니다. 프롬프트, 이미지 수, 화면비, 참조 이미지, 생성
출력 구조, 프로바이더 폴백 규칙을 지원합니다.

```bash
cd codex-imagegen-api
bun install
bun run build
bun link
imagegen --auth
```

## 보안 참고

- 워크스페이스 도구들은 로컬 사용과 명시적인 사용자 설정을 전제로 합니다.
- 브리지와 서버 도구는 기본적으로 로컬에 바인드되고, 원격 또는 HTTP 접근이
  필요한 경우 토큰 인증을 사용합니다.
- 인증 파일과 액세스 토큰은 도구가 출력하지 않습니다.
- 생성 파일과 상태 파일은 문서화된 로컬 디렉토리에 저장됩니다.
- 비공식 Codex/ChatGPT 비공개 엔드포인트 사용 여부는 각 프로젝트 README에
  명확히 표시되어 있습니다.

## 테스트

각 프로젝트 디렉토리에서 검사를 실행합니다.

```bash
cd codex-chatgpt-bridge && bun test
cd codex-linker && bun test
cd codex-imagegen-api && bun test
```

상태 표시줄 앱은 다음 명령으로 확인합니다.

```bash
cd codex-status-bar
swiftc -O -target arm64-apple-macos12.0 Sources/*.swift tests/*Tests.swift -o /tmp/test -framework Cocoa
node tests/hook-state-contract.test.js
node tests/hook-install-contract.test.js
node tests/hook-lifecycle-contract.test.js
```
