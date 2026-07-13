import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { copy, type Locale } from "@/content/book"

interface CodeBlockProps {
  code: string
  language?: string
  locale: Locale
}

export function CodeBlock({ code, language = "text", locale }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const labels = copy[locale]

  async function copyToClipboard() {
    await navigator.clipboard.writeText(code.replace(/\n$/, ""))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <figure className="code-block group/code">
      <figcaption>
        <span>{labels.codeLabel}</span>
        <span>{language}</span>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="code-copy"
            type="button"
            variant="secondary"
            size="icon-sm"
            aria-label={copied ? labels.copiedCode : labels.copyCode}
            onClick={copyToClipboard}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {copied ? labels.copiedCode : labels.copyCode}
        </TooltipContent>
      </Tooltip>
      <span className="sr-only" aria-live="polite">
        {copied ? labels.copiedCode : ""}
      </span>
    </figure>
  )
}
