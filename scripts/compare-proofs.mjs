import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const [linux, windows] = process.argv.slice(2)
assert.ok(linux && windows && process.argv.length === 4)
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root,name)))
const a = read(linux,'producer-index.json'), b = read(windows,'producer-index.json')
assert.deepEqual(a,b,'Linux and Windows producer identities/archives differ')
const pa = read(linux,'proof.json'), pb = read(windows,'proof.json')
assert.equal(pa.result,'PASS'); assert.equal(pb.result,'PASS')
for (const key of Object.keys(a.profiles)) assert.deepEqual(pa.profiles[key].fileHashes,pb.profiles[key].fileHashes,'cross-platform file drift: '+key)
console.log(JSON.stringify({result:'PASS',source:a.source,profiles:Object.keys(a.profiles),archivesAndEveryFileIdentical:true}))
