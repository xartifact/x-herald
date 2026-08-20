import { ProviderInvalidResponseError } from '../model-group-router'

/**
 * Embedding 维度保障：当客户端请求携带 OpenAI 兼容的 `dimensions`（matryoshka 截断）
 * 参数时，确保响应中每个 embedding 数组长度恰好等于请求的维度数。
 *
 * - 首选路径：网关透传 `dimensions` 到后端（text-embedding-v4 原生支持 matryoshka，
 *   直接返回截断结果）——见 EmbeddingCandidateExecutor.prepareRequest。
 * - 兜底路径：后端忽略/不支持 `dimensions` 时，此处对返回向量做 matryoshka 截断
 *   （保留前缀，仅当返回维度 > 目标维度时）。若返冑维度不足，无法无损升维，
 *   显式报错而非零填充——零填充会引入大量零维噪声、浪费索引空间且检索质量差
 *   （需求文档明确反对 padding），且会让向量库写入静默劣质数据。
 *
 * 纯函数：不做原地修改，返回新 body 或 undefined（无变更）；维度不足时抛错。
 */

type EmbeddingDataItem = {
  embedding?: unknown
  [key: string]: unknown
}

function isNumericArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
}

/** 将请求中 `dimensions` 参数规范化为正整数；非正整数/缺失返回 undefined */
export function normalizeRequestedDimensions(body: unknown): number | undefined {
  if (!body || typeof body !== 'object') return undefined
  const raw = (body as Record<string, unknown>)['dimensions']
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    const n = Number(raw)
    return Number.isInteger(n) && n > 0 ? n : undefined
  }
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw
  return undefined
}

/**
 * 若响应含 embedding 数据且请求声明了 dimensions，则把每个向量对齐到目标维度。
 * 返回新 body（原对象不变）；无需调整时返回 undefined。
 *
 * 抛错：后端返回的向量维度不足目标维度时抛 ProviderInvalidResponseError
 * （matryoshka 只能从高维截断，无法无损升维；零填充会静默写入劣质向量）。
 * 注意：抛错发生在解析完成之后，会走 handleGatewayError → 502 返回给客户端。
 */
export function enforceEmbeddingDimensions(
  responseBody: Record<string, unknown>,
  requestBody: unknown,
): Record<string, unknown> | undefined {
  const target = normalizeRequestedDimensions(requestBody)
  if (target === undefined) return undefined

  const rawData = responseBody['data']
  if (!Array.isArray(rawData)) return undefined

  const data = rawData as EmbeddingDataItem[]
  let changed = false
  const aligned: EmbeddingDataItem[] = data.map((item) => {
    const vector = item.embedding
    if (!isNumericArray(vector)) return item
    if (vector.length === target) return item
    if (vector.length > target) {
      // matryoshka 截断：保留前缀 target 维
      changed = true
      return { ...item, embedding: vector.slice(0, target) }
    }
    // 维度不足：显式报错而非零填充（零维噪声会劣化检索质量且静默写入坏数据）
    throw new ProviderInvalidResponseError(
      (responseBody['model'] as string) || 'unknown',
      200,
      `Provider returned ${vector.length}-dimensional embedding but client requested ${target} dimensions; matryoshka truncation cannot upscale. Configure the model to output at least ${target} dimensions or drop the 'dimensions' parameter`,
    )
  })

  if (!changed) return undefined
  return { ...responseBody, data: aligned }
}
