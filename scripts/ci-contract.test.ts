import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards for the CI contract documented in `.claude/skills/xartifact-ci/SKILL.md`.
 *
 * The skill tells agents which CI invariants matter; these tests make sure the
 * invariants still exist. Without them the documentation drifts silently — the
 * previous version of the org skill already described an `continue-on-error` E2E
 * step and an unconditional exit-code-99 waiver, neither of which was ever true
 * of this repository.
 *
 * When you change the CI shape, change the skill and these assertions together.
 */

const root = resolve(import.meta.dir, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const ciScript = read('scripts/ci.sh')
const workflow = read('.github/workflows/docker-build.yml')
const dockerfile = read('Dockerfile')
const prePush = read('.vite-hooks/pre-push')
const commitMsg = read('scripts/commit-msg.mjs')
const skill = read('.claude/skills/xartifact-ci/SKILL.md')

describe('ci.sh contract', () => {
  const stages = [...ciScript.matchAll(/^echo "==> (.+)"$/gm)].map((m) => m[1])
  expect(stages).toEqual([
    'format + lint + typecheck',
    'CI script regression tests',
    'CI contract tests (docs, workflow, hooks stay aligned)',
    'UI tests',
    'ai-agent tests',
    'agent-extensions tests',
    'backend tests',
  ])

  it('reads bun status through PIPESTATUS, not tee', () => {
    expect(ciScript).toContain('PIPESTATUS[0]')
  })

  it('waives exit code 99 only when the summary really is 0 fail', () => {
    // An unconditional waiver would let genuine regressions exit 99 and pass.
    expect(ciScript).toMatch(/BACKEND_STATUS.*-eq 99.*&&.*grep -qE.*0 fail/s)
  })

  it('runs backend tests isolated', () => {
    expect(ciScript).toMatch(/bun test --isolate/)
  })

  it('propagates failures from every stage', () => {
    expect(ciScript).toContain('set -euo pipefail')
  })

  it('documents the same number of stages the script actually runs', () => {
    // The skill previously described six stages after the script grew a seventh;
    // keep the prose and the script from drifting apart again.
    const actual = [...ciScript.matchAll(/^echo "==> /gm)].length
    for (const path of [
      '.claude/skills/xartifact-ci/SKILL.md',
      '.agents/skills/xartifact-ci/SKILL.md',
    ]) {
      expect(read(path)).toContain(`${actual} 段串行`)
    }
  })
})

describe('skill copies', () => {
  it('keeps the .claude and .agents copies identical', () => {
    // Two directories exist so different agent runtimes can discover the same
    // guidance; divergent copies silently give one runtime stale rules.
    expect(read('.agents/skills/xartifact-ci/SKILL.md')).toBe(
      read('.claude/skills/xartifact-ci/SKILL.md'),
    )
  })
})

describe('test job contract', () => {
  const testJob = workflow.slice(workflow.indexOf('  test:'), workflow.indexOf('  build:'))

  it('has no continue-on-error step, so failures block publishing', () => {
    expect(testJob).not.toContain('continue-on-error')
  })

  it('runs the shared ci.sh gate rather than an ad-hoc command list', () => {
    expect(testJob).toContain('./scripts/ci.sh')
  })
})

describe('release gate ordering', () => {
  it('build waits for tests, deploy waits for both', () => {
    const buildNeeds = /build:\s*\n\s*needs:\s*(\S+)/.exec(workflow)?.[1]
    expect(testNeedsDeployGuard(buildNeeds)).toBe('test')
    expect(workflow).toMatch(/deploy:\s*\n\s*needs:\s*\[test, build\]/)
  })

  it('notification always runs and never shares the deploy runner', () => {
    const notify = workflow.slice(workflow.indexOf('  notify:'))
    expect(notify).toMatch(/if:\s*always\(\)/)
    // The alert channel must survive the runner it reports on going offline.
    expect(notify).toMatch(/runs-on:\s*ubuntu-latest/)
  })
})

describe('build version chain', () => {
  it('declares every build arg in the Dockerfile', () => {
    const args = [
      .../build-args:\s*\|([\s\S]*?)\n\s+[a-z-]+:/.exec(workflow)![1]!.matchAll(/^\s*([A-Z_]+)=/gm),
    ].map((m) => m[1])
    expect(args.length).toBeGreaterThan(0)
    for (const name of args) expect(dockerfile).toContain(`ARG ${name}=`)
  })

  it('promotes the args to ENV so the running container reports them', () => {
    expect(dockerfile).toMatch(/ENV GIT_COMMIT_HASH=\$\{GIT_COMMIT_HASH\}/)
    expect(dockerfile).toMatch(/ENV BUILD_REF=\$\{BUILD_REF\}/)
    expect(dockerfile).toMatch(/ENV APP_VERSION=\$\{APP_VERSION\}/)
  })

  it('deploy asserts the running container reports this build', () => {
    expect(workflow).toMatch(/commitHash/)
    expect(workflow).toMatch(/buildRef/)
  })
})

describe('hook split', () => {
  it('pre-push runs the quality gate plus a routing subset, not the full suite', () => {
    expect(prePush).toContain('bun run check')
    expect(prePush).toContain('route-rule-compiler')
    expect(prePush).not.toMatch(/bun test --isolate/)
  })

  it('commit-msg enforces the documented types and limits', () => {
    for (const type of ['feat', 'fix', 'docs', 'refactor', 'ci', 'chore', 'revert']) {
      expect(commitMsg).toContain(`'${type}'`)
    }
    expect(commitMsg).toMatch(/SUBJECT_MAX = 72/)
  })
})

describe('skill document', () => {
  it('exists and carries front-matter the agents can discover', () => {
    expect(skill.startsWith('---\nname: xartifact-ci\n')).toBe(true)
    expect(skill).toMatch(/^description: /m)
  })

  it('does not claim the stale behaviour it previously documented', () => {
    // The old org skill said E2E was continue-on-error and 99 was waived
    // unconditionally; both were wrong and are now guarded here.
    expect(skill).not.toMatch(/E2E（continue-on-error）/)
    expect(skill).not.toMatch(/if \[ \$test_status -eq 99 \]; then exit 0/)
  })
})

function testNeedsDeployGuard(needs: string | undefined): string | undefined {
  return needs
}
