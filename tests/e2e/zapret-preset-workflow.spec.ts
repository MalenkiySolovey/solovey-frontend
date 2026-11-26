import fs from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { csrfToken, enableComponent, login, mutationHeaders, reviewZapretFile } from './helpers'

const catalogPath = 'api/components/zapret/strategies'
const luaPath = `${catalogPath}/lua-drafts`

for (const layout of ['classic', 'nexus']) {
  test(`${layout} stores and authorizes exact Lua source revisions`, async ({ page }, info) => {
    test.setTimeout(90_000)
    await page.addInitScript(value => window.localStorage.setItem('sui:ui:mode', value), layout)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    const click = (name: string) => page.getByRole('button', { name, exact: true }).click()
    const dialog = page.getByRole('dialog')
    const script = dialog.getByRole('textbox', { name: 'Lua source', exact: true })
    const save = dialog.getByRole('button', { name: 'Save Lua draft' })
    const load = async (route: string) => {
      const response = await page.request.get(route)
      const body = await response.json()
      expect(body.success, body.msg).toBe(true)
      return body.obj
    }
    const baseline = await load(catalogPath)
    const id = `${layout}-example`
    const external = `${layout}-library`
    const row = (name: string) => page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
    await page.getByRole('tab', { name: 'Lists & assets' }).click()
    await expect(page.getByText(/Saving source does not execute it/)).toBeVisible()
    await click('New Lua draft')
    await expect(dialog.getByText('Stored source', { exact: true })).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Draft ID' }).fill(id)
    await script.fill('-- first draft\n')
    await save.click()
    await expect(row(id)).toBeVisible()
    const old = await load(luaPath)
    await row(id).getByRole('button', { name: 'Edit Lua draft' }).click()
    await script.fill('-- unsaved local edit\n')
    const remoteSource = '-- saved in another editor\n'
    const write = async (data: object) => (await page.request.post(luaPath, { headers: mutationHeaders(await csrfToken(page)), data })).json()
    const draft = { origin: 'administrator', source: Buffer.from(remoteSource).toString('base64') }
    const other = await write({ action: 'edit', id, expectedRevision: old.revision, draft })
    expect(other.success, other.msg).toBe(true)
    await save.click()
    await expect(dialog.getByText(/catalog changed; reload before saving/)).toBeVisible()
    await expect(script).toHaveValue('-- unsaved local edit\n')
    expect((await load(luaPath)).drafts[id].source).toBe(remoteSource)
    const duplicate = await write({ action: 'create', id, expectedRevision: other.obj.revision, draft })
    expect(duplicate.success).toBe(false)
    expect(duplicate.msg).toContain('already in use')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await click('Refresh')

    const imported = Buffer.from('\uFEFF-- original CRLF\r\nfunction fixture_callback() return VERDICT_PASS end\r\n', 'utf8')
    await click('Import Lua file')
    const filename = `${layout}_library.lua`
    await dialog.locator('input[type=file]').setInputFiles({ name: filename, buffer: imported, mimeType: 'text/plain' })
    await expect(dialog.getByText(filename, { exact: true })).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Draft ID' })).toHaveValue(external)
    await dialog.getByRole('combobox', { name: 'Origin', exact: true }).press('ArrowDown')
    await page.getByRole('option', { name: 'Administrator-authored', exact: true }).click()
    await expect(dialog.getByText(/Solovey has not verified this source/)).toBeVisible()
    await expect(save).toBeDisabled()
    expect((await load(luaPath)).drafts[external]).toBeUndefined()
    await dialog.getByRole('textbox', { name: 'Source or version' }).fill('Unknown origin')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(dialog.getByRole('button', { name: 'Save Lua draft' })).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`${layout}-lua-narrow.png`) })
    await save.click()
    await expect(row(external)).toBeVisible()
    const saved = await load(luaPath)
    expect(saved.drafts[external]).toEqual({ origin: 'administrator', sourceRef: 'Unknown origin', source: imported.toString('utf8'), imported: true })
    const current = await load(catalogPath)
    expect(current.catalog).toEqual(baseline.catalog)
    expect(current.references).toEqual(baseline.references)
    const download = page.waitForEvent('download')
    await row(external).getByRole('button', { name: 'Export Lua source' }).click()
    expect(await fs.readFile(await (await download).path())).toEqual(imported)

    await page.getByRole('tab', { name: 'Strategies', exact: true }).click()
    await click('New strategy')
    const editor = page.getByTestId('zapret-strategy-editor')
    const name = `${layout} exact Lua revisions`
    await editor.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    await editor.getByRole('button', { name: 'Native options', exact: true }).click()
    await editor.getByRole('textbox', { name: 'Native options', exact: true }).fill('--filter-tcp=18080 --lua-desync=fixture_callback')
    await editor.getByText('Lua dependencies (load order)', { exact: true }).click()
    await editor.getByRole('button', { name: 'Load saved revisions' }).click()
    const picker = editor.getByRole('combobox', { name: 'Select Lua source revision' })
    const select = async (ref: string) => {
      await picker.press('ArrowDown')
      await page.getByRole('option', { name: `${ref} · ${saved.draftRevisions[ref].slice(0, 12)}`, exact: true }).click()
    }
    await select(external)
    await select(id)
    const approve = editor.getByRole('checkbox', { name: 'I reviewed and authorize this imported revision' })
    await expect(approve).not.toBeChecked()
    await expect(editor.getByText('Imported source', { exact: false })).toBeVisible()
    await approve.check()
    await editor.getByRole('button', { name: 'Load Lua dependency earlier' }).last().click()
    await editor.getByRole('button', { name: 'Validate', exact: true }).click()
    await expect(editor.getByText('Validated native preview', { exact: true })).toBeVisible()
    if (layout === 'nexus') await page.setViewportSize({ width: 1280, height: 900 })
    await page.screenshot({ path: info.outputPath(`${layout}-lua-revisions.png`) })
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(name)).toBeVisible()
    const result = await load(catalogPath)
    const record = Object.values(result.catalog.records as Record<string, { name: string; definition: { id: string; managedLua: object[] } }>)
      .find(item => item.name === name)!
    expect(record.definition.managedLua).toEqual([
      { id, revision: saved.draftRevisions[id] },
      { id: external, revision: saved.draftRevisions[external], approveImported: true },
    ])
    expect(result.references).toEqual(baseline.references)
    const removed = await page.request.post(catalogPath, { headers: mutationHeaders(await csrfToken(page)),
      data: { action: 'delete', id: record.definition.id, expectedRevision: result.revision } })
    expect((await removed.json()).success).toBe(true)
    await click('Refresh')
    await page.getByRole('tab', { name: 'Lists & assets' }).click()

    for (const name of [id, external]) {
      await row(name).getByRole('button', { name: 'Delete Lua draft' }).click()
      await dialog.getByRole('button', { name: 'Delete Lua draft' }).click()
      await expect(row(name)).toHaveCount(0)
    }
    expect((await load(catalogPath)).revision).toBe(baseline.revision)
  })

  test(`${layout} reviews presets, reorders profiles, and round-trips a ZIP without applying`, async ({ page }, info) => {
    test.setTimeout(90_000)
    await page.addInitScript(value => window.localStorage.setItem('sui:ui:mode', value), layout)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    const read = async () => {
      const response = await (await page.request.get(catalogPath)).json()
      expect(response.success, response.msg).toBe(true)
      return response.obj
    }
    const click = (name: string) => page.getByRole('button', { name, exact: true }).click()
    const row = (name: string) => page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
    const review = page.getByRole('dialog')
    const editor = page.getByTestId('zapret-strategy-editor')
    const savePreset = review.getByRole('button', { name: 'Save as strategy', exact: true })
    const pickTemplate = (name: string) => page.locator('.template-grid .v-card').filter({ has: page.getByText(name, { exact: true }) })
    const baseline = await read()
    await click('Templates')
    await pickTemplate('Windows interception example').getByRole('button', { name: 'Review' }).click()
    await expect(review.getByText('Line 2, column 1:', { exact: true })).toBeVisible()
    await expect(review.getByText('--wf-tcp-out', { exact: true })).toBeVisible()
    await expect(savePreset).toBeDisabled()
    await review.getByRole('button', { name: 'Cancel' }).click()
    expect((await read()).revision).toBe(baseline.revision)

    const search = page.getByRole('textbox', { name: 'Search strategies or templates' })
    await search.fill('Web TCP')
    await expect(pickTemplate('TLS split')).toHaveCount(0)
    const template = pickTemplate('Web TCP and QUIC')
    const favorite = template.getByRole('button', { name: 'Toggle favorite' })
    await favorite.click()
    await expect(favorite).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('checkbox', { name: 'Favorites only' }).check()
    await page.screenshot({ path: info.outputPath(`${layout}-templates-desktop.png`) })
    await template.getByRole('button', { name: 'Review' }).click()
    await expect(savePreset).toBeEnabled()
    await review.getByRole('textbox', { name: 'Strategy name (optional)' }).fill(`${layout} web preset`)
    await expect(savePreset).toBeDisabled()
    await review.getByRole('button', { name: 'Review', exact: true }).click()
    await expect(savePreset).toBeEnabled()
    expect((await read()).revision).toBe(baseline.revision)
    await savePreset.click()
    const name = `${layout} web preset`
    await expect(row(name)).toBeVisible()

    await row(name).getByRole('button', { name: 'Edit strategy' }).click()
    await expect(editor).toBeVisible()
    const profileIDs = editor.getByRole('textbox', { name: 'Profile ID' })
    await expect(profileIDs.first()).toHaveValue('tls-split')
    await editor.getByRole('button', { name: 'Move profile up' }).last().press('Enter')
    await expect(profileIDs.first()).toHaveValue('quic-initial')
    await editor.getByRole('button', { name: 'Validate', exact: true }).click()
    await expect(editor.getByText('Validated native preview', { exact: true })).toBeVisible()
    await editor.getByRole('button', { name: 'Strategies', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`${layout}-editor-desktop.png`) })
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(name)).toBeVisible()
    const current = await read()
    const record = Object.values(current.catalog.records as Record<string, {name: string; definition: {id: string; profiles: {id: string}[]}}>).find(value => value.name === name)
    expect(record?.definition.profiles.map(profile => profile.id)).toEqual(['quic-initial', 'tls-split'])
    expect(current.references).toEqual(baseline.references)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await row(name).getByRole('button', { name: 'Edit strategy' }).click()
    await expect(editor.getByRole('heading', { name: 'Edit strategy' })).toBeInViewport()
    expect(await editor.evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(390)
    await page.screenshot({ path: info.outputPath(`${layout}-editor-narrow.png`) })
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()

    await row(name).getByRole('button', { name: 'More export options' }).click()
    const download = page.waitForEvent('download')
    await page.getByText('Export ZIP with dependencies', { exact: true }).click()
    const zip = await fs.readFile(await (await download).path())
    await row(name).getByRole('button', { name: 'Delete strategy' }).click()
    await review.getByRole('button', { name: 'Delete strategy' }).click()
    await expect(row(name)).toHaveCount(0)
    await reviewZapretFile(page, 'strategy.zip', zip, 'application/zip')
    await expect(row(name)).toBeVisible()

    const source = '# user comment\n--name=plain\n--filter-tcp=443\n'
    await reviewZapretFile(page, `${layout}-native.txt`, Buffer.from(source), 'text/plain')
    await row(`${layout}-native`).getByRole('button', { name: 'Edit strategy' }).click()
    await expect(editor.getByRole('textbox', { name: 'Native options' })).toHaveValue(source)
    await editor.getByRole('button', { name: 'Profiles', exact: true }).click()
    await expect(editor.getByRole('textbox', { name: 'Native options' })).toHaveValue(source)
    await expect(editor.getByRole('textbox', { name: 'Profile ID' })).toHaveCount(0)
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()

    const afterImport = await read()
    const stale = await (await page.request.post(`${catalogPath}/import`, {
      headers: mutationHeaders(await csrfToken(page)),
      data: { expectedRevision: baseline.revision, preset: { format: 'native', content: Buffer.from(source).toString('base64') } },
    })).json()
    expect(stale.success).toBe(false)
    expect(stale.msg).toContain('catalog changed')
    expect((await read()).revision).toBe(afterImport.revision)
    for (const title of [name, `${layout}-native`]) {
      await row(title).getByRole('button', { name: 'Delete strategy' }).click()
      await review.getByRole('button', { name: 'Delete strategy' }).click()
      await expect(row(title)).toHaveCount(0)
    }
  })
}
