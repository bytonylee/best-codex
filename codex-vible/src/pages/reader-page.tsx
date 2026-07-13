import { useEffect, useMemo, useState } from "react"
import parse, { domToReact, Element, type DOMNode } from "html-react-parser"

import { NavigationList, PartPreview } from "@/components/book-navigation"
import { CodeBlock } from "@/components/code-block"
import { SiteHeader } from "@/components/site-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { copy, type BookDocument, type Locale } from "@/content/book"

function nodeText(node: unknown): string {
  if (!node || typeof node !== "object") return ""
  if ("type" in node && node.type === "text" && "data" in node && typeof node.data === "string") {
    return node.data
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map(nodeText).join("")
  }
  return ""
}

function codeLanguage(node: Element) {
  const code = node.children.find(
    (child): child is Element => child.type === "tag" && child.name === "code",
  )
  const className = code?.attribs?.class ?? ""
  return className.match(/language-([\w-]+)/)?.[1] ?? "text"
}

export function ReaderPage({ document, locale }: { document: BookDocument; locale: Locale }) {
  const [activeId, setActiveId] = useState(document.headings.find((heading) => heading.level === 2)?.id)
  const [progress, setProgress] = useState(0)
  const labels = copy[locale]
  const body = useMemo(
    () => parse(document.html, {
      replace(node) {
        if (node instanceof Element && node.name === "pre") {
          return (
            <CodeBlock
              code={nodeText(node)}
              language={codeLanguage(node)}
              locale={locale}
            />
          )
        }
        if (node instanceof Element && node.name === "hr") {
          return <Separator className="article-separator" />
        }
        if (node instanceof Element && node.name === "a" && node.attribs) {
          const { href, ...attributes } = node.attribs
          return (
            <a {...attributes} href={href}>
              {domToReact(node.children as unknown as DOMNode[])}
            </a>
          )
        }
      },
    }),
    [document.html, locale],
  )

  useEffect(() => {
    const targets = document.headings
      .filter((heading) => heading.level === 2 || heading.level === 3)
      .map((heading) => window.document.getElementById(heading.id))
      .filter((heading): heading is HTMLElement => Boolean(heading))
    let frame = 0

    function updateReadingState() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const current = targets.filter((heading) => heading.getBoundingClientRect().top <= 96).at(-1)
        if (current) setActiveId(current.id)

        const root = window.document.documentElement
        const scrollable = root.scrollHeight - root.clientHeight
        setProgress(scrollable > 0 ? Math.min(100, (root.scrollTop / scrollable) * 100) : 0)
      })
    }

    const hashTarget = window.document.getElementById(window.location.hash.slice(1))
    if (hashTarget) {
      const previousScrollBehavior = window.document.documentElement.style.scrollBehavior
      window.document.documentElement.style.scrollBehavior = "auto"
      hashTarget.scrollIntoView()
      window.document.documentElement.style.scrollBehavior = previousScrollBehavior
    }
    updateReadingState()
    window.addEventListener("scroll", updateReadingState, { passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", updateReadingState)
    }
  }, [document.headings])

  return (
    <div className="reader-page">
      <SiteHeader headings={document.headings} locale={locale} activeId={activeId} />
      <div
        className="reading-progress"
        role="progressbar"
        aria-label={locale === "ko" ? "현재 문서 읽기 진행률" : "Current reading progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        style={{ width: `${progress}%` }}
      />

      <div className="reader-layout">
        <aside className="book-rail">
          <div className="rail-heading">
            <span>{labels.contents}</span>
            <span>12</span>
          </div>
          <ScrollArea className="rail-scroll">
            <NavigationList headings={document.headings} locale={locale} mode="book" activeId={activeId} />
          </ScrollArea>
        </aside>

        <main className="article-column">
          <section className="chapter-masthead">
            <p>{labels.intro}</p>
            <h1>{labels.homeTitle}</h1>
            <p>{labels.homeDescription}</p>
            <dl>
              <div><dt>{locale === "ko" ? "에디션" : "Edition"}</dt><dd>{labels.edition}</dd></div>
              <div><dt>{locale === "ko" ? "검토일" : "Reviewed"}</dt><dd>{labels.updated}</dd></div>
            </dl>
            <PartPreview locale={locale} />
          </section>

          <article className="book-content">{body}</article>

          <footer className="article-footer">
            <p>{labels.sourceNote}</p>
            <a href="https://github.com/bozhouDev/codex-orange-book" target="_blank" rel="noreferrer">
              {locale === "ko" ? "원문 저장소에서 확인하기" : "Review the source repository"}
            </a>
          </footer>
        </main>

        <aside className="page-outline">
          <p>{labels.onThisPage}</p>
          <NavigationList headings={document.headings} locale={locale} mode="page" activeId={activeId} />
        </aside>
      </div>
    </div>
  )
}
