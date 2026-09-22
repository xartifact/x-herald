import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')

describe('CI failure propagation', () => {
  const command = `
    bun() {
      local stage
      case "$*" in
        'run check') stage=check ;;
        'test scripts/ci.test.ts') stage=scripts ;;
        'run test:ui') stage=ui ;;
        *) case "$PWD" in
          */apps/gateway) stage=backend ;;
          */packages/agent-extensions) stage=extensions ;;
          *) return 90 ;;
        esac ;;
      esac
      echo "executed:$stage"
      if [ "$stage" = "$FAIL_STAGE" ]; then return "$FAIL_CODE"; fi
      return 0
    }
    export -f bun
    bash scripts/ci.sh
  `

  function run(stage: string, code = 1) {
    return spawnSync('/bin/bash', ['-c', command], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, FAIL_STAGE: stage, FAIL_CODE: String(code) },
    })
  }

  it('succeeds when every gate succeeds', () => {
    const result = run('none')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('executed:backend')
  })

  for (const stage of ['check', 'scripts', 'ui', 'extensions', 'backend']) {
    it(`fails when ${stage} fails`, () => {
      const result = run(stage)
      expect(result.status).toBe(1)
      expect(result.stdout.trim().endsWith(`executed:${stage}`)).toBe(true)
    })
  }

  it('does not silently accept backend exit code 99', () => {
    expect(run('backend', 99).status).toBe(99)
  })

  it('propagates a workspace typecheck failure', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const result = spawnSync(
      '/bin/bash',
      ['-c', `bun() { return 17; }; ${pkg.scripts.typecheck}`],
      {
        cwd: root,
        encoding: 'utf8',
      },
    )
    expect(result.status).toBe(17)
  })
})

describe('release gates', () => {
  const workflow = Bun.YAML.parse(
    readFileSync(resolve(root, '.github/workflows/docker-build.yml'), 'utf8'),
  ) as {
    jobs: Record<string, { needs?: string | string[]; steps?: Record<string, unknown>[] }>
  }

  it('requires successful tests before publishing and deploying', () => {
    expect([workflow.jobs.build.needs].flat()).toContain('test')
    expect([workflow.jobs.deploy.needs].flat()).toContain('test')
    expect([workflow.jobs.deploy.needs].flat()).toContain('build')
  })

  it('does not allow failed test steps to pass', () => {
    for (const step of workflow.jobs.test.steps ?? []) {
      expect(step['continue-on-error']).not.toBe(true)
    }
  })
})

describe('build version wiring', () => {
  const workflowSource = readFileSync(resolve(root, '.github/workflows/docker-build.yml'), 'utf8')
  const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8')

  /**
   * The version shown in the admin UI comes from build args that must survive a
   * three-hop chain: workflow `build-args` → Dockerfile `ARG` → runtime `ENV`.
   * Each hop previously used a different name (`GIT_HASH` vs `GIT_COMMIT_HASH`),
   * so every value silently took its default and production reported
   * `dev` / `unknown` for months with nothing failing.
   * @returns the variable names each hop names.
   */
  function buildArgNames(): string[] {
    const block = /build-args:\s*\|([\s\S]*?)\n\s*[a-z-]+:/.exec(workflowSource)?.[1] ?? ''
    return [...block.matchAll(/^\s*([A-Z_]+)=/gm)].map((m) => m[1]!)
  }

  it('passes version build args that the Dockerfile actually declares', () => {
    const passed = buildArgNames()
    expect(passed.length).toBeGreaterThan(0)
    for (const name of passed) {
      // An ARG the Dockerfile never declares is silently ignored by BuildKit —
      // exactly the failure mode this guard exists to catch.
      expect(dockerfile).toContain(`ARG ${name}=`)
    }
  })

  it('passes both version values the app reports', () => {
    const passed = buildArgNames()
    expect(passed).toContain('GIT_COMMIT_HASH')
    expect(passed).toContain('APP_VERSION')
  })

  it('promotes the version args to ENV so the runtime sees them', () => {
    // ARG alone is build-time only; /api/health reads process.env at runtime.
    expect(dockerfile).toMatch(/ENV GIT_COMMIT_HASH=\$\{GIT_COMMIT_HASH\}/)
    expect(dockerfile).toMatch(/ENV APP_VERSION=\$\{APP_VERSION\}/)
  })

  it('declares the version args in a stage both builder and runner inherit', () => {
    const baseLine = dockerfile.indexOf('FROM oven/bun:1 AS base')
    const builderLine = dockerfile.indexOf('FROM base AS builder')
    expect(baseLine).toBeGreaterThanOrEqual(0)
    expect(builderLine).toBeGreaterThan(baseLine)
    // Declaring them in `builder` only would leave the running container without
    // them — the gateway serves traffic from `runner`.
    const argIndex = dockerfile.indexOf('ARG GIT_COMMIT_HASH=')
    expect(argIndex).toBeGreaterThan(baseLine)
    expect(argIndex).toBeLessThan(builderLine)
  })

  it('does not let compose override the baked version with a default', () => {
    // A runtime `${GIT_COMMIT_HASH:-unknown}` would clobber the correct value the
    // image carries, so compose must leave both variables to the image. Parsed
    // rather than regex-matched: a plain text scan also hits the comment that
    // documents this rule.
    const compose = Bun.YAML.parse(readFileSync(resolve(root, 'docker-compose.yml'), 'utf8')) as {
      services: Record<string, { environment?: Record<string, unknown> }>
    }
    const environment = compose.services['x-herald']?.environment ?? {}
    expect(Object.keys(environment)).not.toContain('GIT_COMMIT_HASH')
    expect(Object.keys(environment)).not.toContain('APP_VERSION')
  })
})

describe('backend test isolation', () => {
  const gatewayPkg = JSON.parse(
    readFileSync(resolve(root, 'apps/gateway/package.json'), 'utf8'),
  ) as { scripts: Record<string, string> }
  const ciScript = readFileSync(resolve(root, 'scripts/ci.sh'), 'utf8')

  /**
   * `mock.module()` registers in the process-global module registry and is
   * *sticky*: only the first registration for a specifier wins, so neither
   * `mock.restore()` nor re-registering the real module removes it. Any file
   * that replaces `db/client` with a partial fake therefore poisons every later
   * file in the same worker — the "db.insert is not a function" cascade.
   *
   * Each test file gets its own globals under `--isolate`, which is what makes
   * the suite order-independent. File order differs between the Linux runner and
   * macOS, so without it the failure only appears in CI.
   */
  it('runs backend tests isolated, so mock.module cannot leak across files', () => {
    expect(gatewayPkg.scripts.test).toContain('--isolate')
    expect(ciScript).toMatch(/bun test --isolate/)
  })
})
