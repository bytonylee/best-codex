import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { copy, type Heading, type Locale } from "@/content/book"
import { LanguageLink, MobileNavigation } from "@/components/book-navigation"

interface SiteHeaderProps {
  activeId?: string
  headings: Heading[]
  locale: Locale
}

export function SiteHeader({ activeId, headings, locale }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-start">
          <MobileNavigation headings={headings} locale={locale} activeId={activeId} />
          <a className="wordmark" href="/" aria-label={copy[locale].backHome}>
            <span className="brand-mark" aria-hidden="true" />
            <span>Codex Vible</span>
          </a>
        </div>
        <div className="header-meta">
          <span>{copy[locale].edition}</span>
          <span aria-hidden="true">/</span>
          <span>{copy[locale].updated}</span>
        </div>
        <div className="header-end">
          <Button asChild variant="ghost" size="icon" className="home-button">
            <a href="/" aria-label={copy[locale].backHome}>
              <ArrowLeftIcon />
            </a>
          </Button>
          <LanguageLink locale={locale} />
        </div>
      </div>
    </header>
  )
}
