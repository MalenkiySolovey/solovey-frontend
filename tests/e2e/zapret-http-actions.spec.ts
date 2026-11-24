import fs from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { enableComponent, login } from './helpers'

for (const mode of ['classic', 'nexus']) {
  test(`${mode} keeps ordered HTTP actions and bounded port ranges through both editors and transfer`, async ({ page }, info) => {
    await page.addInitScript(layout => window.localStorage.setItem('sui:ui:mode', layout), mode)
    await login(page)
    await enableComponent(page, 'zapret')
    await page.goto('zapret')
    await page.getByRole('button', { name: 'New strategy', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const name = `${mode} ordered HTTP actions`
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    await dialog.getByRole('button', { name: 'HTTP/TCP preset', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'TCP action', exact: true }).press('Enter')
    await page.getByRole('option', { name: 'HTTP header transforms', exact: true }).click()
    await expect(dialog.getByRole('combobox', { name: 'HTTP actions (execution order)' })).toBeVisible()
    const spelling = dialog.getByRole('textbox', { name: 'Host header spelling' })
    await spelling.fill('hOsT')
    const reverse = dialog.getByRole('button', { name: 'Reverse HTTP action order' })
    await expect(reverse.locator('svg path')).toHaveAttribute('d', /^M[\d.]/)
    await reverse.click()
    await dialog.screenshot({ path: info.outputPath(`${mode}-ordered-http.png`) })

    const raw = dialog.getByRole('textbox', { name: 'Native options', exact: true })
    const rawButton = dialog.getByRole('button', { name: 'Native options', exact: true })
    await rawButton.click()
    await expect(raw).toHaveValue(/--lua-desync=http_hostcase:spell=hOsT\n--lua-desync=http_domcase\n/)
    const extra = Array.from({ length: 17 }, (_, i) => `--new=extra-${i + 1} --filter-tcp=${80 + i}\n`).join('')
    const original = (await raw.inputValue()).replace('spell=hOsT', 'spell=HOST')
      .replace(/^--filter-tcp=80$/m, '--filter-tcp=80-119,65534-65535') + '\n' + extra
    await raw.fill(original)
    await dialog.getByRole('button', { name: 'Profiles', exact: true }).click()
    await expect(spelling).toHaveValue('HOST')
    const profileIDs = dialog.getByRole('textbox', { name: 'Profile ID', exact: true })
    await expect(profileIDs).toHaveCount(18)
    await expect(profileIDs.last()).toHaveValue('extra-17')
    await expect(dialog.getByRole('button', { name: 'Add profile', exact: true })).toBeEnabled()
    await rawButton.click()
    await expect(raw).toHaveValue(original)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    const row = page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
    await expect(row).toBeVisible()
    const download = page.waitForEvent('download')
    await row.getByRole('button', { name: 'Export', exact: true }).click()
    const bytes = await fs.readFile(await (await download).path())
    const transfer = JSON.parse(bytes.toString('utf8'))
    expect(transfer.strategy.raw).toBe(original)
    expect(transfer.strategy.definition.profiles[0].httpActions).toEqual([{ name: 'http_hostcase', spell: 'HOST' }, { name: 'http_domcase' }])
    expect(transfer.strategy.definition.profiles[0].ports).toEqual([...Array.from({ length: 40 }, (_, i) => 80 + i), 65534, 65535])

    await row.getByRole('button', { name: 'Delete strategy', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete strategy', exact: true }).click()
    await expect(row).toHaveCount(0)
    await page.locator('.zapret-catalog input[type=file]').setInputFiles({ name: 'http-actions.json', mimeType: 'application/json', buffer: bytes })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Edit strategy', exact: true }).click()
    await rawButton.click()
    await expect(raw).toHaveValue(original)
  })
}
