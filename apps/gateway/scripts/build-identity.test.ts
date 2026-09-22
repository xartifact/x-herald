import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..', '..', '..')
const workflowSource = readFileSync(resolve(root, '.github/workflows/docker-build.yml'), 'utf8')
const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8')

/** Every identity value passed from GitHub Actions to the Docker build. */
function buildArgNames(): string[] {
  const block = /build-args:\s*\|([\s\S]*?)\n\s*[a-z-]+:/.exec(workflowSource)?.[1] ?? ''
  return [...block.matchAll(/^\s*([A-Z_]+)=/gm)].map((match) => match[1]!)
}

describe('build identity wiring', () => {
  it('passes build args that the Dockerfile declares', () => {
    const passed = buildArgNames()
    expect(passed.length).toBeGreaterThan(0)
    for (const name of passed) {
      // BuildKit silently ignores an undeclared build arg, which would make a
      // deployed image report a fallback identity while the build still passes.
      expect(dockerfile).toContain(`ARG ${name}=`)
    }
  })

  it('passes version, commit, and source ref through the build', () => {
    expect(buildArgNames()).toEqual(
      expect.arrayContaining(['APP_VERSION', 'GIT_COMMIT_HASH', 'BUILD_REF']),
    )
  })

  it('promotes every identity arg to runtime ENV', () => {
    // ARG is build-only; /api/health reads process.env from the running image.
    for (const name of buildArgNames()) {
      expect(dockerfile).toContain(`ENV ${name}=\${${name}}`)
    }
  })

  it('declares identity args in the base stage inherited by builder and runner', () => {
    const baseLine = dockerfile.indexOf('FROM oven/bun:1 AS base')
    const builderLine = dockerfile.indexOf('FROM base AS builder')
    expect(baseLine).toBeGreaterThanOrEqual(0)
    expect(builderLine).toBeGreaterThan(baseLine)
    for (const name of buildArgNames()) {
      const argIndex = dockerfile.indexOf(`ARG ${name}=`)
      expect(argIndex).toBeGreaterThan(baseLine)
      expect(argIndex).toBeLessThan(builderLine)
    }
  })

  it('does not let compose override baked identity values with defaults', () => {
    const compose = Bun.YAML.parse(readFileSync(resolve(root, 'docker-compose.yml'), 'utf8')) as {
      services: Record<string, { environment?: Record<string, unknown> }>
    }
    const environment = compose.services['x-herald']?.environment ?? {}
    for (const name of buildArgNames()) {
      expect(Object.keys(environment)).not.toContain(name)
    }
  })

  it('verifies both deployed commit and build ref after health succeeds', () => {
    expect(workflowSource).toContain('EXPECTED_HASH="${GITHUB_SHA::7}"')
    expect(workflowSource).toContain('EXPECTED_REF="${GITHUB_REF_NAME}"')
    expect(workflowSource).toContain('.commitHash // ""')
    expect(workflowSource).toContain('.buildRef // ""')
  })
})
