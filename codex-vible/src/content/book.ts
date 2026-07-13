export type Locale = "en" | "ko"

export interface Heading {
  id: string
  level: 1 | 2 | 3 | 4
  text: string
}

export interface BookDocument {
  html: string
  headings: Heading[]
}

function stripTags(value: string) {
  const text = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const textarea = document.createElement("textarea")
  textarea.innerHTML = text
  return textarea.value
}

export function prepareDocument(chunks: Record<string, string>, locale: Locale): BookDocument {
  const source = Object.entries(chunks)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, chunk]) => chunk)
    .join("\n")
    .replaceAll("assets/images/", `/images-${locale}/`)

  let index = 0
  const headings: Heading[] = []
  const html = source.replace(
    /<(h[1-4])([^>]*)>(.*?)<\/\1>/gs,
    (_match, tag: string, attributes: string, content: string) => {
      index += 1
      const id = `s${index}`
      const level = Number(tag.slice(1)) as Heading["level"]
      headings.push({ id, level, text: stripTags(content) })
      return `<${tag}${attributes} id="${id}">${content}</${tag}>`
    },
  )

  return { html, headings }
}

export const copy = {
  en: {
    productName: "Codex Vible",
    nativeName: "Codex guide",
    edition: "English edition",
    updated: "Reviewed on July 11, 2026",
    homeTitle: "Use Codex with confidence in real projects.",
    homeDescription:
      "Codex Vible explains the entire workflow in plain language, from installation and configuration to collaboration, automation, and delivery.",
    readAction: "Read the English guide",
    switchLanguage: "한국어로 읽기",
    bookMenu: "Open the book contents",
    pageMenu: "Open this page’s outline",
    contents: "Book contents",
    onThisPage: "On this page",
    intro: "Start here",
    copyCode: "Copy this code",
    copiedCode: "Code copied",
    codeLabel: "Code example",
    backHome: "Go to the language selection page",
    sourceNote:
      "This is an unofficial guide. Confirm fast-changing product details in the current OpenAI documentation.",
  },
  ko: {
    productName: "Codex Vible",
    nativeName: "Codex 바이블",
    edition: "한국어판",
    updated: "2026년 7월 11일 검토",
    homeTitle: "실전 프로젝트에서 Codex를 자신 있게 활용하세요.",
    homeDescription:
      "Codex Vible은 설치와 설정부터 협업, 자동화, 결과물 전달까지의 전 과정을 자연스러운 문장과 실용적인 예제로 설명합니다.",
    readAction: "한국어 가이드 읽기",
    switchLanguage: "Read in English",
    bookMenu: "책 전체 목차 열기",
    pageMenu: "현재 페이지 목차 열기",
    contents: "책 전체 목차",
    onThisPage: "현재 페이지",
    intro: "여기서 시작하세요",
    copyCode: "이 코드를 복사하기",
    copiedCode: "코드를 복사했습니다",
    codeLabel: "코드 예제",
    backHome: "언어 선택 페이지로 이동하기",
    sourceNote:
      "이 문서는 비공식 가이드입니다. 빠르게 바뀌는 제품 정보는 최신 OpenAI 공식 문서에서 다시 확인하세요.",
  },
} as const

export const parts = {
  en: [
    "Understand Codex",
    "Install and configure it",
    "Use the core features",
    "Build a reliable workflow",
    "Apply it to real projects",
  ],
  ko: [
    "Codex 이해하기",
    "설치하고 환경 설정하기",
    "핵심 기능 활용하기",
    "안정적인 작업 흐름 만들기",
    "실전 프로젝트에 적용하기",
  ],
} as const
