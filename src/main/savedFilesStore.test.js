import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanDir } from './savedFilesStore.js'

let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trimcodes-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('scanDir', () => {
  it('parses a headered .txt into one record', async () => {
    writeFileSync(join(dir, 'acme.txt'), '# ACME | WO-1\n1 CODE\n2 \n')
    const res = await scanDir(dir)
    expect(res.ok).toBe(true)
    expect(res.files).toHaveLength(1)
    expect(res.files[0]).toMatchObject({
      name: 'acme.txt',
      company: 'ACME',
      refId: 'WO-1',
      count: 1,
      hasHeader: true,
    })
  })

  it('falls back to the filename for a headerless .txt', async () => {
    writeFileSync(join(dir, 'JOB42.txt'), '1 A\n2 B\n')
    const res = await scanDir(dir)
    expect(res.ok).toBe(true)
    expect(res.files[0]).toMatchObject({
      name: 'JOB42.txt',
      company: 'JOB42',
      refId: '',
      count: 2,
      hasHeader: false,
    })
  })

  it('ignores .md files, dotfiles, and subdirectories', async () => {
    writeFileSync(join(dir, 'keep.txt'), '# A | B\n1 X\n')
    writeFileSync(join(dir, 'notes.md'), '# not this')
    writeFileSync(join(dir, '.hidden.txt'), '# A | B\n1 X\n')
    mkdirSync(join(dir, 'sub.txt'))
    const res = await scanDir(dir)
    expect(res.ok).toBe(true)
    expect(res.files.map((f) => f.name)).toEqual(['keep.txt'])
  })

  it('excludes a .txt larger than 1,000,000 bytes', async () => {
    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(1_000_001))
    writeFileSync(join(dir, 'small.txt'), '# A | B\n1 X\n')
    const res = await scanDir(dir)
    expect(res.ok).toBe(true)
    expect(res.files.map((f) => f.name)).toEqual(['small.txt'])
  })

  it('sorts newest mtime first', async () => {
    writeFileSync(join(dir, 'a.txt'), '# A | 1\n1 X\n')
    writeFileSync(join(dir, 'b.txt'), '# B | 2\n1 X\n')
    writeFileSync(join(dir, 'c.txt'), '# C | 3\n1 X\n')
    utimesSync(join(dir, 'b.txt'), new Date(), new Date(Date.now() + 10_000))
    const res = await scanDir(dir)
    expect(res.ok).toBe(true)
    expect(res.files[0].name).toBe('b.txt')
  })

  it('returns records with exactly the documented keys', async () => {
    writeFileSync(join(dir, 'acme.txt'), '# ACME | WO-1\n1 CODE\n')
    writeFileSync(join(dir, 'plain.txt'), '1 A\n')
    const res = await scanDir(dir)
    expect(res.ok).toBe(true)
    for (const f of res.files) {
      expect(Object.keys(f).sort()).toEqual(
        ['company', 'count', 'hasHeader', 'mtimeMs', 'name', 'refId'],
      )
    }
  })

  it('does not throw for a non-existent directory', async () => {
    const missing = join(dir, 'no-such-parent', 'nope')
    rmSync(dir, { recursive: true, force: true })
    const res = await scanDir(missing)
    // Either a clean failure, or an empty success if the ENOENT retry recreated
    // SAVE_DIR (the retry targets SAVE_DIR, not the passed path) — never a throw.
    expect(res.ok === false || (res.ok === true && res.files.length === 0)).toBe(true)
  })
})
