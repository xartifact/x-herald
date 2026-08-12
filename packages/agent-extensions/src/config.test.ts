import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveEnvRef, resolveProviderConfig } from './config'
import { DEFAULT_BASE_URL, PROVIDER_ID } from './types'

const ENV_KEYS = [
  'X_LLM_GATEWAY_CONFIG_DIR',
  'X_LLM_GATEWAY_BASE_URL',
  'X_LLM_GATEWAY_API_KEY',
] as const

let dir: string
let prev: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xgate-config-'))
  prev = {}
  for (const key of ENV_KEYS) {
    prev[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = prev[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await rm(dir, { recursive: true, force: true })
})

describe('resolveEnvRef', () => {
  it('returns undefined for empty input', () => {
    expect(resolveEnvRef(undefined)).toBeUndefined()
  })

  it('returns literal values unchanged', () => {
    expect(resolveEnvRef('sk-literal')).toBe('sk-literal')
  })

  it('resolves $ENV_VAR and ${ENV_VAR} references', () => {
    process.env.XGATE_TEST_KEY = 'sk-resolved'
    try {
      expect(resolveEnvRef('$XGATE_TEST_KEY')).toBe('sk-resolved')
      expect(resolveEnvRef('${XGATE_TEST_KEY}')).toBe('sk-resolved')
    } finally {
      delete process.env.XGATE_TEST_KEY
    }
  })

  it('resolves to undefined when the referenced var is unset', () => {
    expect(resolveEnvRef('$XGATE_UNSET_VAR')).toBeUndefined()
  })
})

describe('resolveProviderConfig', () => {
  it('defaults baseUrl and api when nothing is configured', async () => {
    process.env.X_LLM_GATEWAY_CONFIG_DIR = dir
    const cfg = await resolveProviderConfig()
    expect(cfg.runtime).toBe('pi')
    expect(cfg.baseUrl).toBe(DEFAULT_BASE_URL)
    expect(cfg.api).toBe('openai-completions')
    expect(cfg.apiKey).toBeUndefined()
  })

  it('reads baseUrl/apiKey from models.json (pi)', async () => {
    await writeFile(
      join(dir, 'models.json'),
      JSON.stringify({
        providers: { [PROVIDER_ID]: { baseUrl: 'http://gw:9000/api/v1', apiKey: 'sk-json' } },
      }),
    )
    process.env.X_LLM_GATEWAY_CONFIG_DIR = dir
    const cfg = await resolveProviderConfig()
    expect(cfg.baseUrl).toBe('http://gw:9000/api/v1')
    expect(cfg.apiKey).toBe('sk-json')
  })

  it('resolves $ENV_VAR references inside models.json values', async () => {
    process.env.XGATE_JSON_KEY = 'sk-from-env'
    try {
      await writeFile(
        join(dir, 'models.json'),
        JSON.stringify({ providers: { [PROVIDER_ID]: { apiKey: '${XGATE_JSON_KEY}' } } }),
      )
      process.env.X_LLM_GATEWAY_CONFIG_DIR = dir
      expect((await resolveProviderConfig()).apiKey).toBe('sk-from-env')
    } finally {
      delete process.env.XGATE_JSON_KEY
    }
  })

  it('reads models.yml (omp) and detects the omp runtime', async () => {
    const ompDir = join(dir, '.omp')
    await mkdir(ompDir)
    await writeFile(
      join(ompDir, 'models.yml'),
      `providers:\n  ${PROVIDER_ID}:\n    baseUrl: http://omp-gw/api/v1\n    apiKey: sk-yml\n`,
    )
    process.env.X_LLM_GATEWAY_CONFIG_DIR = ompDir
    const cfg = await resolveProviderConfig()
    expect(cfg.runtime).toBe('omp')
    expect(cfg.baseUrl).toBe('http://omp-gw/api/v1')
    expect(cfg.apiKey).toBe('sk-yml')
  })

  it('prefers models.json apiKey over auth.json key over env var', async () => {
    await writeFile(
      join(dir, 'models.json'),
      JSON.stringify({ providers: { [PROVIDER_ID]: { apiKey: 'sk-models' } } }),
    )
    await writeFile(join(dir, 'auth.json'), JSON.stringify({ [PROVIDER_ID]: { key: 'sk-auth' } }))
    process.env.X_LLM_GATEWAY_API_KEY = 'sk-env'
    process.env.X_LLM_GATEWAY_CONFIG_DIR = dir
    expect((await resolveProviderConfig()).apiKey).toBe('sk-models')
  })

  it('falls back to the auth.json key when models.json has no apiKey', async () => {
    await writeFile(
      join(dir, 'models.json'),
      JSON.stringify({ providers: { [PROVIDER_ID]: { baseUrl: 'http://x/api/v1' } } }),
    )
    await writeFile(join(dir, 'auth.json'), JSON.stringify({ [PROVIDER_ID]: { key: 'sk-auth' } }))
    process.env.X_LLM_GATEWAY_CONFIG_DIR = dir
    expect((await resolveProviderConfig()).apiKey).toBe('sk-auth')
  })

  it('falls back to $X_LLM_GATEWAY_API_KEY when no file provides a key', async () => {
    process.env.X_LLM_GATEWAY_API_KEY = 'sk-env'
    process.env.X_LLM_GATEWAY_CONFIG_DIR = dir
    expect((await resolveProviderConfig()).apiKey).toBe('sk-env')
  })

  it('env baseUrl overrides the default but not models.json', async () => {
    process.env.X_LLM_GATEWAY_BASE_URL = 'http://env-gw/api/v1'
    process.env.X_LLM_GATEWAY_CONFIG_DIR = dir
    expect((await resolveProviderConfig()).baseUrl).toBe('http://env-gw/api/v1')

    await writeFile(
      join(dir, 'models.json'),
      JSON.stringify({ providers: { [PROVIDER_ID]: { baseUrl: 'http://file-gw/api/v1' } } }),
    )
    expect((await resolveProviderConfig()).baseUrl).toBe('http://file-gw/api/v1')
  })

  it('swallows malformed files and falls back to defaults', async () => {
    await writeFile(join(dir, 'models.json'), '{ not json')
    await writeFile(join(dir, 'auth.json'), 'nope')
    process.env.X_LLM_GATEWAY_CONFIG_DIR = dir
    const cfg = await resolveProviderConfig()
    expect(cfg.baseUrl).toBe(DEFAULT_BASE_URL)
    expect(cfg.apiKey).toBeUndefined()
  })
})
