import { lazy, Suspense } from "react"

import { LandingPage } from "@/pages/landing-page"
import type { Locale } from "@/content/book"

const EnglishReaderPage = lazy(() => import("@/pages/english-reader-page"))
const KoreanReaderPage = lazy(() => import("@/pages/korean-reader-page"))

function localeFromPath(pathname: string): Locale | null {
  const segment = pathname.split("/").filter(Boolean)[0]
  return segment === "en" || segment === "ko" ? segment : null
}

export function App() {
  const locale = localeFromPath(window.location.pathname)
  if (!locale) return <LandingPage />

  return (
    <Suspense fallback={<div className="reader-loading" aria-live="polite" />}>
      {locale === "ko" ? <KoreanReaderPage /> : <EnglishReaderPage />}
    </Suspense>
  )
}
