import fs from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { enableComponent, login } from './helpers'

for (const mode of ['classic', 'nexus']) {
  test(`${mode} retains outgoing ranges on the correct ordered actions`, async ({ page }, info) => {
    await page.addInitScript(layout => window.localStorage.setItem('sui:ui:mode', layout), mode)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    await page.getByRole('button', { name: 'New strategy', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const name = `${mode} outgoing action ranges`
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    const nativeButton = dialog.getByRole('button', { name: 'Native options', exact: true })
    const profilesButton = dialog.getByRole('button', { name: 'Profiles', exact: true })
    const native = dialog.getByRole('textbox', { name: 'Native options', exact: true })
    await nativeButton.click()
    const source = '--name=ordered --filter-tcp=80\n--filter-l7=http --payload=http_req\n'
      + '--out-range=-d1 --lua-desync=http_domcase\n--out-range=a --lua-desync=http_hostcase:spell=hOsT\n'
      + '--new=quic --filter-udp=443 --filter-l7=quic --payload=quic_initial --out-range=x\n'
      + '--lua-desync=fake:blob=fake_default_quic:repeats=1\n'
    await native.fill(source)
    await profilesButton.click()
    const ranges = dialog.locator('details').filter({ has: page.getByText('Outgoing action range', { exact: true }) })
    const domain = ranges.first().getByRole('textbox', { name: 'Host value case', exact: true })
    const header = ranges.first().getByRole('textbox', { name: 'Host header case', exact: true })
    const quic = ranges.last().getByRole('textbox', { name: 'Outgoing action range', exact: true })
    await expect(domain).toHaveValue('-d1')
    await expect(header).toHaveValue('')
    await expect(quic).toHaveValue('x')
    await nativeButton.click()
    await expect(native).toHaveValue(source)

    await profilesButton.click()
    await quic.fill('-n2')
    await header.fill('n2<n8')
    await dialog.getByRole('button', { name: 'Reverse HTTP action order', exact: true }).click()
    if (mode === 'nexus') await page.setViewportSize({ width: 390, height: 844 })
    await expect(header).toBeVisible()
    await dialog.screenshot({ path: info.outputPath(`${mode}-outgoing-ranges.png`) })
    await nativeButton.click()
    const revised = await native.inputValue()
    expect(revised).toMatch(/--out-range=n2<n8\n--lua-desync=http_hostcase:spell=hOsT\n--out-range=-d1\n--lua-desync=http_domcase\n/)
    expect(revised).toContain('--out-range=-n2\n--lua-desync=fake:blob=fake_default_quic:repeats=1\n')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    const row = page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
    await expect(row).toBeVisible()
    const download = page.waitForEvent('download')
    await row.getByRole('button', { name: 'Export', exact: true }).click()
    const bytes = await fs.readFile(await (await download).path())
    const transfer = JSON.parse(bytes.toString('utf8'))
    expect(transfer.strategy.raw).toBe(revised)
    expect(transfer.strategy.definition.profiles[0].httpActions).toEqual([
      { name: 'http_hostcase', spell: 'hOsT', outRange: 'n2<n8' },
      { name: 'http_domcase', outRange: '-d1' },
    ])
    expect(transfer.strategy.definition.profiles[1].outRange).toBe('-n2')

    await row.getByRole('button', { name: 'Delete strategy', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete strategy', exact: true }).click()
    await expect(row).toHaveCount(0)
    await page.locator('.zapret-catalog input[type=file]').setInputFiles({ name: 'ranged-action.json', mimeType: 'application/json', buffer: bytes })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Edit strategy', exact: true }).click()
    await nativeButton.click()
    await expect(native).toHaveValue(revised)
  })
}
