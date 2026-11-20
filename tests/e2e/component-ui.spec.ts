import { expect, test } from '@playwright/test'
import { csrfToken, enableComponent, login, mutationHeaders, readServerState } from './helpers'

for (const mode of ['classic', 'nexus']) {
  test(`${mode} projects the real Component route from permissions and enabled state`, async ({ page }) => {
    await page.addInitScript(selected => window.localStorage.setItem('sui:ui:mode', selected), mode)
    await login(page)
    await enableComponent(page, 'observability-extra')
    await page.goto('hosts/local/diagnostics')
    await expect(page.locator('.diagnostics')).toBeVisible()
    await expect(page.locator('a[href$="/hosts/local/diagnostics"]').first()).toHaveCount(1)
    await expect(page.getByTestId('host-context')).toContainText('Host: Local')

    const postureURL = new URL('api/v1/security/posture', readServerState().baseURL).toString()
    await page.route(postureURL, async route => {
      const response = await route.fetch()
      const body = await response.json()
      body.obj.componentUIReadPermissions = ['unknown.permission']
      await route.fulfill({ response, json: body })
    })
    await page.reload()
    await expect(page.getByText('This feature is unavailable on this Host. Check the installed Components in Settings.')).toBeVisible()
    await expect(page.locator('.diagnostics')).toHaveCount(0)
    await expect(page.locator('a[href$="/hosts/local/diagnostics"]')).toHaveCount(0)
    await page.unroute(postureURL)

    try {
      const token = await csrfToken(page)
      const disabled = await page.request.post('api/update/components/observability-extra/disable', { headers: mutationHeaders(token) })
      expect(disabled.ok()).toBe(true)
      expect((await disabled.json()).success).toBe(true)
      await page.reload()
      await expect(page.getByText('This feature is unavailable on this Host. Check the installed Components in Settings.')).toBeVisible()
      await expect(page.locator('a[href$="/hosts/local/diagnostics"]')).toHaveCount(0)
    } finally {
      // Browser files share the managed backend. Restore the state established
      // above so later maintenance scenarios retain their real Component.
      await enableComponent(page, 'observability-extra')
    }
  })

  test(`${mode} loads the Paid contribution and reads tariffs from the Panel API`, async ({ page }) => {
    await page.addInitScript(selected => window.localStorage.setItem('sui:ui:mode', selected), mode)
    await login(page)
    const baseURL = readServerState().baseURL
    const tariffsURL = new URL('api/paidsub/tariffs', baseURL).toString()
    const tariffs = page.waitForResponse(response => response.request().method() === 'GET' && response.url() === tariffsURL)
    await page.goto('paid-subscriptions')
    const response = await tariffs
    expect(response.ok()).toBe(true)
    expect((await response.json()).success).toBe(true)
    await expect(page.getByRole('tab', { name: 'Tariffs', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Orders', exact: true })).toBeVisible()
  })
}
