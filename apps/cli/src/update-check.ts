/**
 * 版本检查：对比本机 CLI 与 GitHub Release 的最新版本，提示升级。
 *
 * 设计由「CLI 会被 Agent 高频、非交互地串行调用」决定，四条硬约束：
 *
 * 1. **命令路径上零网络**。提示只读本地缓存（微秒级）；网络刷新交给脱离父进程
 *    的后台子进程。实测网络往返 1.6s、读缓存 0.03s —— 加在每条命令上差 50 倍。
 * 2. **绝不污染 stdout**。提示只写 stderr。Agent 正在 `| jq`，混入一行就破坏解析。
 * 3. **绝不失败**。无网络、GitHub 限流、DNS 挂了都只是「这次没有新版本可报」。
 * 4. **可关闭**。`X_HERALD_NO_UPDATE_CHECK=1` 或 `--no-update-check`。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 缓存有效期：24 小时。过期后由后台进程刷新。 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** 后台刷新进程的网络超时。它不阻塞任何人，可以比前台宽松。 */
const REQUEST_TIMEOUT_MS = 5000

const DEFAULT_REPO = 'xartifact/x-herald'

/** 内部子命令：只做「查询 + 写缓存」，不输出任何内容，不出现在帮助里。 */
export const INTERNAL_REFRESH_COMMAND = '__update-refresh'

export interface UpdateInfo {
  current: string
  latest: string
  /** 可直接打印的多行建议 */
  hint: string
}

interface VersionCheckCache {
  /** 上次查询的时间戳（ms） */
  checkedAt: number
  /** 上次查到的版本（已去 `cli-v` 前缀）；查询失败时为 null */
  latest: string | null
}

/** 缓存路径可覆盖，便于测试与只读 HOME 环境 */
function cachePath(): string {
  return (
    process.env.X_HERALD_UPDATE_CACHE ?? join(homedir(), '.config', 'x-herald', 'update-check.json')
  )
}

function repoSlug(): string {
  return process.env.X_HERALD_CLI_REPO ?? DEFAULT_REPO
}

/**
 * 解析版本号前三位。
 *
 * 只处理 CLI 自己的形态（`0.2.0`），不追求通用 semver：Release tag 由
 * `cli-v<version>` 决定，出现预发布后缀时视为「不同版本」，不参与排序。
 */
export function parseVersion(raw: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** `latest` 是否比 `current` 新。任一无法解析时返回 false：宁可漏报也不误报。 */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return false
}

/** GitHub tag → 裸版本号：`cli-v0.2.1` → `0.2.1` */
export function tagToVersion(tag: string): string {
  return tag.replace(/^cli-v/, '').replace(/^v/, '')
}

function readCache(): VersionCheckCache | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cachePath(), 'utf-8'))
    if (!parsed || typeof parsed !== 'object') return null
    if (!('checkedAt' in parsed) || typeof parsed.checkedAt !== 'number') return null
    const latest = 'latest' in parsed ? parsed.latest : null
    return { checkedAt: parsed.checkedAt, latest: typeof latest === 'string' ? latest : null }
  } catch {
    // 不存在 / 损坏 / 无权限：都当作「没有缓存」
    return null
  }
}

function writeCache(cache: VersionCheckCache): void {
  try {
    mkdirSync(dirname(cachePath()), { recursive: true })
    writeFileSync(cachePath(), JSON.stringify(cache))
  } catch {
    // 只读 HOME 或容器里写不进缓存：代价只是下次再查
  }
}

/**
 * 查询最新 Release 版本。
 *
 * 用 `releases/latest` 而非 `releases` 列表：前者只返回最新非预发布版本，
 * 响应体小得多。
 */
async function fetchLatestVersion(repo: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        // GitHub 要求 UA，缺失会被 403
        'user-agent': 'x-herald-cli-update-check',
        accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (!body || typeof body !== 'object' || !('tag_name' in body)) return null
    return typeof body.tag_name === 'string' ? tagToVersion(body.tag_name) : null
  } catch {
    // 无网络 / 超时 / DNS 失败：都只是「这次没查到」
    return null
  }
}

function buildHint(current: string, latest: string, repo: string): string {
  return (
    `有新版本可用: ${current} → ${latest}\n` +
    `  升级: curl -fsSL https://raw.githubusercontent.com/${repo}/main/scripts/install-cli.sh | sh\n` +
    `  或:   X_HERALD_CLI_VERSION=${latest} sh install-cli.sh\n` +
    `  关闭提示: X_HERALD_NO_UPDATE_CHECK=1`
  )
}

/**
 * 只读缓存给出提示，**不发起任何网络请求**。
 *
 * 这是命令结束后被调用的路径：读一个本地 JSON，微秒级。即使缓存已过期，
 * 也只用旧值判断——过期刷新是后台子进程的事。
 */
export function readCachedUpdate(current: string, now = Date.now()): UpdateInfo | null {
  const cached = readCache()
  if (!cached?.latest || !isNewer(cached.latest, current)) return null
  void now
  return { current, latest: cached.latest, hint: buildHint(current, cached.latest, repoSlug()) }
}

/** 缓存是否缺失或过期（决定要不要触发后台刷新） */
export function isCacheStale(now = Date.now()): boolean {
  const cached = readCache()
  return cached === null || now - cached.checkedAt >= CACHE_TTL_MS
}

/**
 * 后台刷新缓存：spawn 自身执行内部命令，父进程立即返回。
 *
 * 必须脱离父进程（`detached` + `stdio: ignore` + `unref`）：否则 CLI 退出会被
 * 子进程拖住，或子进程随父进程被信号杀掉而写不完缓存。
 */
export function spawnBackgroundRefresh(): void {
  try {
    // 编译后的二进制 argv[1] 是内嵌入口（非脚本路径），直接传子命令即可；
    // 开发态需要把 .ts 入口显式传回去，否则子进程无法定位模块。
    const entry = process.argv[1]
    const isScript = typeof entry === 'string' && /\.(ts|tsx|js|mjs)$/.test(entry)
    const args = isScript ? [entry, INTERNAL_REFRESH_COMMAND] : [INTERNAL_REFRESH_COMMAND]
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, X_HERALD_UPDATE_CACHE: cachePath() },
    })
    child.unref()
  } catch {
    // 受限环境无法 spawn：这次不刷新，缓存过期后下次再试
  }
}

/** 后台子进程入口：查询并写缓存，不输出任何内容 */
export async function refreshCacheNow(): Promise<void> {
  const latest = await fetchLatestVersion(repoSlug())
  writeCache({ checkedAt: Date.now(), latest })
}

/**
 * 检查更新（会等待网络）。仅供需要**立即**结果的一次性场景，如 `--update-check-now`；
 * 常规命令路径应使用 `readCachedUpdate` + `spawnBackgroundRefresh`。
 */
export async function checkForUpdate(options: {
  current: string
  repo?: string
  force?: boolean
  now?: () => number
}): Promise<UpdateInfo | null> {
  const { current, force = false } = options
  const repo = options.repo ?? repoSlug()
  const now = options.now ?? Date.now

  const cached = readCache()
  const fresh = cached !== null && now() - cached.checkedAt < CACHE_TTL_MS

  let latest = fresh && !force ? cached.latest : null
  if (!fresh || force) {
    latest = await fetchLatestVersion(repo)
    // 查询失败也写缓存：否则离线环境下每个命令都会重试并各等一次超时
    writeCache({ checkedAt: now(), latest })
  }

  if (!latest || !isNewer(latest, current)) return null
  return { current, latest, hint: buildHint(current, latest, repo) }
}

/** 是否跳过检查（环境变量或命令行开关） */
export function shouldSkipCheck(flagDisabled?: boolean): boolean {
  if (flagDisabled) return true
  const env = process.env.X_HERALD_NO_UPDATE_CHECK
  return env === '1' || env === 'true'
}

/** 仅供测试：删掉缓存文件，使下一次检查必然访问网络 */
export function resetUpdateCache(): void {
  try {
    rmSync(cachePath(), { force: true })
  } catch {
    /* 不存在即可 */
  }
}
