import fs from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { csrfToken, enableComponent, login, mutationHeaders, reviewZapretFile } from './helpers'

const catalogPath = 'api/components/zapret/strategies'
const luaPath = `${catalogPath}/lua-drafts`

for (const layout of ['classic', 'nexus']) {
  test(`${layout} stores Lua source as a revisioned inert draft`, async ({ page }, info) => {
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
    await expect(page.getByText(/does not isolate individual scripts/)).toBeVisible()
    await click('New Lua draft')
    await expect(dialog.getByText('Draft only', { exact: true })).toBeVisible()
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

    const imported = Buffer.from('\uFEFF-- managed by operator\r\n-- original CRLF\r\n', 'utf8')
    await click('Import Lua file')
    await dialog.locator('input[type=file]').setInputFiles({ name: `${external}.lua`, buffer: imported, mimeType: 'text/plain' })
    await expect(dialog.getByRole('textbox', { name: 'Draft ID' })).toHaveValue(external)
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
    expect(saved.drafts[external]).toEqual({ origin: 'external', sourceRef: 'Unknown origin', source: imported.toString('utf8') })
    const current = await load(catalogPath)
    expect(current.catalog).toEqual(baseline.catalog)
    expect(current.references).toEqual(baseline.references)
    const download = page.waitForEvent('download')
    await row(external).getByRole('button', { name: 'Export Lua source' }).click()
    expect(await fs.readFile(await (await download).path())).toEqual(imported)

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
