/**
 * 音频端点的统一错误响应：OpenAI 错误结构 + 显式状态码。
 *
 * 抽出来共用是因为两个端点（转录 / 合成）在参数校验阶段就已经各返回 5–6 处错误，
 * 各自复制一份结构会在后续加字段时漂移。
 */
export function openAIError(type: string, message: string, status: number): Response {
  return Response.json({ error: { type, message } }, { status })
}
