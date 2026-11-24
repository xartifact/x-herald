import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  checkForUpdate,
  isCacheStale,
  isNewer,
  parseVersion,
  readCachedUpdate,
  resetUpdateCache,
  shouldSkipCheck,
  tagToVersion,
} from './update-check'

/**
 * 版本检查的契约由「CLI 被 Agent 高频调用」推导：
 * 不阻塞、不失败、不每次都查网络、可关闭。
 */
describe('update-check / version comparison', () => {
  it('parses three-part versions and rejects noise', () => {
    expect(parseVersion('0.2.0')).toEqual([0, 2, 0])
    expect(parseVersion('1.10.3')).toEqual([1, 10, 3])
    expect(parseVersion('v0.2.1')).toBeNull()
    expect(parseVersion('0.2')).toBeNull()
    expect(parseVersion('')).toBeNull()
  })

  it('compares numerically, not lexically', () => {
    // 字典序会把 "0.9.0" 判成大于 "0.10.0"，这是最常见的一类误报
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(isNewer('0.9.0', '0.10.0')).toBe(false)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
    expect(isNewer('0.2.0', '0.2.0')).toBe(false)
  })

  it('never reports an update when either side is unparseable', () => {
    // 宁可漏报：误报会让用户去升级一个并不更新的版本
    expect(isNewer('garbage', '0.2.0')).toBe(false)
    expect(isNewer('0.3.0', 'garbage')).toBe(false)
  })

  it('strips the release tag prefix', () => {
    expect(tagToVersion('cli-v0.2.1')).toBe('0.2.1')
    expect(tagToVersion('v1.0.0')).toBe('1.0.0')
    expect(tagToVersion('0.2.0')).toBe('0.2.0')
  })
})

describe('update-check / cache behaviour', () => {
  let dir: string
  let cacheFile: string
  const originalEnv = process.env.X_HERALD_UPDATE_CACHE

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-uc-'))
    cacheFile = join(dir, 'update-check.json')
    process.env.X_HERALD_UPDATE_CACHE = cacheFile
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.X_HERALD_UPDATE_CACHE
    else process.env.X_HERALD_UPDATE_CACHE = originalEnv
  })

  it('returns the hint from a fresh cache without touching the network', async () => {
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest: '9.9.9' }))

    const info = await checkForUpdate({ current: '0.2.0' })
    expect(info).not.toBeNull()
    expect(info?.latest).toBe('9.9.9')
    // 提示必须可执行：包含升级命令与关闭方式
    expect(info?.hint).toContain('install-cli.sh')
    expect(info?.hint).toContain('X_HERALD_NO_UPDATE_CHECK')
  })

  it('stays silent when the cached version is not newer', async () => {
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest: '0.2.0' }))
    expect(await checkForUpdate({ current: '0.2.0' })).toBeNull()
  })

  it('stays silent when the last check failed (latest: null)', async () => {
    // 离线环境留下的缓存不该让后续命令每次都重试网络
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest: null }))
    expect(await checkForUpdate({ current: '0.2.0' })).toBeNull()
  })

  it('records a failed lookup in the cache instead of retrying every run', async () => {
    // 指向一个必然失败的仓库名，模拟 404 / 无网络
    const info = await checkForUpdate({ current: '0.2.0', repo: 'xartifact/__no_such_repo__' })
    expect(info).toBeNull()

    const cached = JSON.parse(readFileSync(cacheFile, 'utf-8')) as {
      checkedAt: number
      latest: string | null
    }
    expect(typeof cached.checkedAt).toBe('number')
    expect(cached.latest).toBeNull()
  })

  it('reads the hint from cache without any network call', () => {
    // 命令路径专用：这条路径必须能离线工作，因此只读本地文件
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest: '9.9.9' }))
    const info = readCachedUpdate('0.2.0')
    expect(info?.latest).toBe('9.9.9')
    expect(info?.hint).toContain('install-cli.sh')
  })

  it('reports stale cache so the caller can schedule a background refresh', () => {
    expect(isCacheStale()).toBe(true) // 无缓存文件

    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest: '9.9.9' }))
    expect(isCacheStale()).toBe(false)

    // 25 小时前查的：过期
    const stale = Date.now() - 25 * 60 * 60 * 1000
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: stale, latest: '9.9.9' }))
    expect(isCacheStale()).toBe(true)
  })

  it('treats a failed lookup in cache as "nothing to report"', () => {
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest: null }))
    expect(readCachedUpdate('0.2.0')).toBeNull()
  })

  it('resetUpdateCache clears the file so the next check refetches', () => {
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest: '9.9.9' }))
    resetUpdateCache()
    expect(() => readFileSync(cacheFile, 'utf-8')).toThrow()
  })
})

describe('update-check / opt-out', () => {
  const original = process.env.X_HERALD_NO_UPDATE_CHECK

  afterEach(() => {
    if (original === undefined) delete process.env.X_HERALD_NO_UPDATE_CHECK
    else process.env.X_HERALD_NO_UPDATE_CHECK = original
  })

  it('honours the CLI flag', () => {
    delete process.env.X_HERALD_NO_UPDATE_CHECK
    expect(shouldSkipCheck(true)).toBe(true)
    expect(shouldSkipCheck(false)).toBe(false)
  })

  it('honours the environment variable in both accepted spellings', () => {
    for (const value of ['1', 'true']) {
      process.env.X_HERALD_NO_UPDATE_CHECK = value
      expect(shouldSkipCheck()).toBe(true)
    }
    for (const value of ['0', 'false', '']) {
      process.env.X_HERALD_NO_UPDATE_CHECK = value
      expect(shouldSkipCheck()).toBe(false)
    }
  })
})
