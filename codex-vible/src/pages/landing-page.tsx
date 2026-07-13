import { ArrowRightIcon, GithubIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

const editions = [
  {
    locale: "en",
    label: "English edition",
    description: "Read the complete practical guide in English.",
    action: "Read in English",
  },
  {
    locale: "ko",
    label: "한국어판",
    description: "자연스러운 한국어로 정리한 전체 실전 가이드를 읽어보세요.",
    action: "한국어로 읽기",
  },
] as const

export function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <a className="wordmark wordmark-inverse" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>Codex Vible</span>
        </a>
        <Button asChild variant="ghost" size="icon" className="github-link">
          <a
            href="https://github.com/bozhouDev/codex-orange-book"
            target="_blank"
            rel="noreferrer"
            aria-label="Open the source repository on GitHub"
          >
            <GithubIcon />
          </a>
        </Button>
      </header>

      <section className="landing-intro" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="edition-line">Unofficial guide, continuously reviewed</p>
          <h1 id="landing-title">Codex Vible</h1>
          <p className="landing-lede">
            A practical field guide that explains how to install, configure, and use Codex while you build real software.
          </p>
        </div>

        <div className="edition-list" aria-label="Choose a language">
          {editions.map((edition, index) => (
            <div className="edition-row" key={edition.locale}>
              <span className="edition-number">0{index + 1}</span>
              <div>
                <h2>{edition.label}</h2>
                <p>{edition.description}</p>
              </div>
              <Button asChild variant="outline" size="icon-lg">
                <a href={`/${edition.locale}`} aria-label={edition.action}>
                  <ArrowRightIcon />
                </a>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <Separator />
        <div>
          <p>Five parts cover the full journey from first principles to real project delivery.</p>
          <p>Version 0.2 · Reviewed July 11, 2026</p>
        </div>
      </footer>
    </main>
  )
}
