import { expect, test } from '@playwright/test'
import { csrfToken, enableComponent, login, mutationHeaders } from './helpers'

for (const layout of ['classic', 'nexus']) {
  test(`${layout} keeps BlockCheck groups and path choices in one host workflow`, async ({ page }, info) => {
    await page.addInitScript(value => window.localStorage.setItem('sui:ui:mode', value), layout)
    await login(page)
    await enableComponent(page, 'observability-extra')
    await enableComponent(page, 'blockcheck')
    await page.goto('hosts/local/diagnostics')
    await expect(page.locator('.diagnostics')).toBeVisible()
    await page.getByRole('button', { name: 'BlockCheck', exact: true }).click()
    await expect(page).toHaveURL(/\/hosts\/local\/blockcheck$/)
    const workflow = page.locator('.blockcheck')
    const select = (label: string) => workflow.getByRole('combobox', { name: label, exact: true })
    async function choose(label: string, option: string) {
      const control = select(label)
      await control.click()
      const menu = page.getByRole('listbox', { name: label, exact: true })
      await menu.getByRole('option', { name: option, exact: true }).click()
      await expect(control).toHaveValue(option)
      await expect(menu).toBeHidden()
    }
    const start = workflow.getByRole('button', { name: 'Check all groups', exact: true })
    await expect(workflow.getByText(/No authorized ingress can verify/)).toBeVisible()
    await expect(start).toBeDisabled()
    await choose('Path', 'Host baseline')
    await expect(workflow.getByText(/cannot verify that this flow and its DNS/)).toBeVisible()
    await expect(start).toBeDisabled()
    await choose('Path', 'Selected outbound')
    await expect(select('Applied outbound')).toBeVisible()
    await expect(start).toBeDisabled()

    const name = `BlockCheck ${layout} fixture`
    const card = (title: string) => workflow.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    await workflow.getByRole('button', { name: 'New group', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).first().fill(name)
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).last().fill('Fixture origin')
    await dialog.getByRole('textbox', { name: 'Hostname or IP', exact: true }).fill('fixture.example')
    await dialog.getByRole('textbox', { name: 'Role', exact: true }).fill('Controlled fixture')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(card(name).getByRole('button', { name: 'Check', exact: true })).toBeDisabled()
    await expect(workflow.getByText('fixture.example', { exact: true })).toBeVisible()
    await card(name).getByRole('button', { name: `Actions for ${name}`, exact: true }).click()
    await page.getByText('Edit group', { exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).first().fill(`${name} edited`)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toBeHidden()
    await page.reload()
    const edited = card(`${name} edited`)
    await edited.getByRole('button', { name: 'Group details', exact: true }).click()
    await expect(workflow.getByText('fixture.example', { exact: true })).toBeVisible()
    if (layout === 'nexus') await page.setViewportSize({ width: 390, height: 844 })
    const overflows = await edited.evaluate(element => element.scrollWidth > element.clientWidth + 1)
    expect(overflows).toBe(false)
    await workflow.screenshot({ path: info.outputPath(`${layout}-blockcheck.png`) })
    await edited.getByRole('button', { name: `Actions for ${name} edited`, exact: true }).click()
    await page.getByText('Delete group', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete group', exact: true }).click()
    await expect(workflow.getByText('fixture.example', { exact: true })).toHaveCount(0)

    const disabled = await page.request.post('api/update/components/blockcheck/disable', {
      headers: mutationHeaders(await csrfToken(page)),
    })
    expect(disabled.ok()).toBeTruthy()
    expect((await disabled.json()).success).toBe(true)
    const denied = await page.request.get('api/components/blockcheck/groups')
    expect(denied.status()).toBe(409)
    await page.goto('hosts/local/diagnostics')
    await expect(page.locator('.diagnostics')).toBeVisible()
    await expect(page.getByRole('button', { name: 'BlockCheck', exact: true })).toHaveCount(0)
  })

  test(`${layout} explains retained BlockCheck observations without inventing endpoint TCP`, async ({ page }, info) => {
    await page.addInitScript(value => window.localStorage.setItem('sui:ui:mode', value), layout)
    if (layout === 'nexus') await page.setViewportSize({ width: 390, height: 844 })
    await login(page)
    await enableComponent(page, 'blockcheck')
    const base = 'api/components/blockcheck'
    const history = await page.request.get(`${base}/history`)
    expect(history.ok()).toBeTruthy()
    expect((await history.json()).obj.runs).toEqual([])

    // Use saved observations as UI fixtures; do not probe external services.
    const ids = ['telegram', 'discord', 'youtube', 'whatsapp']
    const path = { mode: 'OUTBOUND', ref: 'fixture-outbound' }
    const startedAt = '2026-11-25T18:00:00Z'
    const finishedAt = '2026-11-25T18:00:05Z'
    const row = (target: number, probe: string, stage: string, status: string) => ({
      target, targetRef: `fixture-${target}`, probe, stage, status, elapsedMs: 100,
    })
    const web = { ...row(0, 'https', 'http', 'http_response'), httpStatus: 204, tlsVersion: 'TLS 1.3', tlsVerified: true }
    const rows = [
      [web, { ...row(0, 'tcp', 'tcp', 'unobservable'), reason: 'proxy_connect_not_endpoint_proof' }, row(1, 'stun', 'udp', 'timeout')],
      [web], [row(0, 'https', 'tls', 'connection_reset')], [row(0, 'https', 'tcp', 'unsupported')],
    ]
    const groups = ids.map((groupId, index) => ({
      report: { job: { jobId: `report-${groupId}`, phase: 'COMPLETED' }, path, groupId, groupRevision: 'fixture-v1', family: 'ipv4',
        pathEvidence: { host: { id: 'local' }, generation: 'fixture-core', scope: 'outbound-proxy-connect' }, startedAt, finishedAt, results: rows[index] },
      targets: [{ name: 'Site', host: 'website.fixture.example', role: 'Website' },
        ...(index === 0 ? [{ name: 'Voice', host: 'voice.fixture.example', role: 'Voice (STUN)' }] : [])],
    }))
    const run = { all: true, id: 'fixture', groupIds: ids, path, family: 'ipv4', depth: 'quick', startedAt, finishedAt, phase: 'COMPLETED',
      progress: { groupsDone: 4, totalGroups: 4, probesDone: 6, totalProbes: 6 }, groups }
    const stunPath = { mode: 'OUTBOUND', ref: 'fixture-direct' }
    const stunRun = { ...run, all: false, id: 'fixture-stun', groupIds: ['stun-controls'], path: stunPath,
      progress: { groupsDone: 1, totalGroups: 1, probesDone: 2, totalProbes: 2 }, groups: [{
        report: { job: { jobId: 'report-stun', phase: 'COMPLETED' }, path: stunPath, groupId: 'stun-controls', groupRevision: 'fixture-v1', family: 'ipv4',
          pathEvidence: { host: { id: 'local' }, generation: 'fixture-core', scope: 'outbound-pinned-ip' }, startedAt, finishedAt,
          results: [row(0, 'stun', 'stun', 'ok'), row(1, 'stun', 'udp', 'connection_failed')] },
        targets: [{ name: 'Binding response', host: 'binding.fixture.example', role: 'Voice' },
          { name: 'Socket failure', host: 'socket.fixture.example', role: 'Voice' }],
      }] }
    await page.route(`**/${base}/history`, route => route.fulfill({ json: { success: true, msg: '', obj: { version: 1, runs: [run, stunRun] } } }))
    await page.goto('hosts/local/blockcheck')
    const workflow = page.locator('.blockcheck')
    await expect(workflow.locator('.overview-counts dd')).toHaveText(['1', '1', '1', '1'])
    const telegram = workflow.locator('[data-group-id="telegram"]')
    await expect(telegram.getByText('Limited', { exact: true })).toBeVisible()
    await expect(telegram.getByText('Voice (STUN)', { exact: true }).first()).toBeVisible()
    await telegram.getByRole('button', { name: 'Group details' }).click()
    await expect(workflow.locator('[data-stage="tcp"][data-availability="unconfirmed"]').first()).toBeVisible()
    await expect(workflow.getByText(/endpoint TCP handshake was not observed/)).toBeVisible()
    await expect(workflow.getByText('voice.fixture.example', { exact: true })).toBeVisible()
    const losesWidth = await workflow.evaluate(element => element.scrollWidth > element.clientWidth + 1)
    expect(losesWidth).toBe(false)
    await workflow.locator('#blockcheck-results').scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`${layout}-blockcheck-service-evidence.png`) })

    await workflow.locator('[data-group-id="stun-controls"]').getByRole('button', { name: 'Group details' }).click()
    const binding = workflow.locator('.target-result').filter({ hasText: 'binding.fixture.example' })
    const socket = workflow.locator('.target-result').filter({ hasText: 'socket.fixture.example' })
    const observedBinding = binding.locator('[data-stage="stun"][data-availability="available"]')
    await expect(observedBinding).toBeVisible()
    await expect(observedBinding).toContainText('STUN Binding')
    await expect(socket.locator('[data-stage="udp"][data-availability="unavailable"]')).toBeVisible()
    await expect(socket.locator('[data-stage="stun"][data-availability="unconfirmed"]')).toContainText('Not observed')
    await workflow.locator('#blockcheck-results').scrollIntoViewIfNeeded()
    expect(await workflow.evaluate(element => element.scrollWidth > element.clientWidth + 1)).toBe(false)
    await page.screenshot({ path: info.outputPath(`${layout}-blockcheck-stun-evidence.png`) })
  })
}
