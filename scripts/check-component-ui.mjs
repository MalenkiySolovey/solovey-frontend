// Producer-side UI check. The candidate never replaces admitted Product inputs.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyUIAPIInputs } from './component-source-integrity.mjs'
import { prepareInputs } from './prepare-inputs.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
assert.equal(process.argv.length, 3, 'expected the component checkout directory')
const component = fs.realpathSync(process.argv[2])
const pin = JSON.parse(fs.readFileSync(path.join(component, 'HOST_UI_PIN.json'), 'utf8'))
assert.equal(pin.repository, 'MalenkiySolovey/solovey-frontend')
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), pin.sourceCommit, 'wrong Frontend checkout')
execFileSync('git', ['diff', '--exit-code', 'HEAD'], { cwd: root, stdio: 'inherit' })
verifyUIAPIInputs(root, component)
const manifest = JSON.parse(fs.readFileSync(path.join(component, 'component.json'), 'utf8'))
assert.deepEqual(manifest.frontend.entries, ['frontend/index.ts'])
const source = path.join(component, 'frontend')
const files = fs.readdirSync(source, { recursive: true, withFileTypes: true })
assert.ok(files.some(entry => entry.name === 'index.ts' && entry.parentPath === source && entry.isFile()), 'missing UI entry')
let tests = false
for (const entry of files) {
  assert.ok(entry.isFile() || entry.isDirectory(), 'non-regular component UI input')
  if (!entry.isFile() || !/\.(vue|[cm]?tsx?)$/.test(entry.name)) continue
  const text = fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8')
  assert.doesNotMatch(text, /['"]@\//, `private shell import in ${entry.name}`)
  tests ||= /\.(test|spec)\.tsx?$/.test(entry.name)
}

const temporary = fs.mkdtempSync(path.join(root, '.component-ui-check-'))
const run = (tool, args, env = process.env) => execFileSync(process.execPath, [path.join(root, 'node_modules', tool), ...args], { cwd: root, stdio: 'inherit', env })
try {
  const staged = path.join(temporary, 'frontend')
  fs.cpSync(source, staged, { recursive: true })
  const tsconfig = path.join(temporary, 'tsconfig.json')
  fs.writeFileSync(tsconfig, JSON.stringify({
    extends: '../tsconfig.json',
    include: ['../src/**/*.d.ts', 'frontend/**/*.ts', 'frontend/**/*.vue'],
  }))
  run('vue-tsc/bin/vue-tsc.js', ['-p', tsconfig, '--noEmit'])
  if (tests) {
    const admitted = await prepareInputs(root)
    const config = path.join(temporary, 'vitest.config.mts')
    fs.writeFileSync(config, `import base from '../vitest.config.ts'\nexport default { ...base, test: { ...base.test, include: [${JSON.stringify(path.basename(temporary) + '/frontend/**/*.{test,spec}.ts')}] } }\n`)
    run('vitest/vitest.mjs', ['run', '--config', config], { ...process.env, SOLOVEY_UI_INPUTS_SHA256: admitted.manifestSHA256 })
  }
} finally {
  assert.equal(path.dirname(temporary), path.resolve(root))
  assert.ok(path.basename(temporary).startsWith('.component-ui-check-'))
  fs.rmSync(temporary, { recursive: true, force: true })
}
