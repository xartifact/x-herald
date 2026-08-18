---
name: cdp-debugging-on-5005
description: Use when debugging or scripting the x-herald admin SPA served on the unified host port 5005 via Chrome DevTools Protocol (CDP) — scraping admin pages, inspecting the React/TanStack Router DOM, driving Runtime.evaluate in a real browser, or reproducing the apps/web/cdp-uuid-lookup.mjs pattern against 100.80.110.125:5005.
---

# CDP Debugging on the Unified 5005 Port

## Overview

The x-herald admin SPA and gateway API are served together on **port 5005** (the "unified/host port", see `.env` `HOST_PORT=5005`). CDP tooling drives real Chromium against it with Playwright's `CDPSession` (`Runtime.evaluate`). Canonical pattern: `apps/web/cdp-uuid-lookup.mjs`.

## When to Use

- Need UUID→name/ID mappings from admin pages (model-routes, model-groups, access-models, providers, keys, routing-traces).
- Inspecting rendered DOM / querying the built SPA when user-visible behavior differs from source.
- Debugging a route/table that only exists after login.
- Scripting repeated admin-page checks without hand-driving a browser.

**Not for:** unit/UI tests (`bun:test` / `vitest`) or Playwright E2E (`apps/web/e2e`).

## Quick Reference

| Concern | Answer |
| ------- | ------ |
| Base URL | `http://100.80.110.125:5005` |
| Auth | POST `/api/auth/login` `{username,password}` → JWT → `localStorage.admin_token` |
| Browser | `chromium.launch({ headless: true })` from `@playwright/test` |
| Evaluate | `cdp.send('Runtime.evaluate', { expression, returnByValue: true })` |
| Login/admin | `/login`; panels under `/admin/*` |
| Env | `.env`/`.env.local`: `PORT`=gateway, `HOST_PORT`=5005; `ADMIN_PASSWORD` |

## Pattern (grounded in `cdp-uuid-lookup.mjs`)

```js
// 1) Launch + open base
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()

// 2) Auth: login via API once, then inject JWT into localStorage BEFORE the SPA router reads it
const r = await fetch('http://100.80.110.125:5005/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }),
})
const { token } = await r.json()
await page.goto('http://100.80.110.125:5005/login')
await page.evaluate((t) => localStorage.setItem('admin_token', t), token)

const cdp = await ctx.newCDPSession(page)

// 3) Per page: navigate, wait for render, drive Runtime.evaluate
await page.goto('http://100.80.110.125:5005/admin/model-routes', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const { result } = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const rows = [...document.querySelectorAll('table tbody tr')].length
    const uuids = [...new Set([...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => /\\/[0-9a-f-]{36}/i.test(h || '')))]
    return JSON.stringify({ rows, uuids })
  })()`,
  returnByValue: true,
})
console.log(page.url(), JSON.parse(result.value))
await browser.close()
```

## Running the Unified 5005 Server

- `PORT=5005` + gateway runtime serves `/api/*` and the built SPA (`createEngine.ts` step 11 mounts `apps/web/dist` via `serveStatic`). Build first: `cd apps/web && bun run build`.
- Dev lane is split: gateway `:3000`, vite `:5173`. 5005 = combined/prod-style lane the CDP tooling assumes.
- `HOST_PORT=5005` in `.env` declares the host port convention; code does not consume it — the CDP scripts hardcode `:5005`.

## Common Mistakes

- **Evaluating before login lands**: token must be in `localStorage` before `/admin/*` navigation, else the router redirects to `/login` (empty pages, `rows=0`).
- **Missing `returnByValue: true`**: `Runtime.evaluate` then returns a remote handle, not a JSON value.
- **Wrong wait signal**: use `waitUntil: 'networkidle'` + a short settle timeout; table rows appear after the SPA refetches.
- **Hardcoded credentials**: read the admin password from env, never inline it.
- **Server not up on 5005**: the scripts target `:5005` unconditionally — start the gateway there first.

Source of truth for the pattern: `apps/web/cdp-uuid-lookup.mjs`.