import { prepareDocument } from "@/content/book"

const chunks = import.meta.glob("/work/en_h/*.html", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>

export const englishDocument = prepareDocument(chunks, "en")
