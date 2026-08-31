import { watch } from 'node:fs'
import { readdir, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SAVE_DIR, ensureSaveDir } from './saveDir.js'
import { parseSavedFile } from '../shared/savedFileFormat.js'

const DEBOUNCE_MS = 300
const MAX_BYTES = 1_000_000
const CONCURRENCY = 8

let getWindow = () => null
let watcher = null
let debounceTimer = null

export function initSavedFilesStore(getWindowFn) {
  getWindow = getWindowFn
  startWatcher()
  scanAndBroadcast().catch(() => {})
}

export function disposeSavedFilesStore() {
  if (watcher) { try { watcher.close() } catch {} watcher = null }
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
}

function startWatcher() {
  if (watcher) return
  try {
    watcher = watch(SAVE_DIR, { persistent: true }, () => scheduleScan())
    watcher.on('error', handleWatcherError)
  } catch (err) {
    // Synchronous failure (e.g. dir missing on Linux). Leave watcher null so the
    // next scanAndBroadcast() retries it — do NOT re-trigger a scan from here,
    // that path recurses without bound.
    watcher = null
    console.warn('trimcodes watcher failed to start:', err && err.message)
  }
}

function handleWatcherError() {
  if (watcher) { try { watcher.close() } catch {} watcher = null }
  scanAndBroadcast()
}

function scheduleScan() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { debounceTimer = null; scanAndBroadcast().catch(() => {}) }, DEBOUNCE_MS)
}

async function mapCapped(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function scanAndBroadcast() {
  const result = await scan()
  // Re-arm the watcher only after scan() has had a chance to recreate the
  // directory via its ENOENT retry. Doing this before the await risks unbounded
  // recursion when watch() throws synchronously on a missing dir.
  if (!watcher) startWatcher()
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('saved-files:update', result)
  }
  return result
}

async function scan() {
  let entries
  try {
    entries = await readdir(SAVE_DIR, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        ensureSaveDir()
        entries = await readdir(SAVE_DIR, { withFileTypes: true })
      } catch (err2) {
        return { ok: false, error: err2.message }
      }
    } else {
      return { ok: false, error: err.message }
    }
  }

  const names = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.txt') && !e.name.startsWith('.'))
    .map((e) => e.name)

  const statted = await mapCapped(names, CONCURRENCY, async (name) => {
    try {
      const s = await stat(join(SAVE_DIR, name))
      return s.size > MAX_BYTES ? null : { name, mtimeMs: s.mtimeMs }
    } catch {
      return null
    }
  })

  const records = await mapCapped(statted.filter(Boolean), CONCURRENCY, async (f) => {
    try {
      const text = await readFile(join(SAVE_DIR, f.name), 'utf8')
      const { company, refId, count, hasHeader } = parseSavedFile(text, f.name)
      return { name: f.name, mtimeMs: f.mtimeMs, company, refId, count, hasHeader }
    } catch {
      return null
    }
  })

  const files = records.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { ok: true, files }
}
