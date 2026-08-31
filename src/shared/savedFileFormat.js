// Pure helpers for the trimcodes .txt file format. No DOM, no React —
// imported by both the renderer (via utils.jsx) and the main-process
// folder scanner.

const HEADER_RE = /^#\s*(.*?)\s*\|\s*(.*)$/

export function formatFileContent(company, refId, slots) {
  const lines = [`# ${company} | ${refId}`]
  slots.forEach((slot, i) => {
    lines.push(slot.code ? `${i + 1} ${slot.code}` : `${i + 1} `)
  })
  return lines.join('\n')
}

export function parseSavedFile(text, filename) {
  const lines = String(text).split(/\r?\n/)
  const headerMatch = lines[0] ? lines[0].match(HEADER_RE) : null

  let company, refId, hasHeader, bodyLines
  if (headerMatch) {
    company = headerMatch[1].trim()
    refId = headerMatch[2].trim()
    hasHeader = true
    bodyLines = lines.slice(1)
  } else {
    company = filename.replace(/\.txt$/i, '')
    refId = ''
    hasHeader = false
    bodyLines = lines
  }

  let count = 0
  for (const line of bodyLines) {
    if (!line.trim()) continue
    if (line.startsWith('#')) continue
    if (line.replace(/^\s*\d+\s*/, '').trim()) count++
  }

  return { company, refId, count, hasHeader }
}

export function parseCodeLines(text) {
  const out = []
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const m = line.match(/^(\d+)\s+(.+)$/)
    if (!m) continue
    const code = m[2].trim()
    if (code) out.push({ idx: Number(m[1]) - 1, code })
  }
  return out
}
