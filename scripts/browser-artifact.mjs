import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {unpackFiles, writeFreshFiles, sha256} from './file-archive.mjs'
const [input, destination] = process.argv.slice(2)
assert.ok(input && destination && process.argv.length === 4)
const index = JSON.parse(fs.readFileSync(path.join(input,'producer-index.json'))), pin = index.profiles.full
assert.equal(index.source.commit,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'browser artifact must match exact source')
assert.equal(index.toolchain.packageLockSHA256,sha256(fs.readFileSync('package-lock.json')))
const receiptBytes = fs.readFileSync(path.join(input,pin.provenance))
assert.equal(sha256(receiptBytes),pin.provenanceSHA256)
const receipt=JSON.parse(receiptBytes), files=unpackFiles(fs.readFileSync(path.join(input,pin.archive)),pin.archiveSHA256,'distribution')
assert.deepEqual(receipt.source,index.source)
assert.deepEqual(Object.keys(receipt.files),[...files.keys()])
for(const [name,bytes] of files) {assert.equal(sha256(bytes),receipt.files[name].sha256);assert.equal(bytes.length,receipt.files[name].bytes)}
writeFreshFiles(destination,files)
console.log(JSON.stringify({result:'PASS',source:index.source,archiveSHA256:pin.archiveSHA256,files:files.size}))
