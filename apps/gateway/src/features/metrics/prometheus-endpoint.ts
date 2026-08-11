/**
 * GET /metrics — Prometheus text exposition format.
 *
 * Mounted outside /api/* so it bypasses the JWT auth middleware.
 * Optionally gated by METRICS_IP_ALLOWLIST (comma-separated IPs/CIDRs).
 *
 * Network-isolation is the primary access control — Prometheus scrapers should
 * reach the gateway via an internal network. METRICS_IP_ALLOWLIST is a defense
 * in depth for non-isolated deployments.
 */

import { Hono } from 'hono'
import { loadConfig } from '../../config/loader'

import { renderMetrics } from './prometheus-service'

const metricsRoutes = new Hono()

/** Naive IP matcher: exact match OR /N CIDR range. No external deps. */
function ipAllowed(ip: string, allowlist: string[]): boolean {
  for (const entry of allowlist) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    if (trimmed.includes('/')) {
      // CIDR
      const [range, bitsStr] = trimmed.split('/')
      const bits = Number(bitsStr)
      if (!range || isNaN(bits)) continue
      // Convert both IPs to 32-bit ints and compare prefix
      const toInt = (s: string): number | null => {
        const parts = s.split('.')
        if (parts.length !== 4) return null
        let n = 0
        for (const p of parts) {
          const v = Number(p)
          if (isNaN(v) || v < 0 || v > 255) return null
          n = (n << 8) | v
        }
        return n >>> 0
      }
      const ipInt = toInt(ip)
      const rangeInt = toInt(range)
      if (ipInt === null || rangeInt === null) continue
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
      if ((ipInt & mask) === (rangeInt & mask)) return true
    } else if (trimmed === ip) {
      return true
    }
  }
  return false
}

metricsRoutes.get('/metrics', async (c) => {
  const allowlistRaw = loadConfig().metrics.ipAllowlist ?? ''
  const allowlist = allowlistRaw
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean)
  if (allowlist.length > 0) {
    // Trust X-Forwarded-For first hop when behind a proxy; fall back to direct.
    const xff = c.req.header('x-forwarded-for')
    const ip = xff ? xff.split(',')[0]!.trim() : (c.req.header('x-real-ip') ?? '')
    if (!ip || !ipAllowed(ip, allowlist)) {
      return c.text('# metrics endpoint restricted by IP allowlist', 403)
    }
  }
  const { body, contentType } = await renderMetrics()
  return c.text(body, 200, { 'Content-Type': contentType })
})

export { metricsRoutes }
