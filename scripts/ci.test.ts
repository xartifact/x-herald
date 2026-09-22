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
