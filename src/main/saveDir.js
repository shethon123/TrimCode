import { join, sep } from 'node:path'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

export const SAVE_DIR = join(homedir(), 'Documents', 'trimcodes')

export function ensureSaveDir() {
  mkdirSync(SAVE_DIR, { recursive: true })
}

// Resolve a bare filename to an absolute path inside SAVE_DIR.
// Throws if the name could escape the directory.
export function safeResolve(name) {
  if (
    typeof name !== 'string' || name.length === 0 ||
    name.includes('/') || name.includes('\\') || name.includes('\0') ||
    name === '.' || name === '..'
  ) {
    throw new Error(`Invalid filename: ${JSON.stringify(name)}`)
  }
  const full = join(SAVE_DIR, name)
  if (!full.startsWith(SAVE_DIR + sep)) {
    throw new Error(`Filename escapes save directory: ${name}`)
  }
  return full
}
