/**
 * 请求体大小上限：在解析之前拒绝，而不是读爆内存后抛 500。
 *
 * 为什么需要（GitHub Issue #5 P1-5）：多模态请求会把 base64 视频塞进 JSON，
 * 几十 MB 很常见。此前网关没有任何上限——`c.req.json()` 会把整个 body 读进内存，
 * 超大的请求要么拖慢进程，要么在解析阶段抛出不具名的错误，客户端只看到 500，
 * 无法判断是自己发太大还是网关坏了。
 *
 * 实现用 Hono 内置的 `bodyLimit`：它同时处理 `Content-Length` 预判与 chunked
 * 累计，并且是在 middleware 层拦截，不需要替换 request 对象——自研流包装要改写
 * `c.req.raw`，既脆弱又会和后续读取者打架。
 */
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'

/** 默认上限。纯文本请求远小于此；更大的多模态场景用环境变量调整。 */
const DEFAULT_MAX_MB = 64

export function resolveBodyLimitBytes(): number {
  const raw = process.env.GATEWAY_MAX_REQUEST_BODY_MB
  const mb = raw ? Number(raw) : NaN
  const effective = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_MB
  return Math.floor(effective * 1024 * 1024)
}

function tooLarge(c: Context, limitBytes: number): Response {
  const limitMb = Math.round(limitBytes / (1024 * 1024))
  return c.json(
    {
      error: {
        type: 'invalid_request_error',
        code: 'REQUEST_TOO_LARGE',
        message:
          `Request body exceeds the gateway limit of ${limitMb} MB. ` +
          `Reduce the payload (e.g. downscale or trim the media) or raise ` +
          `GATEWAY_MAX_REQUEST_BODY_MB.`,
      },
    },
    413,
  )
}

/**
 * 全局请求体上限。
 *
 * 只对带 body 的请求有意义；Hono 的 bodyLimit 在 GET/HEAD 上不会触发
 * （没有 body 可读），因此无需额外分流。
 */
export const requestBodyLimit = (): ReturnType<typeof bodyLimit> => {
  const maxSize = resolveBodyLimitBytes()
  return bodyLimit({
    maxSize,
    onError: (c) => tooLarge(c, maxSize),
  })
}
