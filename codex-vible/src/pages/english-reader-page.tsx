import { englishDocument } from "@/content/english"
import { ReaderPage } from "@/pages/reader-page"

export default function EnglishReaderPage() {
  return <ReaderPage document={englishDocument} locale="en" />
}
