import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import { csrfToken, enableComponent, login, mutationHeaders } from './helpers'

const strategies = 'api/components/zapret/strategies'

for (const mode of ['classic', 'nexus']) {
  test(`${mode} preserves ordered Circular variants through the native editor`, async ({ page }) => {
    await page.addInitScript(layout => window.localStorage.setItem('sui:ui:mode', layout), mode)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    await page.getByRole('button', { name: 'New strategy', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const name = `${mode} Circular round trip`
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    await dialog.getByRole('button', { name: 'HTTP/TCP preset', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'TCP action', exact: true }).press('Enter')
    await page.getByRole('option', { name: 'Circular', exact: true }).click()
    const failures = dialog.getByRole('spinbutton', { name: 'Failures before rotation', exact: true })
    const splits = dialog.getByRole('textbox', { name: 'Split bytes (ordered)', exact: true })
    await failures.fill('2')
    await splits.fill('17,9')
    const rawButton = dialog.getByRole('button', { name: 'Native options', exact: true })
    const native = dialog.getByRole('textbox', { name: 'Native options', exact: true })
    await rawButton.click()
    await expect(native).toHaveValue(/--in-range=-n32[\s\S]*circular:fails=2[\s\S]*--in-range=x[\s\S]*multisplit:pos=17:strategy=1[\s\S]*multisplit:pos=9:strategy=2/)
    const updated = (await native.inputValue()).replace('circular:fails=2', 'circular:fails=3')
      .replace('multisplit:pos=17:strategy=1', 'multisplit:pos=23:strategy=1')
    await native.fill(updated)
    await dialog.getByRole('button', { name: 'Profiles', exact: true }).click()
    await expect(failures).toHaveValue('3')
    await expect(splits).toHaveValue('23,9')
    await rawButton.click()
    await expect(native).toHaveValue(updated)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    const row = page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
    await expect(row).toBeVisible()
    const file = page.waitForEvent('download')
    await row.getByRole('button', { name: 'Export', exact: true }).click()
    const transfer = JSON.parse(await fs.readFile(await (await file).path(), 'utf8'))
    expect(transfer.strategy.raw).toBe(updated)
    expect(transfer.strategy.definition.needsReturn).toBe(true)
    expect(transfer.strategy.definition.profiles[0].circular).toEqual({ failures: 3, splits: [23, 9] })
    await row.getByRole('button', { name: 'Delete strategy', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete strategy', exact: true }).click()
    await expect(row).toHaveCount(0)
  })
}

for (const mode of ['classic', 'nexus']) {
  test(`${mode} binds proxy outer sockets without adding a Selector binding`, async ({ page }) => {
    await page.addInitScript(layout => window.localStorage.setItem('sui:ui:mode', layout), mode)
    await login(page)
    await enableComponent(page, 'zapret')
    const http = 'qualified-http-proxy'
    const hy2 = 'qualified-hysteria2'
    const hopping = 'port-hopping-hysteria2'
    const selector = 'qualified-proxy-group'
    const strategy = 'outer-strategy'
    let enabled = false
    let ready = true
    await page.route(/\/api\/load(?:\?|$)/, async route => {
      const response = await route.fetch()
      const body = await response.json()
      // The Backend browser fixture omits QUIC. The installed provider tests
      // prove the Hysteria2 socket; exercise its advertised editor state here.
      const quic = body.obj?.capabilities?.facts?.find((fact: { category: string; type: string }) =>
        fact.category === 'outbounds' && fact.type === 'hysteria2')
      if (quic) Object.assign(quic, { registered: true, compiled: true, available: true })
      if (Array.isArray(body.obj?.outbounds)) body.obj.outbounds.push(
        { id: 98_001, tag: http, type: 'http', server: '203.0.113.2', server_port: 19080,
          zapret: { outboundRef: http, strategyRef: strategy, enabled } },
        { id: 98_002, tag: hy2, type: 'hysteria2', server: '2001:db8:2::2', server_port: 19452, tls: { enabled: true } },
        { id: 98_003, tag: hopping, type: 'hysteria2', server: '2001:db8:2::2', server_port: 19452, server_ports: ['19452:19455'], tls: { enabled: true } },
        { id: 98_004, tag: selector, type: 'selector', outbounds: [http, hy2], default: http },
      )
      await route.fulfill({ response, json: body })
    })
    await page.route(`**/${strategies}`, route => route.fulfill({ json: { success: true, msg: '', obj: {
      ready, catalog: { records: { [strategy]: { name: 'Outer strategy' } } }, references: [],
    } } }))
    const saves: unknown[] = []
    await page.route('**/api/save', async route => {
      const form = new URLSearchParams(route.request().postData() ?? '')
      expect(form.get('object')).toBe('outbounds')
      expect(form.get('action')).toBe('edit')
      const saved = JSON.parse(form.get('data') ?? '{}')
      saves.push(saved)
      if (saved.tag === http) enabled = saved.zapret.enabled
      await route.fulfill({ json: { success: true, msg: '', obj: null } })
    })
    const editor = page.getByRole('dialog')
    const toggle = editor.getByLabel('Zapret', { exact: true })
    const edit = async (tag: string) => {
      await page.goto('outbounds')
      const row = (mode === 'classic' ? page.locator('.outbounds__card') : page.getByRole('row'))
        .filter({ has: page.getByText(tag, { exact: true }) })
      await row.getByRole('button', { name: 'Edit', exact: true }).click()
    }

    await edit(http)
    await expect(toggle).toBeEnabled()
    await expect(editor.getByText(/Outer TCP connection to the HTTP proxy only/)).toBeVisible()
    await toggle.check()
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => saves.at(-1)).toMatchObject({ tag: http, server_port: 19080, zapret: { outboundRef: http, strategyRef: strategy, enabled: true } })

    ready = false
    await edit(http)
    await expect(toggle).toBeChecked()
    await expect(editor.getByText(/An existing binding can still be turned off/)).toBeVisible()
    await toggle.uncheck()
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => saves.at(-1)).toMatchObject({ tag: http, server_port: 19080, zapret: { outboundRef: http, strategyRef: strategy, enabled: false } })

    ready = true
    await edit(hy2)
    await expect(toggle).toBeEnabled()
    await expect(editor.getByText(/Outer QUIC\/UDP connection to the Hysteria2 server only/)).toBeVisible()
    await toggle.check()
    await editor.getByRole('combobox', { name: 'Zapret strategy', exact: true }).press('Enter')
    await page.getByRole('option', { name: 'Outer strategy', exact: true }).click()
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => saves.at(-1)).toMatchObject({ tag: hy2, server_port: 19452, zapret: { outboundRef: hy2, strategyRef: strategy, enabled: true } })
    await edit(hopping)
    await expect(toggle).toBeDisabled()
    await expect(editor.getByText(/cannot admit a hopping port range/)).toBeVisible()
    await edit(selector)
    await expect(toggle).toHaveCount(0)
  })

  test(`${mode} preserves Direct source binds and exposes plain DNS detours`, async ({ page }) => {
    await page.addInitScript(layout => window.localStorage.setItem('sui:ui:mode', layout), mode)
    await login(page)
    await enableComponent(page, 'zapret')
    const direct = 'qualified-source-direct'
    const strategy = 'resolver-strategy'
    let enabled = false
    // This browser fixture only supplies the installed status projection.
    // Source ownership and DNS retries are exercised in the installed guest.
    await page.route(/\/api\/load(?:\?|$)/, async route => {
      const response = await route.fetch()
      const body = await response.json()
      if (Array.isArray(body.obj?.outbounds)) body.obj.outbounds.push({
        id: 99_001, tag: direct, type: 'direct', bind_interface: 'eth0',
        inet4_bind_address: '198.18.0.5', inet6_bind_address: '2001:db8:1::5',
        zapret: { outboundRef: direct, strategyRef: strategy, enabled },
      })
      await route.fulfill({ response, json: body })
    })
    await page.route(`**/${strategies}`, route => route.fulfill({ json: { success: true, msg: '', obj: {
      catalog: { records: { [strategy]: { name: 'Resolver strategy' } } }, ready: true,
      references: [{ outboundRef: direct, strategyRef: strategy, enabled, state: enabled ? 'applied' : 'off' }],
    } } }))

    await page.goto('outbounds')
    const row = (mode === 'classic' ? page.locator('.outbounds__card') : page.getByRole('row'))
      .filter({ has: page.getByText(direct, { exact: true }) })
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    const editor = page.getByRole('dialog')
    const toggle = editor.getByLabel('Zapret', { exact: true })
    await expect(toggle).toBeEnabled()
    await toggle.check()
    await expect(editor.getByRole('textbox', { name: 'Bind to Network Interface', exact: true })).toHaveValue('eth0')
    await expect(editor.getByRole('textbox', { name: 'Bind to IPv4', exact: true })).toHaveValue('198.18.0.5')
    await expect(editor.getByRole('textbox', { name: 'Bind to IPv6', exact: true })).toHaveValue('2001:db8:1::5')

    enabled = true
    await page.goto('dns')
    await page.getByRole('button', { name: 'Add Dns Server', exact: true }).first().click()
    const dns = page.getByRole('dialog').filter({ hasText: 'Add DNS Server' })
    const type = dns.getByRole('combobox', { name: 'Type', exact: true })
    const transport = dns.getByRole('combobox', { name: 'Transport via', exact: true })
    for (const protocol of ['tcp', 'udp']) {
      await type.press('Enter')
      await page.getByRole('option', { name: protocol, exact: true }).click()
      await expect(transport).toHaveCount(1)
      await expect(dns.getByText(/Zapret via/)).toHaveCount(0)
      await transport.press('Enter')
      await page.getByRole('option', { name: direct, exact: true }).click()
      await expect(dns.getByText(/Direct binding applied; DNS packet matches are not shown here/)).toBeVisible()
      await expect(dns.getByText(protocol === 'udp' ? /Truncated replies are retried over TCP/ : /must cover TCP for the resolver port/)).toBeVisible()
      await expect(dns.getByRole('combobox', { name: 'Zapret strategy', exact: true })).toHaveCount(0)
      await transport.press('Enter')
      await page.getByRole('option', { name: 'Default transport', exact: true }).click()
    }
  })

  test(`${mode} shows native profile evidence for the applied Direct only`, async ({ page }) => {
    await page.addInitScript(layout => window.localStorage.setItem('sui:ui:mode', layout), mode)
    await login(page)
    await enableComponent(page, 'zapret')
    let applied = true
    // The installed broker proof qualifies the evidence source. Here exercise
    // the presentation, including an out-of-date observation in a response.
    await page.route(`**/${strategies}`, route => route.fulfill({ json: { success: true, obj: {
      catalog: { records: {} }, ready: true, references: [
        { outboundRef: 'trace-a', strategyRef: 'http-a', enabled: true, queue: 401,
          state: applied ? 'applied' : 'pending', nativeMatches: { profiles: ['http-profile-a'] } },
        { outboundRef: 'trace-b', strategyRef: 'http-b', enabled: true, queue: 401, state: 'applied', nativeMatches: {} },
      ],
    } } }))
    await page.goto('zapret')
    const row = (ref: string) => page.getByRole('row').filter({ has: page.getByText(ref, { exact: true }) })
    await expect(row('trace-a').getByText('http-profile-a', { exact: true })).toBeVisible()
    await expect(row('trace-b').getByText('No native profile observed yet', { exact: true })).toBeVisible()
    applied = false
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(row('trace-a').getByText('Desired differs from applied')).toBeVisible()
    await expect(page.getByText('http-profile-a', { exact: true })).toHaveCount(0)
  })

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
