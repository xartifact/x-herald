import { describe, expect, it } from 'bun:test'

import { diagnoseEntries } from './diagnose'
import type { GatewayModelEntry } from './types'

const good: GatewayModelEntry = {
  id: 'm1',
  context_window: 8192,
  max_output_tokens: 4096,
  capabilities: { vision: true, reasoning: false },
}

// 测试注入扩展字段（诊断要识别为 drift），交叉类型保持受检扩展而非断言形状。
type LooseEntry = GatewayModelEntry & Record<string, unknown>

describe('diagnoseEntries', () => {
  it('reports 0/0 for an empty catalogue', () => {
    const r = diagnoseEntries([], 'http://gw')
    expect(r.total).toBe(0)
    expect(r.pass).toBe(0)
    expect(r.fail).toBe(0)
    expect(r.lines.join('\n')).toContain('0/0 pass')
  })

  it('passes a well-formed entry', () => {
    const r = diagnoseEntries([good], 'http://gw')
    expect(r.total).toBe(1)
    expect(r.pass).toBe(1)
    expect(r.fail).toBe(0)
    expect(r.lines.join('\n')).toContain('1/1 pass')
  })

  it('fails entries missing required model fields', () => {
    const { id: _drop, ...missingId } = good
    const r = diagnoseEntries([missingId] as GatewayModelEntry[], 'http://gw')
    expect(r.fail).toBe(1)
    expect(r.lines.join('\n')).toContain('missing: id')
  })

  it('fails entries missing required capability flags', () => {
    const r = diagnoseEntries(
      [{ ...good, capabilities: { vision: true } }] as GatewayModelEntry[],
      'http://gw',
    )
    expect(r.fail).toBe(1)
    expect(r.lines.join('\n')).toContain('caps missing: reasoning')
  })

  it('flags unknown extra fields as drift without failing the entry', () => {
    const r = diagnoseEntries([{ ...good, unknownField: 1 } as LooseEntry], 'http://gw')
    expect(r.pass).toBe(1)
    expect(r.lines.join('\n')).toContain('extra fields: unknownField')
  })

  it('annotates max_output_tokens=0 as unlimited', () => {
    const r = diagnoseEntries([{ ...good, max_output_tokens: 0 }], 'http://gw')
    expect(r.lines.join('\n')).toContain('max_output_tokens=0 → unlimited')
  })

  it('treats mediaInput as a known field (not drift)', () => {
    const r = diagnoseEntries(
      [{ ...good, mediaInput: { image: { maxWidth: 4096 } } } as LooseEntry],
      'http://gw',
    )
    expect(r.lines.join('\n')).not.toContain('extra fields')
  })
})
