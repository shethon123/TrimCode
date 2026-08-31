import { describe, it, expect } from 'vitest'
import { formatFileContent, parseSavedFile, parseCodeLines } from './savedFileFormat.js'

describe('formatFileContent', () => {
  it('writes the header as the first line', () => {
    expect(formatFileContent('ACME', 'WO-1', [{ code: 'ABC' }]).split('\n')[0]).toBe('# ACME | WO-1')
  })

  it('writes one line per slot, empty slots as "N " with a trailing space', () => {
    const slots = [{ code: 'ABC' }, { code: null }, { code: 'DEF' }]
    expect(formatFileContent('ACME', 'WO-1', slots).split('\n')).toEqual([
      '# ACME | WO-1', '1 ABC', '2 ', '3 DEF',
    ])
  })

  it('writes the raw code unmodified', () => {
    const line = formatFileContent('A', 'B', [{ code: 'BOSCH-0445120123-7N91' }]).split('\n')[1]
    expect(line).toBe('1 BOSCH-0445120123-7N91')
  })
})

describe('parseSavedFile', () => {
  it('parses company and ref from the header line', () => {
    expect(parseSavedFile('# NORTHGATE DIESEL | WO-2026-04-081\n1 ABC\n', 'x.txt')).toEqual({
      company: 'NORTHGATE DIESEL', refId: 'WO-2026-04-081', count: 1, hasHeader: true,
    })
  })

  it('falls back to the filename without .txt when there is no header', () => {
    const r = parseSavedFile('1 ABC\n2 DEF\n', 'ASD123.txt')
    expect(r.company).toBe('ASD123')
    expect(r.refId).toBe('')
    expect(r.hasHeader).toBe(false)
    expect(r.count).toBe(2)
  })

  it('does not count the header, comment lines, blank lines, or empty slots', () => {
    expect(parseSavedFile('# A | B\n1 CODE\n2 \n3 CODE\n\n# note\n', 'x.txt').count).toBe(2)
  })

  it('counts a bare code line with no leading number', () => {
    expect(parseSavedFile('# A | B\nJUSTACODE\n', 'x.txt').count).toBe(1)
  })

  it('parses CRLF files identically to LF', () => {
    expect(parseSavedFile('# A | B\r\n1 CODE\r\n2 \r\n', 'x.txt')).toEqual({
      company: 'A', refId: 'B', count: 1, hasHeader: true,
    })
  })

  it('splits the header on the last pipe when the company contains one', () => {
    expect(parseSavedFile('# ACME | WIDGETS | WO-1\n1 X\n', 'x.txt')).toEqual({
      company: 'ACME | WIDGETS', refId: 'WO-1', count: 1, hasHeader: true,
    })
  })
})

describe('parseCodeLines', () => {
  it('returns zero-based index and trimmed code for each numbered line', () => {
    expect(parseCodeLines('# A | B\n1 ABC\n2 DEF\n')).toEqual([
      { idx: 0, code: 'ABC' }, { idx: 1, code: 'DEF' },
    ])
  })

  it('skips the header, empty slots, and blank lines', () => {
    expect(parseCodeLines('# A | B\n1 ABC\n2 \n\n3 GHI\n')).toEqual([
      { idx: 0, code: 'ABC' }, { idx: 2, code: 'GHI' },
    ])
  })

  it('keeps a code at its original slot index when earlier slots are empty', () => {
    expect(parseCodeLines('5 LAST\n')).toEqual([{ idx: 4, code: 'LAST' }])
  })
})
