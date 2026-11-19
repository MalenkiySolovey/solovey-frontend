import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {unpackFiles, writeFreshFiles, sha256} from './file-archive.mjs'
import {readFrontendBuildInputs} from './component-build-inputs.mjs'
export const frontendRoot = fileURLToPath(new URL('../', import.meta.url))
export async function prepareInputs(root = frontendRoot, archiveFilename) {
  const admission = JSON.parse(fs.readFileSync(path.join(root, 'qualification/inputs.json')))
  assert.equal(admission.schema, 'solovey.frontend-qualification-input/v1')
  assert.match(admission.archiveSource, /^[a-f0-9]{40}$/)
  assert.equal(admission.url, 'https://raw.githubusercontent.com/MalenkiySolovey/solovey-ui/' + admission.archiveSource + '/tests/fixtures/frontend-build-inputs/' + admission.manifestSHA256 + '.json.gz', 'only immutable admitted Product inputs are allowed')
  let bytes
  if (archiveFilename) bytes = fs.readFileSync(archiveFilename)
  else {
    const response = await fetch(admission.url, {signal: AbortSignal.timeout(60000), redirect: 'error'})
    assert.ok(response.ok, 'admitted Product input download failed: ' + response.status)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  const files = unpackFiles(bytes, admission.archiveSHA256, 'inputs'), destination = path.join(root, '.component-inputs')
  assert.equal(sha256(files.get('manifest.json')), admission.manifestSHA256, 'trusted manifest admission mismatch')
  if (!fs.existsSync(destination)) writeFreshFiles(destination, files)
  const input = readFrontendBuildInputs(root, admission.manifestSHA256, destination)
  return {...input, admission}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length <= 3)
  const input = await prepareInputs(frontendRoot, process.argv[2])
  console.log(JSON.stringify({manifestSHA256: input.manifestSHA256, node: input.admission.node, npm: input.admission.npm}))
}
