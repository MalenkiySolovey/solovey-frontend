// Portable file-only transport. Trust comes from the caller's admitted SHA256.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {gzipSync, gunzipSync} from 'node:zlib'
import {fileURLToPath} from 'node:url'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function safeArchivePath(name) {
  assert.equal(typeof name, 'string')
  assert.ok(name && name.length <= 300 && name === name.normalize('NFC') && !name.startsWith('/') && !/[\\<>:"|?*]/.test(name) && [...name].every(character => character.codePointAt(0) >= 32), 'unsafe archive path')
  for (const part of name.split('/')) assert.ok(part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^\.(?:git|hg|svn|bzr)$/i.test(part) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part), 'unsafe archive path segment')
  return name
}
export function readRegularFiles(directory) {
  const files = new Map()
  const walk = (prefix = '', depth = 0) => {
    assert.ok(depth <= 24, 'archive nesting exceeds bound')
    const current = path.join(directory, prefix), stat = fs.lstatSync(current)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'archive directory must be regular')
    for (const name of fs.readdirSync(current).sort()) {
      const relative = safeArchivePath(prefix ? prefix + '/' + name : name), absolute = path.join(directory, relative), entry = fs.lstatSync(absolute)
      assert.ok(!entry.isSymbolicLink(), 'archive symlink rejected')
      if (entry.isDirectory()) walk(relative, depth + 1)
      else { assert.ok(entry.isFile(), 'archive file must be regular'); files.set(relative, fs.readFileSync(absolute)) }
    }
  }
  walk()
  return new Map([...files].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0))
}
export function packFiles(kind, files) {
  const encoded = Object.create(null)
  for (const [name, bytes] of [...files].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) encoded[safeArchivePath(name)] = Buffer.from(bytes).toString('base64')
  const bytes = gzipSync(Buffer.from(JSON.stringify({schema: 'solovey.frontend-file-archive/v1', kind, files: encoded})), {level: 9})
  // RFC 1952 OS=255 makes identical file payloads portable across build hosts.
  bytes[9] = 255
  unpackFiles(bytes, sha256(bytes), kind)
  return bytes
}
export function unpackFiles(bytes, trustedSHA256, expectedKind) {
  assert.match(trustedSHA256, /^[a-f0-9]{64}$/, 'caller-trusted archive hash required')
  assert.ok(bytes.length > 0 && bytes.length <= 32 * 1024 * 1024, 'archive size exceeds bound')
  assert.equal(sha256(bytes), trustedSHA256, 'archive SHA256 mismatch')
  const raw = gunzipSync(bytes, {maxOutputLength: 128 * 1024 * 1024}), parsed = JSON.parse(raw)
  assert.equal(raw.toString('utf8'), JSON.stringify(parsed), 'non-canonical archive JSON')
  assert.deepEqual(Object.keys(parsed), ['schema', 'kind', 'files'], 'unknown archive fields')
  assert.equal(parsed.schema, 'solovey.frontend-file-archive/v1')
  assert.equal(parsed.kind, expectedKind, 'wrong archive kind')
  assert.ok(parsed.files && typeof parsed.files === 'object' && !Array.isArray(parsed.files))
  const names = Object.keys(parsed.files)
  assert.ok(names.length > 0 && names.length <= 4096, 'archive file count exceeds bound')
  assert.deepEqual(names, [...names].sort(), 'archive paths must be ordered')
  const files = new Map(), caseNames = new Map(), directories = new Set(), fileNames = new Set()
  let total = 0
  for (const name of names) {
    safeArchivePath(name)
    let prefix = ''
    for (const part of name.split('/')) {
      prefix = prefix ? prefix + '/' + part : part
      const lower = prefix.toLowerCase()
      assert.ok(!caseNames.has(lower) || caseNames.get(lower) === prefix, 'archive case collision')
      caseNames.set(lower, prefix)
    }
    const lower = name.toLowerCase()
    assert.ok(!directories.has(lower), 'archive file/directory collision')
    const parts = name.split('/'); parts.pop()
    while (parts.length) { const dir = parts.join('/').toLowerCase(); assert.ok(!fileNames.has(dir), 'archive file/directory collision'); directories.add(dir); parts.pop() }
    assert.equal(typeof parsed.files[name], 'string', 'archive bytes must be base64')
    const content = Buffer.from(parsed.files[name], 'base64')
    assert.equal(content.toString('base64'), parsed.files[name], 'non-canonical archive base64')
    assert.ok(content.length <= 16 * 1024 * 1024 && (total += content.length) <= 96 * 1024 * 1024, 'archive payload exceeds bound')
    files.set(name, content); fileNames.add(lower)
  }
  return files
}
export function writeFreshFiles(directory, files) {
  assert.ok(!fs.existsSync(directory), 'archive destination must be fresh')
  fs.mkdirSync(directory, {recursive: true})
  for (const [name, bytes] of files) {
    safeArchivePath(name)
    const target = path.join(directory, name)
    assert.ok(path.resolve(target).startsWith(path.resolve(directory) + path.sep), 'archive escapes destination')
    fs.mkdirSync(path.dirname(target), {recursive: true})
    fs.writeFileSync(target, bytes, {flag: 'wx'})
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, filename, trusted, kind, destination] = process.argv.slice(2)
  assert.equal(command, 'extract')
  assert.ok(destination && process.argv.length === 7)
  writeFreshFiles(destination, unpackFiles(fs.readFileSync(filename), trusted, kind))
}
