# Codex Vible (Codex 바이블)

Codex Vible은 실전 프로젝트에서 Codex를 활용하는 방법을 영어와 한국어로 설명하는 실용 가이드입니다. 현재 에디션은 Vite, React, Tailwind CSS, shadcn/ui로 개발했으며, 두 언어의 전체 원문과 기존 도판 216장을 모두 보존합니다.

제목 위계, 본문, 목록, 표, 도판, 명령어, 코드는 모든 페이지에서 하나의 디자인 규칙을 따릅니다. 코드 예제의 복사 버튼은 마우스를 올리거나 키보드로 포커스하면 나타나며, 터치 기기에서는 항상 표시됩니다.

## 로컬에서 실행하기

```bash
npm install
npm run dev
```

`http://localhost:5173/`에서 언어를 선택할 수 있습니다. 영문과 국문 문서는 각각 `/en`, `/ko`에서 바로 열 수 있습니다.

## 검증하기

```bash
npm run audit:prose
npm run lint
npm run build
```

문장 검사는 사람이 다듬은 영문·국문 원고의 문단과 목록 2,296개를 확인해, 설명 없이 끝나는 긴 문장 조각이 남아 있지 않은지 검사합니다. 빌드 결과는 `dist/`에 생성됩니다.

## 구성

```text
src/                     React 앱과 공통 디자인 시스템
src/components/ui/       shadcn/ui 컴포넌트
src/styles/globals.css   Tailwind 토큰과 문서 디자인 규칙
work/en_h/               사람이 검토한 영문 원고
work/ko_h/               사람이 검토한 국문 원고
assets/images-en/        기존 영문 도판 108장
assets/images-ko/        기존 국문 도판 108장
docs/design-system.md    공통 레이아웃과 콘텐츠 규칙
```

이 문서는 비공식 가이드이며 OpenAI와 관련이 없습니다.
