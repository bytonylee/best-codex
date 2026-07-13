import { BookOpenIcon, LanguagesIcon, MenuIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { copy, parts, type Heading, type Locale } from "@/content/book"

interface NavigationListProps {
  headings: Heading[]
  locale: Locale
  mode: "book" | "page"
  activeId?: string
}

export function NavigationList({ headings, locale, mode, activeId }: NavigationListProps) {
  const visible = mode === "book"
    ? headings.filter((heading) => heading.level <= 2)
    : headings.filter((heading) => heading.level === 2 || heading.level === 3)

  return (
    <nav aria-label={mode === "book" ? copy[locale].contents : copy[locale].onThisPage}>
      <ol className={mode === "book" ? "book-list" : "page-list"}>
        {visible.map((heading) => (
          <li key={heading.id} data-level={heading.level}>
            <a aria-current={heading.id === activeId ? "location" : undefined} href={`#${heading.id}`}>
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

interface MobileNavigationProps {
  headings: Heading[]
  locale: Locale
  activeId?: string
}

export function MobileNavigation({ headings, locale, activeId }: MobileNavigationProps) {
  const labels = copy[locale]

  return (
    <div className="mobile-nav-actions">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={labels.bookMenu}>
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="navigation-sheet">
          <SheetHeader>
            <SheetTitle>{labels.contents}</SheetTitle>
            <SheetDescription>{labels.homeDescription}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="sheet-scroll">
            <NavigationList headings={headings} locale={locale} mode="book" activeId={activeId} />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={labels.pageMenu}>
            <BookOpenIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="navigation-sheet">
          <SheetHeader>
            <SheetTitle>{labels.onThisPage}</SheetTitle>
            <SheetDescription>{labels.updated}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="sheet-scroll">
            <NavigationList headings={headings} locale={locale} mode="page" activeId={activeId} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function PartPreview({ locale }: { locale: Locale }) {
  return (
    <ol className="part-preview">
      {parts[locale].map((part, index) => (
        <li key={part}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{part}</strong>
        </li>
      ))}
    </ol>
  )
}

export function LanguageLink({ locale }: { locale: Locale }) {
  const target = locale === "en" ? "ko" : "en"
  return (
    <Button asChild variant="ghost" size="sm">
      <a href={`/${target}`}>
        <LanguagesIcon data-icon="inline-start" />
        {copy[locale].switchLanguage}
      </a>
    </Button>
  )
}
