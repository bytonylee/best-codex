# Codex Vible

Codex Vible is a bilingual, practical guide to using Codex in real projects. The current edition uses Vite, React, Tailwind CSS, and shadcn/ui while preserving the complete English and Korean source material and all 216 original localized figures.

The interface follows one publication-wide design system for hierarchy, prose, lists, tables, figures, commands, and code. Code examples reveal an accessible copy button on hover or keyboard focus, and keep it visible on touch devices.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`. The English and Korean readers are available at `/en` and `/ko`.

## Validate

```bash
npm run audit:prose
npm run lint
npm run build
```

The prose audit checks the 2,296 paragraph and list blocks in the human-reviewed English and Korean sources for unexplained long fragments. The build creates a static Vite output in `dist/`.

## Structure

```text
src/                     React application and shared design system
src/components/ui/       shadcn/ui components
src/styles/globals.css   Tailwind tokens and publication rules
work/en_h/               human-reviewed English source chapters
work/ko_h/               human-reviewed Korean source chapters
assets/images-en/        108 original English figures
assets/images-ko/        108 original Korean figures
docs/design-system.md    shared layout and content rules
```

This is an unofficial guide and is not affiliated with OpenAI.
