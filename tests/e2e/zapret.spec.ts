import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import { csrfToken, enableComponent, login, mutationHeaders } from './helpers'

const strategies = 'api/components/zapret/strategies'

for (const mode of ['classic', 'nexus']) {
  test(`${mode} attaches a shared QUIC blob and exports its reference`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.addInitScript(layout => window.localStorage.setItem('sui:ui:mode', layout), mode)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    const blobID = `${mode}-quic-decoy`
    const name = `${mode} QUIC strategy`
    const row = (title: string) => page.getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) })
    const dialog = page.getByRole('dialog')
    await page.getByRole('button', { name: 'New QUIC blob', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Blob ID', exact: true }).fill(blobID)
    await dialog.getByRole('textbox', { name: 'Hexadecimal bytes (up to 1200 bytes)', exact: true }).fill('405549')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(blobID)).toBeVisible()

    await page.getByRole('button', { name: 'New strategy', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    await dialog.getByRole('button', { name: 'QUIC/UDP preset', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'QUIC decoy blob', exact: true }).press('Enter')
    await page.getByRole('option', { name: blobID, exact: true }).click()
    await dialog.getByRole('button', { name: 'Native options', exact: true }).click()
    const native = dialog.getByRole('textbox', { name: 'Native options' })
    await expect(native).toHaveValue(new RegExp(`blob=asset_${blobID}:repeats=1`))
    expect(await native.inputValue()).not.toContain('405549')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(name)).toBeVisible()
    await expect(row(blobID).getByRole('button', { name: 'Delete QUIC blob', exact: true })).toBeDisabled()

    const file = page.waitForEvent('download')
    await row(name).getByRole('button', { name: 'Export', exact: true }).click()
    const transfer = JSON.parse(await fs.readFile(await (await file).path(), 'utf8'))
    expect(transfer.blobAssets).toEqual({ [blobID]: '405549' })
    expect(transfer.strategy.definition.profiles[0].quicBlobRef).toBe(blobID)
    await row(name).getByRole('button', { name: 'Delete strategy', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete strategy', exact: true }).click()
    await expect(row(name)).toHaveCount(0)
    await row(blobID).getByRole('button', { name: 'Delete QUIC blob', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete QUIC blob', exact: true }).click()
    await expect(row(blobID)).toHaveCount(0)
  })

  test(`${mode} edits reusable Zapret strategies and selects one DNS transport`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.addInitScript(layout => window.localStorage.setItem('sui:ui:mode', layout), mode)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    const name = `${mode} resolver strategy`
    const direct = `zapret-${mode}-direct`
    const listID = `${mode}-resolver-hosts`
    const row = (title: string) => page.getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) })
    const catalog = async () => {
      const body = await (await page.request.get(strategies)).json()
      expect(body.success, body.msg).toBe(true)
      return body.obj
    }
    const draft = { name, profiles: [{ id: 'tls', protocol: 'tcp', ports: [443], payload: 'tls_client_hello', splitAt: 9 }] }
    const base = await catalog()
    const forbidden = await page.request.post(strategies, {
      headers: mutationHeaders(), data: { action: 'create', expectedRevision: base.revision, draft },
    })
    expect(forbidden.status()).toBe(403)

    await page.getByRole('button', { name: 'New native list', exact: true }).click()
    const listDialog = page.getByRole('dialog')
    await listDialog.getByRole('textbox', { name: 'List ID', exact: true }).fill(listID)
    await listDialog.getByRole('textbox', { name: 'Entries', exact: true }).fill('resolver.example')
    await listDialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(listID)).toBeVisible()

    await page.getByRole('button', { name: 'New strategy', exact: true }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    await dialog.getByRole('button', { name: 'TLS/TCP preset' }).click()
    await dialog.getByText('Native filters', { exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Include domains: shared list', exact: true }).press('Enter')
    await page.getByRole('option', { name: listID, exact: true }).click()
    await dialog.getByRole('button', { name: 'Native options' }).click()
    const native = dialog.getByRole('textbox', { name: 'Native options' })
    await expect(native).toHaveValue(/--filter-tcp=443,853/)
    const text = await native.inputValue()
    expect(text).not.toContain('--hostlist-domains')
    await expect(dialog.getByText(`Include domains: ${listID}`, { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Profiles', exact: true }).click()
    await dialog.getByRole('button', { name: 'Native options' }).click()
    await expect(native).toHaveValue(text)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(name)).toBeVisible()
    await expect(row(listID).getByRole('button', { name: 'Delete native list' })).toBeDisabled()

    const file = page.waitForEvent('download')
    await row(name).getByRole('button', { name: 'Export', exact: true }).click()
    const transfer = JSON.parse(await fs.readFile(await (await file).path(), 'utf8'))
    expect(transfer.strategy.raw).toBe(text)
    expect(transfer.strategy.listRefs).toEqual({ 'profile-1': { hostList: listID } })
    expect(transfer.lists).toEqual({ [listID]: { kind: 'hostList', entries: ['resolver.example'] } })

    await row(name).getByRole('button', { name: 'Clone strategy' }).click()
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(`${name} (copy)`)).toBeVisible()
    await row(`${name} (copy)`).getByRole('button', { name: 'Delete strategy' }).click()
    await dialog.getByRole('button', { name: 'Delete strategy' }).click()
    await expect(row(`${name} (copy)`)).toHaveCount(0)

    const change = async (data: Record<string, unknown>) => (await page.request.post(strategies, {
      headers: mutationHeaders(await csrfToken(page)), data,
    })).json()
    const current = await catalog()
    const strategy = Object.keys(current.catalog.records).find(id => current.catalog.records[id].name === name)
    if (!strategy) throw new Error('Saved strategy was not returned by the Panel')
    expect(current.catalog.records[strategy].raw).toBe(text)
    const stale = await change({ action: 'create', expectedRevision: base.revision, draft })
    expect(stale.success).toBe(false)
    expect(stale.msg).toContain('catalog changed')

    await row(name).getByRole('button', { name: 'Edit strategy' }).click()
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`${name} edited`)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(`${name} edited`)).toBeVisible()

    // Browser fixture has no installed broker. Exercise real retained OFF
    // intent and its reference guard; installed tests qualify live admission.
    const save = async (action: string, data: unknown) => (await page.request.post('api/save', {
      headers: mutationHeaders(await csrfToken(page)), form: { object: 'outbounds', action, data: JSON.stringify(data) },
    })).json()
    const outbound = { type: 'direct', tag: direct, tcp_fast_open: true,
      zapret: { outboundRef: direct, enabled: false, strategyRef: strategy } }
    try {
      const added = await save('new', outbound)
      expect(added.success, added.msg).toBe(true)
      const referenced = await catalog()
      expect(referenced.references).toContainEqual(expect.objectContaining({ outboundRef: direct, strategyRef: strategy, state: 'off' }))
      const rejected = await change({ action: 'delete', expectedRevision: referenced.revision, id: strategy })
      expect(rejected.success).toBe(false)
      expect(rejected.msg).toContain(direct)
      await page.reload()
      await expect(row(`${name} edited`).getByRole('button', { name: 'Delete strategy' })).toBeDisabled()

      await page.goto('outbounds')
      const outboundRow = (mode === 'classic' ? page.locator('.outbounds__card') : page.getByRole('row'))
        .filter({ has: page.getByText(direct, { exact: true }) })
      await outboundRow.getByRole('button', { name: 'Edit', exact: true }).click()
      dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Protocols and IP families depend on the installed profile')).toBeVisible()
      await expect(dialog.getByText(`${name} edited`, { exact: true })).toBeVisible()

      await page.goto('dns')
      await page.getByRole('button', { name: 'Add Dns Server', exact: true }).first().click()
      dialog = page.getByRole('dialog').filter({ hasText: 'Add DNS Server' })
      await dialog.getByRole('combobox', { name: 'Type', exact: true }).press('Enter')
      await page.getByRole('option', { name: 'https', exact: true }).click()
      const transport = dialog.getByRole('combobox', { name: 'Transport via', exact: true })
      await expect(transport).toHaveCount(1)
      await transport.press('Enter')
      await page.getByRole('option', { name: direct, exact: true }).click()
      await expect(dialog.getByText(direct, { exact: true })).toBeVisible()
      await expect(dialog.getByRole('combobox', { name: 'Zapret strategy', exact: true })).toHaveCount(0)
      await expect(dialog.getByText(/Zapret via/)).toHaveCount(0)
    } finally {
      const removed = await save('del', direct)
      expect(removed.success, removed.msg).toBe(true)
      const latest = await catalog()
      const deleted = await change({ action: 'delete', expectedRevision: latest.revision, id: strategy })
      expect(deleted.success, deleted.msg).toBe(true)
      const listDeleted = await change({ action: 'delete-list', expectedRevision: deleted.obj.revision, id: listID })
      expect(listDeleted.success, listDeleted.msg).toBe(true)
    }
  })
}
