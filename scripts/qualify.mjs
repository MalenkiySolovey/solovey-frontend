// Qualify exact tracked source with an admitted Product projection, without Go/Git in the build environment.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {stripVTControlCharacters} from 'node:util'
import {sha256, readRegularFiles, packFiles} from './file-archive.mjs'
import {prepareInputs, verifyPanelPresentation} from './prepare-inputs.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const out = path.resolve(process.argv[2] || '.artifacts/producer')
assert.ok(!fs.existsSync(out), 'qualification output must be fresh')
fs.mkdirSync(out, {recursive: true})
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}).trim()
assert.equal(git(['status', '--porcelain', '--untracked-files=normal']), '', 'producer source must be committed and clean')
const source = {repo: 'MalenkiySolovey/solovey-frontend', commit: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}'])}
const names = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean).sort()
const sourceFiles = new Map(names.map(name => [name, fs.readFileSync(path.join(root, name))]))
const sourceHashes = Object.fromEntries([...sourceFiles].map(([name, bytes]) => [name, sha256(bytes)]))
source.filesSHA256 = sha256(JSON.stringify(sourceHashes))
const version = JSON.parse(fs.readFileSync(path.join(root, 'qualification/version.json'))).version
assert.match(version, /^0\.[0-9]+\.[0-9]+$/)
const sourceArchive = packFiles('source', sourceFiles)
fs.writeFileSync(path.join(out, 'frontend-source.json.gz'), sourceArchive)
fs.writeFileSync(path.join(out, 'source-files.json'), JSON.stringify(sourceHashes, null, 2) + '\n')
const supplied = await prepareInputs(root, process.env.SOLOVEY_UI_INPUT_ARCHIVE)
const temporary = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'solovey frontend '))), work = path.join(temporary, 'frontend')
fs.mkdirSync(work)
for (const [name, bytes] of sourceFiles) { const filename = path.join(work, name); fs.mkdirSync(path.dirname(filename), {recursive: true}); fs.writeFileSync(filename, bytes) }
fs.cpSync(supplied.directory, path.join(work, '.component-inputs'), {recursive: true})
const env = {...process.env, CI: 'true', SOLOVEY_UI_INPUTS_SHA256: supplied.manifestSHA256}
for (const name of Object.keys(env)) if (name.toLowerCase() === 'path') delete env[name]
env.PATH = [path.dirname(process.execPath), ...(process.platform === 'win32' ? [path.join(process.env.SystemRoot, 'System32')] : [])].join(path.delimiter)
if (process.platform !== 'win32') env.npm_config_script_shell = '/bin/sh'
delete env.SOLOVEY_UI_COMPONENT_IDS
const candidates = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.join(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]
const npm = candidates.find(name => name && fs.existsSync(name))
assert.ok(npm, 'selected Node installation must supply npm')
const npmVersion = execFileSync(process.execPath, [npm, '--version'], {encoding: 'utf8'}).trim()
assert.equal(process.version, 'v' + supplied.admission.node, 'Node toolchain drift')
assert.equal(npmVersion, supplied.admission.npm, 'npm toolchain drift')
const toolchain = {node: supplied.admission.node, npm: npmVersion, packageLockSHA256: sha256(sourceFiles.get('package-lock.json'))}
const result = {schema: 'solovey.frontend-producer-proof/v1', source, version, toolchain, platform: process.platform, trustedInput: supplied.manifestSHA256, isolation: {onlyOwnSourceAndDeclaredInputs: true, goUnavailable: false, gitUnavailable: false}, commands: [], profiles: {}}
const index = {schema: 'solovey.frontend-distributions/v1', version, source, toolchain, input: {manifestSHA256: supplied.manifestSHA256, archiveSHA256: supplied.admission.archiveSHA256, productSource: supplied.admission.productSource}, sourceArchive: {filename: 'frontend-source.json.gz', sha256: sha256(sourceArchive), filesSHA256: source.filesSHA256}, profiles: {}}
const run = (name, args, taskEnv = env) => {
  const processResult = spawnSync(process.execPath, args, {cwd: work, env: taskEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true})
  fs.writeFileSync(path.join(out, name + '.log'), (processResult.stdout || '') + (processResult.stderr || ''))
  result.commands.push({name, status: processResult.status})
  if (processResult.error) throw processResult.error
  assert.equal(processResult.status, 0, name + ': ' + stripVTControlCharacters((processResult.stdout || '') + (processResult.stderr || '')).slice(-8000))
  console.log('[frontend-producer] ' + name + ': PASS')
}
const licenses = () => {
  const lock = JSON.parse(fs.readFileSync(path.join(work, 'package-lock.json'))), packages = [], runtimeNotices = {}
  for (const [name, item] of Object.entries(lock.packages).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (!name) continue
    packages.push({name, version: item.version, license: item.license || null, integrity: item.integrity || null, resolved: item.resolved || null, development: !!item.dev})
    if (item.dev || item.optional) continue
    const directory = path.join(work, name)
    if (!fs.existsSync(directory)) continue
    const notices = {}
    for (const filename of fs.readdirSync(directory).sort()) if (/^(?:licen[cs]e|copying|notice|copyright)(?:\.|$)/i.test(filename) && fs.lstatSync(path.join(directory, filename)).isFile()) notices[filename] = fs.readFileSync(path.join(directory, filename), 'utf8')
    runtimeNotices[name] = {version: item.version, license: item.license || null, notices}
  }
  return Buffer.from(JSON.stringify({schema: 'solovey.frontend-third-party-notices/v1', packageLockSHA256: toolchain.packageLockSHA256, packages, runtimeNotices}, null, 2) + '\n')
}
const qualifyDist = (key, profile, componentIDs, inputHash, thirdParty) => {
  const dist = readRegularFiles(path.join(work, 'dist')), manifestBytes = dist.get('.vite/manifest.json')
  assert.ok(dist.get('index.html') && manifestBytes, 'Vite entry and manifest required')
  const manifest = JSON.parse(manifestBytes)
  assert.ok(manifest['index.html']?.isEntry)
  for (const entry of Object.values(manifest)) {
    for (const name of [entry.file, ...(entry.css || []), ...(entry.assets || [])]) assert.ok(dist.has(name), 'missing Vite output: ' + name)
    for (const name of [...(entry.imports || []), ...(entry.dynamicImports || [])]) assert.ok(Object.hasOwn(manifest, name), 'missing Vite manifest dependency: ' + name)
  }
  const ids = Object.keys(manifest).filter(name => name.startsWith('.component-inputs/components/') && name.endsWith('/frontend/index.ts')).map(name => name.split('/')[2]).sort()
  assert.deepEqual(ids, componentIDs, 'compiled UI component profile drift')
  const packaged = new Map([...dist].map(([name, bytes]) => ['dist/' + name, bytes]))
  for (const name of ['LICENSE', 'NOTICE.md']) packaged.set(name, sourceFiles.get(name))
  packaged.set('THIRD_PARTY_NOTICES.json', thirdParty)
  const archive = packFiles('distribution', packaged), stem = 'frontend-' + key
  const files = Object.fromEntries([...packaged].sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0).map(([name,bytes])=>[name, {sha256: sha256(bytes), bytes: bytes.length}]))
  const provenance = {schema: 'solovey.frontend-distribution/v1', version, source, sourceArchiveSHA256: index.sourceArchive.sha256, toolchain, build: {profile, componentIDs, inputManifestSHA256: inputHash}, viteManifestSHA256: sha256(manifestBytes), archiveSHA256: sha256(archive), files}
  const receipt = Buffer.from(JSON.stringify(provenance, null, 2) + '\n')
  fs.writeFileSync(path.join(out, stem + '.json.gz'), archive)
  fs.writeFileSync(path.join(out, stem + '.provenance.json'), receipt)
  fs.cpSync(path.join(work, 'dist'), path.join(out, key), {recursive: true})
  index.profiles[key] = {archive: stem + '.json.gz', archiveSHA256: sha256(archive), provenance: stem + '.provenance.json', provenanceSHA256: sha256(receipt), viteManifestSHA256: sha256(manifestBytes), profile, componentIDs, inputManifestSHA256: inputHash, files: dist.size}
  result.profiles[key] = {...index.profiles[key], fileHashes: Object.fromEntries([...dist].map(([name,bytes])=>[name,sha256(bytes)]))}
}
try {
  for (const command of ['go','git']) { const p = spawnSync(command, ['version'], {cwd: work, env, encoding: 'utf8', windowsHide: true}); assert.equal(p.error?.code, 'ENOENT', command + ' must be unavailable'); result.isolation[command + 'Unavailable'] = true }
  assert.deepEqual(fs.readdirSync(temporary), ['frontend'])
  run('npm-ci', [npm, 'ci', '--prefer-offline', '--no-audit', '--no-fund'])
  run('negative-inputs-and-archives', ['--test', 'scripts/build-inputs.test.mjs', 'scripts/file-archive.test.mjs'])
  for (const task of ['typecheck', 'lint', 'test']) run(task, [npm, 'run', task])
  const thirdParty = licenses(), admittedManifest = JSON.parse(fs.readFileSync(path.join(work, '.component-inputs/manifest.json')))
  const allIDs = admittedManifest.components.map(c=>c.id).sort()
  for (const [key,profile,ids] of [['full','full',allIDs], ['core','core',[]], ['minimal','minimal',[]], ['custom-fallback-html','full',['fallback-html']], ['custom-server-protection','full',['server-protection']], ['custom-remote-outbound-subscriptions','full',['remote-outbound-subscriptions']]]) {
    const buildEnv = {...env, SOLOVEY_UI_PROFILE: profile}
    if (key.startsWith('custom-')) buildEnv.SOLOVEY_UI_COMPONENT_IDS = ids.join(',')
    run('build-' + key, [npm, 'run', 'build'], buildEnv)
    qualifyDist(key, profile, ids, supplied.manifestSHA256, thirdParty)
  }
  const fullInputs = path.join(work, '.component-inputs'), savedInputs = path.join(temporary, 'accepted-full-inputs')
  fs.renameSync(fullInputs, savedInputs)
  fs.mkdirSync(path.join(fullInputs, 'components'), {recursive: true})
  const emptyManifest = {...admittedManifest, components: []}, emptyBytes = Buffer.from(JSON.stringify(emptyManifest, null, 2) + '\n')
  fs.writeFileSync(path.join(fullInputs, 'manifest.json'), emptyBytes)
  run('build-core-empty-inputs', [npm, 'run', 'build'], {...env, SOLOVEY_UI_PROFILE: 'core', SOLOVEY_UI_INPUTS_SHA256: sha256(emptyBytes)})
  qualifyDist('core-empty-inputs', 'core', [], sha256(emptyBytes), thirdParty)
  for (const profile of ['minimal','core-empty-inputs']) assert.deepEqual(result.profiles[profile].fileHashes, result.profiles.core.fileHashes, 'neutral Core output differs')
  verifyPanelPresentation(root, supplied.directory)
  result.result = 'PASS'
  fs.writeFileSync(path.join(out, 'producer-index.json'), JSON.stringify(index, null, 2) + '\n')
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({result: result.result, source, profiles: Object.keys(index.profiles)}))
} finally {
  assert.ok(path.dirname(temporary) === fs.realpathSync.native(os.tmpdir()) && path.basename(temporary).startsWith('solovey frontend '), 'unsafe qualification cleanup')
  fs.rmSync(temporary, {recursive: true, force: true})
}
