import { describe, it, expect } from 'vitest'
import { sep } from 'node:path'
import { SAVE_DIR, safeResolve } from './saveDir.js'

describe('safeResolve', () => {
  it('joins a bare filename onto SAVE_DIR', () => {
    expect(safeResolve('ABC123.txt')).toBe(SAVE_DIR + sep + 'ABC123.txt')
  })

  it('throws on a forward-slash path', () => {
    expect(() => safeResolve('../evil.txt')).toThrow()
    expect(() => safeResolve('sub/ABC.txt')).toThrow()
  })

  it('throws on a backslash path', () => {
    expect(() => safeResolve('sub\\ABC.txt')).toThrow()
  })

  it('throws on "." and ".."', () => {
    expect(() => safeResolve('.')).toThrow()
    expect(() => safeResolve('..')).toThrow()
  })

  it('throws on empty or non-string input', () => {
    expect(() => safeResolve('')).toThrow()
    expect(() => safeResolve(null)).toThrow()
    expect(() => safeResolve(undefined)).toThrow()
  })
})
