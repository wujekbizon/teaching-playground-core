import { expect, test } from '@playwright/test'

test('shows TURN relay diagnostics from the development server', async ({ page }, testInfo) => {
  test.skip(!process.env.TURN_URLS, 'Real TURN credentials are supplied by the host environment for relay validation runs.')
  const response = await page.request.get('http://localhost:3001/api/turn')
  expect(response.status()).toBe(200)
  const turnConfig = await response.json() as { enabled: boolean; relayOnly: boolean; rtcConfiguration: RTCConfiguration }
  expect(turnConfig.enabled).toBe(true)
  expect(turnConfig.relayOnly).toBe(true)
  expect(turnConfig.rtcConfiguration.iceServers?.[0].urls).toContain('turn:turn.example.test:3478')

  await page.goto('/')
  await expect(page.getByText('TURN relay')).toBeVisible()
  await expect(page.getByText('Configured')).toBeVisible()
  await expect(page.getByLabel('Force relay-only ICE')).toBeChecked()
  await page.screenshot({ path: testInfo.outputPath('turn-relay-diagnostics.png'), fullPage: true })
})
