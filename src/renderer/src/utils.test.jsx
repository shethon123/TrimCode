import { describe, it, expect } from 'vitest'
import { buildFilename, normalizeSearch, scanSignature } from './utils'

describe('buildFilename', () => {
  it('concatenates company and refId with .txt extension', () => {
    expect(buildFilename('ABC', '123')).toBe('ABC123.txt')
  })

  it('preserves all characters including hyphens', () => {
    expect(buildFilename('NORTHGATE', 'WO-081')).toBe('NORTHGATEWO-081.txt')
  })
})

describe('normalizeSearch', () => {
  it('uppercases and strips spaces, dashes, periods', () => {
    expect(normalizeSearch('asd 123')).toBe('ASD123')
    expect(normalizeSearch('0w7-r7b')).toBe('0W7R7B')
    expect(normalizeSearch('a.s.d - 1 2 3')).toBe('ASD123')
  })

  it('handles nullish input', () => {
    expect(normalizeSearch(null)).toBe('')
    expect(normalizeSearch(undefined)).toBe('')
  })

  it('lets "asd 123" match "ASD123" as a substring', () => {
    expect(normalizeSearch('ASD123').includes(normalizeSearch('asd 123'))).toBe(true)
  })
})

describe('scanSignature', () => {
  const slots = (codes) => codes.map((code, i) => ({ id: `id-${i}`, code, scannedAt: code ? 111 : null }))

  it('is stable for the same company, refId, and slot codes', () => {
    const a = scanSignature('ACME', 'WO-1', slots(['AAA', 'BBB', null]))
    const b = scanSignature('ACME', 'WO-1', slots(['AAA', 'BBB', null]))
    expect(a).toBe(b)
  })

  it('ignores slot id and scannedAt, tracking only the code', () => {
    const a = scanSignature('ACME', 'WO-1', [{ id: 'x', code: 'AAA', scannedAt: 1 }])
    const b = scanSignature('ACME', 'WO-1', [{ id: 'y', code: 'AAA', scannedAt: 2 }])
    expect(a).toBe(b)
  })

  it('changes when a slot code changes', () => {
    const a = scanSignature('ACME', 'WO-1', slots(['AAA', 'BBB']))
    const b = scanSignature('ACME', 'WO-1', slots(['AAA', 'CCC']))
    expect(a).not.toBe(b)
  })

  it('changes when company or refId changes', () => {
    const base = scanSignature('ACME', 'WO-1', slots(['AAA']))
    expect(scanSignature('OTHER', 'WO-1', slots(['AAA']))).not.toBe(base)
    expect(scanSignature('ACME', 'WO-2', slots(['AAA']))).not.toBe(base)
  })

  it('distinguishes code order', () => {
    const a = scanSignature('ACME', 'WO-1', slots(['AAA', 'BBB']))
    const b = scanSignature('ACME', 'WO-1', slots(['BBB', 'AAA']))
    expect(a).not.toBe(b)
  })
})
