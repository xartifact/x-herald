/**
 * CDP 抓 UUID→名称 映射
 *
 * 走 5 个 admin 页面，提取所有 UUID（行 ID / 详情链接 / 选中态）
 * 并把同一页面里出现的"显示名称"映射起来。
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('../../.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=', 2)),
)

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()

// 登录 + 注入 token
const r = await fetch('http://localhost:5005/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: env.ADMIN_PASSWORD }),
})
const { token } = await r.json()
await page.goto('http://localhost:5005/login')
await page.evaluate((t) => localStorage.setItem('admin_token', t), token)

const cdp = await ctx.newCDPSession(page)

const PAGES = [
  { path: '/admin/model-routes', label: 'model-routes' },
  { path: '/admin/model-groups', label: 'model-groups' },
  { path: '/admin/access-models', label: 'access-models' },
  { path: '/admin/providers', label: 'providers' },
  { path: '/admin/keys', label: 'keys' },
  { path: '/admin/routing-traces', label: 'routing-traces' },
]

const all = {}
for (const p of PAGES) {
  console.log(`\n=== ${p.label} (${p.path}) ===`)
  await page.goto('http://localhost:5005' + p.path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // 用 CDP 抓页面所有 href（UUID 在 path 末段）+ 表格行内容
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const uuidsInLinks = [...new Set(
        [...document.querySelectorAll('a[href]')]
          .map(a => a.getAttribute('href'))
          .filter(h => /\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(h || ''))
      )]
      const rows = [...document.querySelectorAll('table tbody tr')].map(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent?.trim().slice(0, 80))
        const uuids = [...tr.querySelectorAll('.font-mono, code')].map(e => e.textContent?.trim()).filter(Boolean)
        return { cells, uuids }
      })
      const h1 = document.querySelector('h1')?.textContent ?? null
      const empty = document.body.innerText.includes('没有') || document.body.innerText.includes('暂无')
      return JSON.stringify({ h1, empty, rowCount: rows.length, rows: rows.slice(0, 10), uuidsInLinks })
    })()`,
    returnByValue: true,
  })
  if (!result?.value || result.value === 'undefined') {
    console.log('  (no rows / page not ready)')
    all[p.label] = { error: 'no data', url: page.url() }
    continue
  }
  const data = JSON.parse(result.value)
  all[p.label] = data
  console.log(
    `  h1=${data.h1} rows=${data.rowCount} empty=${data.empty} uuidsInLinks=${data.uuidsInLinks.length}`,
  )
  for (const r of data.rows.slice(0, 10)) {
    const name = r.cells.find((c) => c && !/^[0-9a-f-]{8,}$/i.test(c)) ?? r.cells[0]
    console.log(`    ${name?.slice(0, 40)} | uuids: ${r.uuids.join(', ')}`)
  }
}

// 写 JSON 给后续查询用
import { writeFileSync } from 'node:fs'
writeFileSync('/tmp/uuid-map.json', JSON.stringify(all, null, 2))
console.log('\nWritten /tmp/uuid-map.json')

await browser.close()
