import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/app"
import { TooltipProvider } from "@/components/ui/tooltip"
import "@/styles/globals.css"

const locale = window.location.pathname.split("/").filter(Boolean)[0]
document.documentElement.lang = locale === "ko" ? "ko" : "en"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
