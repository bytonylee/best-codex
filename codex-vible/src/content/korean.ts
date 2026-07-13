import { prepareDocument } from "@/content/book"

const chunks = import.meta.glob("/work/ko_h/*.html", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>

export const koreanDocument = prepareDocument(chunks, "ko")
