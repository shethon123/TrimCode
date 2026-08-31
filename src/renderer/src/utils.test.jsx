import { describe, it, expect } from 'vitest'
import { buildFilename, normalizeSearch } from './utils'

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
