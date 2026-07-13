import fs from "node:fs"

const sources = [
  { directory: "work/en_h", sentenceEnd: /[.!?:;\])”’"]$/ },
  { directory: "work/ko_h", sentenceEnd: /[.!?:;\])”’"]|(?:다|요|죠|까|세요|니다|합니다|됩니다|있습니다|없습니다)[.!?]?$/ },
]

let hasFragments = false

for (const { directory, sentenceEnd } of sources) {
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".html")).sort()
  let blockCount = 0

  for (const file of files) {
    const source = fs.readFileSync(`${directory}/${file}`, "utf8")
    for (const match of source.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const text = match[2]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[^;]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim()

      blockCount += 1
      if (text.length <= 48 || sentenceEnd.test(text)) continue

      hasFragments = true
      const line = source.slice(0, match.index).split("\n").length
      console.error(`${directory}/${file}:${line}: Review this long fragment: ${text}`)
    }
  }

  console.log(`${directory}: reviewed ${blockCount} paragraphs and list items.`)
}

if (hasFragments) process.exitCode = 1
