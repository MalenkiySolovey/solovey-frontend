import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {readFrontendBuildInputs, selectFrontendEntries, frontendAPIFiles} from './component-build-inputs.mjs'
import {sha256} from './file-archive.mjs'
const root = fileURLToPath(new URL('../', import.meta.url)), admission = JSON.parse(fs.readFileSync(path.join(root, 'qualification/inputs.json')))
function fixture(run) {
  const temporary = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'solovey input-negative '))), frontend = path.join(temporary,'frontend'), directory = path.join(frontend,'.component-inputs')
  fs.mkdirSync(frontend)
  for (const name of frontendAPIFiles) { fs.mkdirSync(path.dirname(path.join(frontend,name)),{recursive:true}); fs.copyFileSync(path.join(root,name),path.join(frontend,name)) }
  fs.cpSync(path.join(root,'.component-inputs'),directory,{recursive:true})
  try { return run({frontend,directory,temporary,read: trusted => readFrontendBuildInputs(frontend,trusted === undefined ? admission.manifestSHA256 : trusted,directory)}) }
  finally { assert.ok(path.dirname(temporary) === fs.realpathSync.native(os.tmpdir()) && path.basename(temporary).startsWith('solovey input-negative ')); fs.rmSync(temporary,{recursive:true,force:true}) }
}
function rewrite(directory, edit) { const filename=path.join(directory,'manifest.json'), manifest=JSON.parse(fs.readFileSync(filename)); edit(manifest); const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'); fs.writeFileSync(filename,bytes); return sha256(bytes) }
test('admitted historical input never registers intrinsic Panel Update; neutral profiles have no optional entries',()=>fixture(({read})=>{
  const input=read(); assert.equal(input.manifest.components.length,8); assert.equal(input.entries.length,7)
  assert.ok(input.manifest.components.some(entry=>entry.id==='panel-update-ui'))
  assert.throws(()=>selectFrontendEntries(input,{SOLOVEY_UI_COMPONENT_IDS:'panel-update-ui'}),/unavailable/)
  for (const profile of ['core','minimal']) assert.deepEqual(selectFrontendEntries(input,{SOLOVEY_UI_PROFILE:profile}),[])
  assert.throws(()=>selectFrontendEntries(input,{SOLOVEY_UI_COMPONENT_IDS:'unknown'}),/unavailable/)
  assert.throws(()=>selectFrontendEntries(input,{SOLOVEY_UI_PROFILE:'arbitrary'}),/unsupported/)
}))
test('caller digest is required and is not inferred from payload',()=>fixture(({frontend,directory,read})=>{
  assert.throws(()=>readFrontendBuildInputs(frontend,null,directory),/SHA256/)
  assert.throws(()=>read('0'.repeat(64)),/SHA256 mismatch/)
}))
test('missing declared inputs never fall back to parent components',()=>fixture(({frontend,directory,temporary,read})=>{
  fs.renameSync(directory,path.join(temporary,'saved-inputs')); fs.mkdirSync(path.join(temporary,'components','panel-update-ui','frontend'),{recursive:true})
  fs.writeFileSync(path.join(temporary,'components','panel-update-ui','frontend','index.ts'),'throw new Error("untrusted parent")')
  assert.throws(()=>read(),/ENOENT/)
  assert.ok(!fs.existsSync(path.join(frontend,'.component-inputs')))
}))
for (const name of ['.node-version','package-lock.json','src/componentSystem/api.ts']) test('rejects API/toolchain drift '+name,()=>fixture(({frontend,read})=>{
  fs.appendFileSync(path.join(frontend,name),'\nchanged'); assert.throws(()=>read(),/toolchain input drift/)
}))
test('rejects unknown manifest schema and fields',()=>fixture(({directory,read})=>{
  const trusted=rewrite(directory,manifest=>{manifest.schema='untrusted/v99'}); assert.throws(()=>read(trusted),/unsupported/)
}))
test('rejects changed immutable component lock projection',()=>fixture(({directory,read})=>{
  const trusted=rewrite(directory,manifest=>{manifest.sourceLockDigest='0'.repeat(64)}); assert.throws(()=>read(trusted),/lock projection drift/)
}))
test('rejects wrong ComponentID even under an explicitly admitted malformed manifest',()=>fixture(({directory,read})=>{
  const trusted=rewrite(directory,manifest=>{const c=manifest.components.find(c=>c.id==='panel-update-ui'); c.id='wrong-component-id'})
  fs.renameSync(path.join(directory,'components','panel-update-ui'),path.join(directory,'components','wrong-component-id'))
  assert.throws(()=>read(trusted))
}))
test('rejects extra/missing/changed UI bytes before build execution',()=>{
  for (const action of ['extra','missing','changed']) fixture(({directory,read})=>{
    const ui=path.join(directory,'components','panel-update-ui','frontend')
    if(action==='extra')fs.writeFileSync(path.join(ui,'untrusted.ts'),'throw new Error("untrusted")')
    else if(action==='missing')fs.unlinkSync(path.join(ui,'index.ts'))
    else fs.appendFileSync(path.join(ui,'index.ts'),'\nthrow new Error("changed")')
    assert.throws(()=>read())
  })
})
test('rejects symlinked UI directory on Linux and Windows',()=>fixture(({directory,temporary,read})=>{
  const original=path.join(directory,'components','panel-update-ui','frontend'), moved=path.join(temporary,'moved-ui')
  fs.renameSync(original,moved);fs.symlinkSync(moved,original,'junction');assert.throws(()=>read(),/symlink|unsafe|regular/)
}))
test('rejects absent selected and URL-shaped dynamic component entries',()=>fixture(({directory,read})=>{
  const input=read();assert.throws(()=>selectFrontendEntries(input,{SOLOVEY_UI_COMPONENT_IDS:'https://attacker.invalid/ui.js'}))
  const trusted=rewrite(directory,manifest=>{manifest.components[0].files['https://attacker.invalid/ui.js']='0'.repeat(64)})
  assert.throws(()=>read(trusted))
}))
