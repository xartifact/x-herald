/**
 * 契约同步测试：扩展消费类型 ↔ shared ModelSchema ↔ canonical JSON schema。
 *
 * 三处是同一 v1 /models 契约的不同投影：
 *   - packages/agent-extensions/src/types.ts（扩展消费端，宽松）
 *   - packages/shared/src/types/model-schema.ts（网关侧发射类型，严格）
 *   - packages/agent-extensions/schemas/v1-models.schema.json（canonical，闭合集）
 *
 * 任何一处漂移都会在这里编译期或运行期失败。
 */
import { describe, expect, it } from 'bun:test'
import type { ModelSchema } from '@xartifact/x-llm-gateway-shared'

import { REQUIRED_CAPS, REQUIRED_MODEL } from './diagnose'
import type { GatewayModelEntry } from './types'
import schema from '../schemas/v1-models.schema.json'

// ── 编译期：shared ModelSchema 的标量字段必须能被扩展消费类型读取 ──────────────
// （capabilities/cost 等嵌套对象因 index signature 差异不做整型断言，由运行期键集校验兜底）

type Extends<A, B> = A extends B ? true : false

const _id: Extends<ModelSchema['id'], GatewayModelEntry['id']> = true
const _name: Extends<ModelSchema['name'], GatewayModelEntry['name']> = true
const _ctxWindow: Extends<ModelSchema['context_window'], GatewayModelEntry['context_window']> = true
const _maxOutputTokens: Extends<
  ModelSchema['max_output_tokens'],
  GatewayModelEntry['max_output_tokens']
> = true
const _contextLength: Extends<ModelSchema['context_length'], GatewayModelEntry['context_length']> =
  true
const _contextWindow: Extends<ModelSchema['contextWindow'], GatewayModelEntry['contextWindow']> =
  true
const _maxTokens: Extends<ModelSchema['maxTokens'], GatewayModelEntry['maxTokens']> = true
const _reasoning: Extends<ModelSchema['reasoning'], GatewayModelEntry['reasoning']> = true
const _maxTokensField: Extends<ModelSchema['maxTokensField'], GatewayModelEntry['maxTokensField']> =
  true
const _headers: Extends<ModelSchema['headers'], GatewayModelEntry['headers']> = true
const _thinking: Extends<
  ModelSchema['thinking_level_map'],
  GatewayModelEntry['thinking_level_map']
> = true

describe('v1 models contract sync (extension ↔ shared ↔ JSON schema)', () => {
  it('extension REQUIRED_MODEL matches the JSON schema Model.required exactly', () => {
    const modelDef = schema.$defs.Model
    expect(modelDef.required).toEqual([...REQUIRED_MODEL])
  })

  it('extension REQUIRED_CAPS matches the JSON schema Capabilities.required exactly', () => {
    const capsDef = schema.$defs.Capabilities
    expect(capsDef.required).toEqual([...REQUIRED_CAPS])
  })

  it('every shared ModelSchema field is enumerated in the JSON schema (closed set)', () => {
    // 镜像 packages/shared/src/types/model-schema.ts 的 ModelSchema 全部字段。
    // schema 为闭合集（additionalProperties: false）——缺一个字段，网关合法发射就会被拒。
    const SHARED_MODEL_KEYS = [
      'id',
      'name',
      'object',
      'owned_by',
      'created',
      'context_length',
      'context_window',
      'max_output_tokens',
      'capabilities',
      'cost',
      'headers',
      'thinking_level_map',
      'compat',
      'contextWindow',
      'maxTokens',
      'reasoning',
      'input',
      'maxTokensField',
      'mediaInput',
    ] as const
    const props = schema.$defs.Model.properties
    for (const key of SHARED_MODEL_KEYS) {
      expect(props[key], `schema missing shared field: ${key}`).toBeDefined()
    }
  })

  it('extension required subset is covered by shared ModelSchema required fields', () => {
    // ModelSchema 必填：id, object, owned_by, context_window, max_output_tokens, capabilities。
    // 扩展（消费端）只强求子集 REQUIRED_MODEL，必须 ⊆ shared 必填集。
    const SHARED_REQUIRED = [
      'id',
      'object',
      'owned_by',
      'context_window',
      'max_output_tokens',
      'capabilities',
    ] as const
    for (const key of REQUIRED_MODEL) {
      expect(SHARED_REQUIRED).toContain(key)
    }
  })
})
