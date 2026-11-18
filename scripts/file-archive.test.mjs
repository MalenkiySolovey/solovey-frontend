import test from 'node:test'
import assert from 'node:assert/strict'
import {gzipSync} from 'node:zlib'
import {packFiles, unpackFiles, sha256, safeArchivePath} from './file-archive.mjs'
const malformed = value => { const bytes = gzipSync(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))); return () => unpackFiles(bytes, sha256(bytes), 'distribution') }
const payload = files => ({schema: 'solovey.frontend-file-archive/v1', kind: 'distribution', files})
test('archives roundtrip only regular named bytes and are deterministic', () => {
  const files = new Map([['.vite/manifest.json', Buffer.from('{}')], ['assets/app.js', Buffer.from('export {}')]])
  const a = packFiles('distribution', files), b = packFiles('distribution', files)
  assert.ok(a.equals(b)); assert.deepEqual(unpackFiles(a, sha256(a), 'distribution'), files)
})
test('portable gzip header has no build host or timestamp identity', () => {
  const bytes = packFiles('source', new Map([['file', Buffer.from('same bytes')]]))
  assert.deepEqual([...bytes.subarray(0, 10)], [31, 139, 8, 0, 0, 0, 0, 0, 2, 255])
})
test('archive rejects missing or forged caller trust, corrupted bytes and wrong kind', () => {
  const bytes = packFiles('source', new Map([['package.json', Buffer.from('{}')]]))
  assert.throws(() => unpackFiles(bytes, undefined, 'source'))
  assert.throws(() => unpackFiles(bytes, '0'.repeat(64), 'source'), /SHA256 mismatch/)
  assert.throws(() => unpackFiles(bytes, sha256(bytes), 'distribution'), /wrong archive kind/)
  const corrupt = Buffer.from(bytes); corrupt[corrupt.length - 1] ^= 1
  assert.throws(() => unpackFiles(corrupt, sha256(bytes), 'source'), /SHA256 mismatch/)
})
for (const name of ['../escape', '/absolute', 'C:/absolute', 'assets\\escape', 'a/../b', 'a//b', '.git/config', 'assets/NUL.js', 'assets/file.','assets/file ', 'a\0b']) test('archive rejects unsafe path ' + JSON.stringify(name), () => assert.throws(() => safeArchivePath(name)))
test('archive rejects case aliases, directory collisions, unknown fields and bad encodings', () => {
  for (const files of [{'A.js':'YQ==','a.js':'YQ=='}, {'A':'YQ==','A/b':'YQ=='}, {'A/b':'YQ==','a/c':'YQ=='}, {'file.js':'***'}, {'z':'YQ==','a':'YQ=='}]) assert.throws(malformed(payload(files)))
  assert.throws(malformed({...payload({'a':'YQ=='}), executable: true}))
  assert.throws(malformed(payload({})))
  assert.throws(malformed(payload({'a': {link:'outside'}})))
})
test('duplicate JSON keys cannot hide extra archive contents', () => {
  assert.throws(malformed('{"schema":"solovey.frontend-file-archive/v1","kind":"distribution","files":{"a":"YQ==","a":"Yg=="}}'), /non-canonical/)
})
