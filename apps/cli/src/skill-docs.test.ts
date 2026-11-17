import { describe, expect, it } from 'bun:test'

import { SKILL_DOCS } from './embedded-skills'
import { SPEC_COMMANDS } from './spec-commands'

/**
 * 技能文档里写下的每条 `x-herald <group> <name>` 都必须真的存在。
 *
 * 为什么值得一个测试：操作技能是 Agent 唯一的命令来源。文档里一个拼错的子命令不会
 * 在构建期报错，而是在自动化跑到那一步时才失败——那时错误信息指向"命令不存在"，
 * 而不是"文档写错了"，排查成本远高于在这里拦一次。
 *
 * 两类命令都要认：
 *  - 管理 API 命令：登记在 `SPEC_COMMANDS`（每个对应一个 HTTP 端点）。
 *  - 本地命令：`auth login` / `auth whoami` / `ping` / `skill install` 等，
 *    不走管理 API，注册在 `index.ts`，因此显式列在这里。
 */
const LOCAL_COMMANDS = [
  'auth login',
  'auth whoami',
  'auth logout',
  'ping',
  'skill install',
  'skill show',
  'completion',
] as const

function documentedCommands(markdown: string): string[] {
  const found = new Set<string>()
  for (const match of markdown.matchAll(/x-herald (?:--?\S+ )*([a-z][a-z-]*) ([a-z][a-z-]*)/g)) {
    found.add(`${match[1]} ${match[2]}`)
  }
  return [...found]
}

describe('skill docs / command references', () => {
  const known = new Set([
    ...SPEC_COMMANDS.map((spec) => `${spec.group} ${spec.name}`),
    ...LOCAL_COMMANDS,
  ])

  for (const [name, markdown] of Object.entries(SKILL_DOCS)) {
    it(`${name} only references commands that exist`, () => {
      const unknown = documentedCommands(markdown).filter((cmd) => !known.has(cmd))
      expect(unknown).toEqual([])
    })
  }

  it('provider-onboarding documents the full chain for a new upstream', () => {
    const doc = SKILL_DOCS['provider-onboarding.md']
    // 接入链路的五个阶段，缺任何一段都会让 Agent 卡在中间
    for (const required of [
      'providers create',
      'providers models',
      'instances test',
      'rules activate',
      'providers delete',
    ]) {
      expect(doc).toContain(`x-herald ${required}`)
    }
  })

  it('provider-onboarding is discoverable from SKILL.md', () => {
    expect(SKILL_DOCS['SKILL.md']).toContain('provider-onboarding.md')
  })
})
