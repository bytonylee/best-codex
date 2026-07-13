import { koreanDocument } from "@/content/korean"
import { ReaderPage } from "@/pages/reader-page"

export default function KoreanReaderPage() {
  return <ReaderPage document={koreanDocument} locale="ko" />
}
