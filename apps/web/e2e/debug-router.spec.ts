import { test } from '@playwright/test'

test('router DOM trace', async ({ page }) => {
  const logs: string[] = []
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))

  await page.goto('/admin', { waitUntil: 'networkidle', timeout: 15000 })
  await page.waitForTimeout(5000)

  const state = await page.evaluate(() => {
    const root = document.getElementById('root')
    return {
      html: root?.innerHTML?.substring(0, 2000) || 'EMPTY',
      // Check the query cache for auth:me
      queryKeys: Object.keys(localStorage).filter(k => k.includes('query') || k.includes('auth'))
    }
  })
  console.log('URL:', page.url())
  console.log('STATE:', JSON.stringify(state, null, 2))
  console.log('RELEVANT_LOGS:', logs.filter(l => !l.includes('[debug]')).join('\n').substring(0, 2000))
})
