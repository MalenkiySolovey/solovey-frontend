import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { csrfToken, enableComponent, frontendRoot, login, mutationHeaders, reviewZapretFile } from './helpers'

const catalog = 'api/components/zapret/strategies'

for (const layout of ['classic', 'nexus']) {
  test(`${layout}: saves compact mixed filters and repairs a native ZIP dependency`, async ({ page }, info) => {
    test.setTimeout(90_000)
    await page.addInitScript(value => window.localStorage.setItem('sui:ui:mode', value), layout)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    const read = async () => {
      const reply = await (await page.request.get(catalog)).json()
      expect(reply.success, reply.msg).toBe(true)
      return reply.obj
    }
    const write = async (data: object) => {
      const reply = await (await page.request.post(catalog, { headers: mutationHeaders(await csrfToken(page)), data })).json()
      expect(reply.success, reply.msg).toBe(true)
      return reply.obj
    }
    const row = (name: string) => page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
    const editor = page.getByTestId('zapret-strategy-editor')
    const review = page.getByRole('dialog')
    const save = editor.getByRole('button', { name: 'Save', exact: true })
    const baseline = await read()
    const plainName = `${layout}-dual-filters`
    await reviewZapretFile(page, `${plainName}.txt`, Buffer.from('--name=dual\n--filter-tcp=18080\n--filter-udp=18443\n'), 'text/plain')
    await row(plainName).getByRole('button', { name: 'Edit strategy' }).click()
    const tcp = editor.getByRole('textbox', { name: 'TCP ports and ranges', exact: true })
    const udp = editor.getByRole('textbox', { name: 'UDP ports and ranges', exact: true })
    await expect(tcp).toHaveValue('18080')
    await expect(udp).toHaveValue('18443')
    await tcp.fill('18080-18280')
    await udp.fill('18443,18445-18590')
    await save.click()
    await expect(row(plainName)).toBeVisible()
    const current = await read()
    const find = (state: typeof current, title: string) => Object.entries(state.catalog.records as Record<string, {
      name: string; raw: string; listRefs: Record<string, Record<string, string>>; origin: { sha256: string };
      definition: { profiles: Array<{ id: string; ports: number[] | null; udpPorts?: number[];
        portRanges?: Array<{ first: number; last: number }>; udpPortRanges?: Array<{ first: number; last: number }> }> };
    }>).find(([, record]) => record.name === title)!
    const [plainID, plain] = find(current, plainName)
    expect(plain.definition.profiles).toHaveLength(1)
    expect(plain.definition.profiles[0]).toMatchObject({ id: 'dual', ports: null,
      portRanges: [{ first: 18080, last: 18280 }],
      udpPortRanges: [{ first: 18443, last: 18443 }, { first: 18445, last: 18590 }] })
    expect(plain.definition.profiles[0].udpPorts).toBeUndefined()
    expect(plain.raw).toContain('--filter-tcp=18080-18280\n--filter-udp=18443,18445-18590')
    await row(plainName).getByRole('button', { name: 'Edit strategy' }).click()
    await expect(tcp).toHaveValue('18080-18280')
    await expect(udp).toHaveValue('18443,18445-18590')
    await editor.getByRole('button', { name: 'Strategies', exact: true }).click()

    // Authored v1 portable archive with a standalone documentation-network IP set.
    const file = await fs.readFile(path.join(frontendRoot, 'tests/e2e/fixtures/zapret-portable-v1.zip'))
    const owned = 'portable-wire'
    const alternate = `imported-wire-${layout}`
    const seedOwned = !current.catalog.lists?.[owned]
    let state = seedOwned ? await write({ action: 'create-list', id: owned, expectedRevision: current.revision,
      list: { kind: 'ipSet', entries: ['192.0.2.19/32'] } })
      : current
    const refreshed = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith(`/${catalog}`))
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    expect((await (await refreshed).json()).obj.revision).toBe(state.revision)
    const importedName = `${layout} portable mixed profile`
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await review.getByRole('textbox', { name: 'Strategy name (optional)' }).fill(importedName)
    await review.locator('input[type=file]').setInputFiles({ name: 'portable.zip', buffer: file, mimeType: 'application/zip' })
    const runReview = review.getByRole('button', { name: 'Review', exact: true })
    const commit = review.getByRole('button', { name: 'Save as strategy', exact: true })
    await runReview.click()
    const repair = review.getByRole('textbox', { name: `Managed ID for lists/${owned}.txt` })
    await expect(repair).toBeVisible()
    await repair.fill(alternate)
    await expect(commit).toBeDisabled()
    await runReview.click()
    await expect(commit).toBeEnabled()
    expect((await read()).revision).toBe(state.revision)
    await commit.click()
    await expect(row(importedName)).toBeVisible()
    state = await read()
    const [importedID, imported] = find(state, importedName)
    expect(imported.origin.sha256).toBe(createHash('sha256').update(file).digest('hex'))
    expect(imported.listRefs).toEqual({ 'dual-path': { ipSet: alternate } })
    expect(state.catalog.lists[owned].entries).toEqual(['192.0.2.19/32'])
    expect(state.catalog.lists[alternate].entries).toEqual(['203.0.113.2/32'])

    await row(importedName).getByRole('button', { name: 'Edit strategy' }).click()
    const source = editor.getByRole('textbox', { name: 'Native options', exact: true })
    await expect(source).toHaveValue(imported.raw)
    const list = editor.getByRole('combobox', { name: 'Include IP addresses or prefixes: shared list', exact: true })
    await list.press('ArrowDown')
    await page.getByRole('option', { name: owned, exact: true }).click()
    await expect(source).toHaveValue(imported.raw)
    await editor.getByRole('button', { name: 'Validate', exact: true }).click()
    await expect(editor.getByText('Validated native preview', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: layout === 'classic' ? 390 : 1280, height: 900 })
    expect(await editor.evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(layout === 'classic' ? 390 : 1280)
    await page.screenshot({ path: info.outputPath(`${layout}-raw-list.png`) })
    await save.click()
    await expect(row(importedName)).toBeVisible()
    state = await read()
    const [, edited] = find(state, importedName)
    expect(edited.raw).toBe(imported.raw)
    expect(edited.origin).toEqual(imported.origin)
    expect(edited.listRefs).toEqual({ 'dual-path': { ipSet: owned } })
    expect(edited.definition.profiles[0]).toMatchObject({ ports: [18080], udpPorts: [18443] })
    expect(state.references).toEqual(baseline.references)

    for (const [action, id] of [['delete', importedID], ['delete', plainID], ['delete-list', alternate]]) {
      state = await write({ action, id, expectedRevision: state.revision })
    }
    if (seedOwned) state = await write({ action: 'delete-list', id: owned, expectedRevision: state.revision })
    expect(state.revision).toBe(baseline.revision)
  })

  test(`${layout}: reviews and saves a large portable list without applying it`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: layout === 'nexus' ? 390 : 1280, height: 900 })
    await page.addInitScript(value => window.localStorage.setItem('sui:ui:mode', value), layout)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    const read = async () => {
      const reply = await (await page.request.get(catalog)).json()
      expect(reply.success, reply.msg).toBe(true)
      return reply.obj
    }
    const write = async (data: object, expectedRevision: string) => {
      const reply = await (await page.request.post(catalog, {
        headers: mutationHeaders(await csrfToken(page)), data: { ...data, expectedRevision },
      })).json()
      expect(reply.success, reply.msg).toBe(true)
      return reply.obj
    }
    const baseline = await read()
    const listID = `${layout}-large-portable-hosts`
    const name = `${layout} large portable preset`
    const entries = Array.from({ length: 9000 }, (_, i) => `h${String(i).padStart(5, '0')}.portable-fixture.example.test`)
    const listed = await write({ action: 'create-list', id: listID, list: { kind: 'hostList', entries } }, baseline.revision)
    const seeded = await write({ action: 'create', draft: {
      name, raw: '--name=portable\n--filter-tcp=18080\n', listRefs: { portable: { hostList: listID } },
    } }, listed.revision)
    const seed = Object.keys(seeded.catalog.records).find(id => seeded.catalog.records[id].name === name)!
    const transfer = await (await page.request.get(`${catalog}/${seed}/export?expectedRevision=${seeded.revision}`)).json()
    expect(transfer.success, transfer.msg).toBe(true)
    const buffer = Buffer.from(JSON.stringify(transfer.obj))
    expect(buffer.length).toBeGreaterThan(256 * 1024)
    expect(buffer.length).toBeLessThanOrEqual(baseline.presetTransferLimit)
    const removed = await write({ action: 'delete', id: seed }, seeded.revision)
    expect((await write({ action: 'delete-list', id: listID }, removed.revision)).revision).toBe(baseline.revision)

    await page.reload()
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    const review = page.getByRole('dialog')
    await review.locator('input[type=file]').setInputFiles({ name: 'large-preset.json', buffer, mimeType: 'application/json' })
    await review.getByRole('button', { name: 'Review', exact: true }).click()
    const save = review.getByRole('button', { name: 'Save as strategy', exact: true })
    await expect(save).toBeEnabled({ timeout: 30_000 })
    expect((await read()).revision).toBe(baseline.revision)
    await save.click()
    await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible({ timeout: 30_000 })
    const imported = await read()
    expect(imported.references).toEqual(baseline.references)
    expect(imported.catalog.lists[listID].entries).toEqual(entries)
    const id = Object.keys(imported.catalog.records).find(key => imported.catalog.records[key].name === name)!
    const deleted = await write({ action: 'delete', id }, imported.revision)
    expect((await write({ action: 'delete-list', id: listID }, deleted.revision)).revision).toBe(baseline.revision)
  })
}
