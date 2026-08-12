import { describe, it, expect } from 'vitest'
import { TargetNodeDataSchema } from '@xartifact/x-herald-shared'

import { ACTION_TYPES, targetUiSchema } from './targetSchema'

/**
 * 回归测试：ActionTypeSchema 枚举顺序必须与 UI 下拉的 enumNames 顺序一致。
 *
 * 背景：RJSF 用 schema.enum[i] 配 ui:options.enumNames[i] 生成下拉项。
 * 顺序错位会导致"用户看到 A 标签，实际存进去 B 值"的 bug。
 *
 * 历史事件：曾出现 schema 顺序为 ['virtual_model','group','instance','access_model']
 * 但 UI 顺序为 ['group','instance','access_model','virtual_model']，
 * 导致用户点"路由到模型组"存进去的是 deprecated 的 route_to_virtual_model。
 */
describe('targetSchema — actionType 标签↔值对齐', () => {
  function getSchemaEnum(): string[] {
    const at = TargetNodeDataSchema.shape.actionType as unknown as {
      def: { innerType: { def: { entries: Record<string, string> } } }
    }
    return Object.values(at.def.innerType.def.entries)
  }

  it('Zod 枚举顺序与 ACTION_TYPES 顺序一一对应', () => {
    const schemaEnum = getSchemaEnum()
    expect(schemaEnum.length).toBe(ACTION_TYPES.length)

    const actualLabels = (targetUiSchema.actionType as { 'ui:options': { enumNames: string[] } })[
      'ui:options'
    ].enumNames
    expect(actualLabels).toEqual(ACTION_TYPES.map((a) => a.label))

    for (let i = 0; i < ACTION_TYPES.length; i++) {
      expect(schemaEnum[i]).toBe(ACTION_TYPES[i].value)
    }
  })

  it('所有 ACTION_TYPES 的 value 都在 Zod enum 中', () => {
    const schemaEnum = getSchemaEnum()
    for (const { value, label } of ACTION_TYPES) {
      expect(schemaEnum).toContain(value)
      expect(label).toBeTruthy()
    }
  })

  it('remoteSourceMap 为每个 actionType 指向正确的远端数据源', () => {
    const targetIdOpts = (
      targetUiSchema.targetId as { 'ui:options': { remoteSourceMap: Record<string, string> } }
    )['ui:options']

    expect(targetIdOpts.remoteSourceMap).toEqual({
      route_to_group: 'model-groups',
      route_to_instance: 'model-instances',
      route_to_access_model: 'access-models',
      // route_to_virtual_model 是 route_to_access_model 的旧名，等价映射
      route_to_virtual_model: 'access-models',
    })
  })
})
