import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildFilename, formatFileContent } from './utils'

describe('buildFilename', () => {
  it('concatenates company and refId with .txt extension', () => {
    expect(buildFilename('ABC', '123')).toBe('ABC123.txt')
  })

  it('preserves all characters including hyphens', () => {
    expect(buildFilename('NORTHGATE', 'WO-081')).toBe('NORTHGATEWO-081.txt')
  })
})

describe('formatFileContent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // April 20 2026 12:33 PM
    vi.setSystemTime(new Date(2026, 3, 20, 12, 33, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('writes timestamp on first line in MM-DD-YYYY HH:MM AM/PM format', () => {
    const slots = [{ id: '1', code: 'ABCDEF', scannedAt: Date.now() }]
    const content = formatFileContent(slots, 6)
    expect(content.split('\n')[0]).toBe('[04-20-2026 12:33 PM]')
  })

  it('numbers filled slots sequentially and skips empty slots', () => {
    const slots = [
      { id: '1', code: 'ABCDEF', scannedAt: Date.now() },
      { id: '2', code: null, scannedAt: null },
      { id: '3', code: 'GHIJKL', scannedAt: Date.now() },
    ]
    const content = formatFileContent(slots, 6)
    const lines = content.split('\n')
    expect(lines[1]).toBe('1 ABCDEF')
    expect(lines[2]).toBe('2 GHIJKL')
    expect(lines).toHaveLength(3)
  })

  it('applies trimRight to codes longer than trimDigits', () => {
    const slots = [{ id: '1', code: 'BOSCH-0445120123-7N91', scannedAt: Date.now() }]
    const content = formatFileContent(slots, 4)
    const lines = content.split('\n')
    // last 4 chars of 'BOSCH-0445120123-7N91' = '7N91'
    expect(lines[1]).toBe('1 7N91')
  })

  it('returns only timestamp line when all slots are empty', () => {
    const slots = [
      { id: '1', code: null, scannedAt: null },
      { id: '2', code: null, scannedAt: null },
    ]
    const content = formatFileContent(slots, 6)
    expect(content.split('\n')).toHaveLength(1)
    expect(content).toBe('[04-20-2026 12:33 PM]')
  })
})
