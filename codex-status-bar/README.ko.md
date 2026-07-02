<p align="center">
  <img src="./public/assets/readme/codex-character.gif" alt="Codex Status Bar 파란색과 보라색 캐릭터" width="140">
</p>

<h1 align="center">Codex Status Bar</h1>

<p align="center">
  <em>Codex CLI 상태를 실시간으로 보여주는 작은 macOS 메뉴 막대 앱.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.0.3-111111?style=flat-square" alt="Version">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/macOS-12%2B-111111?style=flat-square" alt="macOS 12+">
  <img src="https://img.shields.io/badge/Swift-menu%20bar-111111?style=flat-square" alt="Swift menu bar app">
</p>

<p align="center">
  <sub><a href="./README.md">English</a> &middot; <a href="./README.ko.md">한국어</a></sub>
</p>

<p align="center">
  <a href="https://github.com/bytonylee/best-codex/releases/latest/download/CodexStatusBar.dmg"><img src="./public/assets/readme/download-macos.png" alt="Mac OS용 CodexStatusBar.dmg 다운로드" width="270"></a>
</p>

---

> *Codex Status Bar는 Codex가 생각 중인지, 도구를 실행 중인지, 권한을 기다리는지, 끝났는지 보여줍니다. 창도, Dock 아이콘도, 대시보드도 없습니다. macOS 메뉴 막대에 살아 있는 캐릭터 하나만 둡니다.*

메뉴를 열어 최근 세션을 선택하고, 타이머와 애니메이션 스타일, 소리를
조정할 수 있습니다.

> 긴 Codex 작업 중 다른 창으로 이동해도 에이전트가 일하는 중인지, 내 입력을
> 기다리는지, 끝났는지 바로 알 수 있게 만들었습니다.

**이 앱은 상태를 저장하지 않는 poller입니다. Codex 훅이 상태를 쓰면 Swift
앱이 0.4초마다 읽습니다. Codex가 시작되면 스스로 실행되고 활성 세션이
없으면 스스로 종료됩니다. 유일한 네트워크 호출은 하루 한 번 GitHub 릴리스
확인뿐입니다. 훅 설치 시 `~/.codex/hooks.json`을 한 번 백업합니다.**

## 왜 필요한가요?

Codex는 생각하고, 파일을 고치고, 도구를 실행하고, 권한 결정을 기다리느라
시간을 씁니다. 터미널이 항상 앞에 있지는 않아서 매번 돌아가 확인하면 흐름이
끊깁니다.

Codex Status Bar는 그 상태를 macOS 메뉴 막대에 계속 보여줍니다.

- 작업 중인 세션은 애니메이션으로 표시합니다.
- 권한 대기는 amber 표시로 바뀝니다.
- 완료되었거나 비활성인 세션은 멈춘 캐릭터만 보여줍니다.
- 최근 세션을 클릭하면 그 세션이 헤더 기준이 됩니다.
- 활성 Codex 세션이 없으면 앱이 스스로 종료됩니다.

## 상태

| 상태 | 메뉴 막대 동작 | 비고 |
|---|---|---|
| 생각 중 | 애니메이션 아이콘과 선택적 타이머 | `UserPromptSubmit`에서 시작 |
| 도구 실행 | 애니메이션 아이콘과 짧은 도구 라벨 | `Editing`, `Running command` 같은 라벨 사용 |
| 권한 대기 | 멈춘 amber 표시 | Codex 권한 요청에서 발생 |
| 완료 | 멈춘 아이콘 | 메뉴를 열면 정리됨 |
| 선택한 세션이 비활성 | 멈춘 캐릭터만 표시 | 메뉴 막대에 오래된 상태 문구를 남기지 않음 |

메뉴에서 조정할 수 있는 항목:

- `Show timer`: 현재 턴의 경과 시간을 켜고 끕니다.
- `Play Sound`: 완료음과 권한 대기음을 켜고 끕니다.
- `Recent`: 어떤 활성/최근 세션을 헤더 기준으로 삼을지 선택합니다.
- `Animation`: Codex Character, Orbit, CLI, Spark 스타일을 전환합니다.
- `Color`: 프로그램으로 그리는 스타일을 green 또는 black-and-white로 바꿉니다.

## 설치

[Releases](https://github.com/tonylee/codex-status-bar/releases/latest)에서
최신 `CodexStatusBar.dmg`를 내려받아 열고 **Codex Status Bar**를
Applications로 드래그합니다.

또는 로컬에서 앱을 빌드합니다.

```bash
./build.sh
open -gj build/CodexStatusBar.app
```

처음 실행하면 앱이 `~/.codex/hooks.json`에 Codex 훅을 설치하고, 기존 파일을
한 번 백업합니다.

필요한 것:

- macOS 12+
- Xcode 또는 Swift command-line tools
- Node.js
- Codex CLI

Codex 훅은 실행 전 신뢰 설정이 필요합니다. 대화형 `codex`에서는 한 번
확인 메시지가 뜹니다. `codex exec` 자동화에서는 미리 훅을 신뢰하거나
환경에 맞게 Codex의 hook-trust 우회 플래그를 사용하세요.

## 동작 방식

앱은 상태를 저장하지 않는 poller입니다.

Codex 훅은 현재 상태를 다음 파일에 씁니다.

```text
~/.codex/statusbar/state.json
```

Swift 메뉴 막대 앱은 이 파일을 0.4초마다 읽고 아이콘, 라벨, 선택적 타이머를
그립니다. 활성 세션 marker는 다음 디렉토리의 파일로 추적합니다.

```text
~/.codex/statusbar/sessions.d/
```

세션별 지속 상태는 별도 디렉토리에 저장합니다.

```text
~/.codex/statusbar/session-state/
```

훅 매핑:

| Codex 이벤트 | 상태바 상태 |
|---|---|
| `UserPromptSubmit` | `thinking` |
| `PreToolUse` | `tool` |
| `PostToolUse` | `thinking` |
| `Notification` 권한 프롬프트 | `permission` |
| `PermissionRequest` | `permission` |
| `Stop` | `done` |
| `SessionStart` | 앱 실행, 세션 등록 |
| `SessionEnd` | 세션 해제, 멈춘 상태 정리 |

네트워크 호출은 GitHub 릴리스 확인 한 가지뿐입니다.

## 빌드

컴파일과 번들 생성:

```bash
./build.sh
```

DMG 생성:

```bash
./build.sh --dmg
```

집중 컴파일 체크:

```bash
swiftc -O -target arm64-apple-macos12.0 Sources/*.swift -o /tmp/test -framework Cocoa
```

## Agent Skill

로컬 에이전트 스킬은 `.agents/skills/character-animation-creator/`에
있습니다. `.claude/skills/character-animation-creator` 항목은 같은 소스를
가리키는 symlink라서 Claude Code와 `.claude`를 읽는 도구도 파일을 복제하지
않고 사용할 수 있습니다.

## 에이전트용 설치

앱을 빌드하고 실행하는 일회성 설정:

```bash
cd /path/to/codex-status-bar
./build.sh
open -gj build/CodexStatusBar.app
```

설치 후 Codex 세션을 시작하면 메뉴 막대 아이콘이 자동으로 나타납니다.
활성 Codex 세션이 없으면 앱이 스스로 종료되므로 직접 관리할 것이
없습니다.

## 보안

- 앱은 상태를 저장하지 않는 poller이며 로컬 상태 파일만 읽고 Codex 콘텐츠를
  어디로도 보내지 않습니다.
- 유일한 네트워크 호출은 하루 한 번 GitHub 릴리스 확인입니다.
- 훅 설치 시 `~/.codex/hooks.json`을 병합 전 한 번 백업합니다.
- 훅은 `~/.codex/statusbar/` 아래에 상태만 쓰며 프롬프트 콘텐츠나
  transcript를 기록하지 않습니다.
- 활성 Codex 세션이 없으면 앱이 스스로 종료됩니다.
- 제거 시 상태바 훅만 지우고 `~/.codex/hooks.json`의 나머지는 그대로
  둡니다.

## 테스트

```bash
# Swift contract 테스트
swiftc -O -target arm64-apple-macos12.0 Sources/*.swift tests/*Tests.swift -o /tmp/test -framework Cocoa

# 훅 contract 테스트
node tests/hook-state-contract.test.js
node tests/hook-install-contract.test.js
node tests/hook-lifecycle-contract.test.js
```

테스트는 메뉴 row 레이아웃, 메뉴 동작, 헤더 상태 정책, 세션 저장소 읽기,
transcript 해석, 아이콘 렌더러 contract, 대시보드 contract, 월드컵 애니메이션
contract, 훅 state/install/lifecycle 동작을 검증합니다.

## 제거

상태바 훅만 제거합니다.

```bash
node "build/CodexStatusBar.app/Contents/Resources/uninstall.js"
```

그다음 앱을 종료하고 `build/CodexStatusBar.app` 또는 설치된 앱 복사본을
삭제하면 됩니다.

## 릴리스

현재 태그: [`v0.0.3`](https://github.com/bytonylee/best-codex/releases/tag/v0.0.3)

`v0.0.3` 릴리스는 스타일이 적용된 DMG 설치 창을 추가합니다. 곱슬거리는
흰색 배경 위에 검은 곡선 화살표 커스텀 배경이 사용자가 앱 아이콘을
Applications 폴더로 드래그하도록 안내하며, mac-whisper 설치 창 레이아웃
(660x440 창, 80px 아이콘)과 일치합니다.

## Acknowledgements

Codex Status Bar는 훌륭한 오픈소스 프로젝트의 아이디어와 코드를 바탕으로
만들었습니다:

- [claude-status-bar](https://github.com/m1ckc3s/claude-status-bar) (MIT) — Claude Code의 실시간 상태를 메뉴 막대에 보여주는 macOS 앱 패턴; 상태를 저장하지 않는 poller 구조, 훅 기반 상태 모델, 다중 세션 메뉴 막대 동작은 이 프로젝트가 세운 패턴을 따릅니다.

이 프로젝트의 작성자와 유지보수자분들께 감사드립니다.

## 라이선스

[MIT](./LICENSE)
