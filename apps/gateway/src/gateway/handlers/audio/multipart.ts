/**
 * multipart/form-data 的最小必要处理：读取字段值 + 只改写指定字段。
 *
 * 为什么不能 `request.formData()` 再重建 FormData：
 *  - 解析会把整个音频文件放进内存并重新序列化，boundary 与字节布局都变了；
 *  - 重建后丢失客户端原始 part 顺序与未知 part，上游据此判定的行为随之改变。
 * 因此这里按字节切分 part，只替换目标字段那段值，其余切片原样拼接。
 *
 * 内存上界由调用方强制（`MAX_AUDIO_BODY_BYTES`）：先看 content-length，缺失时读完再判。
 * 比流式改写多用一份请求体大小的内存，换来正确的 content-length 与逐字节保真的 part
 * 内容——WSGI 系上游（whisper-server 等）普遍拒收 chunked multipart。
 */

/** 单个上传请求的 body 上限（25 MB，与 OpenAI 音频端点建议值一致） */
export const MAX_AUDIO_BODY_BYTES = 25 * 1024 * 1024

export interface MultipartPartInfo {
  /** 表单字段名；header 缺失时为空串 */
  name: string
  /** 文件名（仅文件 part） */
  filename?: string
  /** part 的 content-type */
  contentType?: string
  /** 值字节数 */
  size: number
}

export interface MultipartScanResult {
  /** 改写后的完整 body；未请求改写时等于入参 */
  body: Uint8Array
  parts: MultipartPartInfo[]
  /** 非文件 part 的文本值（UTF-8） */
  fields: Record<string, string>
  /** 目标字段是否被找到并改写 */
  found: boolean
  /** 是否命中文件 part */
  hasFile: boolean
}

export interface MultipartParseError {
  error: string
}

/** 从 content-type 头取出 multipart boundary；非 multipart 返回 null */
export function parseBoundary(contentType: string | undefined | null): string | null {
  if (!contentType) return null
  if (!contentType.toLowerCase().includes('multipart/form-data')) return null
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  const boundary = match?.[1] ?? match?.[2]?.trim()
  return boundary && boundary.length > 0 ? boundary : null
}

/**
 * latin1 往返：每个 char code 就是原字节值，因此按字符下标做的切片
 * 与字节下标一一对应，二进制 part 不会被 UTF-8 解码破坏。
 */
function bytesToLatin1(bytes: Uint8Array): string {
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return out
}

function latin1ToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  return out
}

function latin1ToUtf8(text: string): string {
  return new TextDecoder().decode(latin1ToBytes(text))
}

function headerValue(headers: string, key: string): string | undefined {
  const m = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'im').exec(headers)
  return m?.[1]?.trim()
}

function dispositionName(headers: string): { name: string; filename?: string } {
  const disposition = headerValue(headers, 'content-disposition') ?? ''
  const name = /\bname="([^"]*)"/i.exec(disposition)?.[1] ?? ''
  const filename = /\bfilename="([^"]*)"/i.exec(disposition)?.[1]
  return { name, filename }
}

interface FieldEdit {
  field: string
  value: string
}

/**
 * 单次扫描 multipart：收集 part 结构与非文件字段值，可选地把一个字段值替换掉。
 *
 * 找不到目标字段不是错误（`found: false`），调用方据此决定是否把请求交给上游——
 * 缺字段的错误语义属于上游，网关不替它编造。
 */
function scanMultipart(
  body: Uint8Array,
  boundary: string,
  edit?: FieldEdit,
): MultipartScanResult | MultipartParseError {
  const text = bytesToLatin1(body)
  const sep = `--${boundary}`

  // 首个 marker 可能紧贴 body 开头，也可能前面有 preamble（RFC 2046 允许）
  const leadingCrlf = text.startsWith(sep) ? -1 : text.indexOf(`\r\n${sep}`)
  const firstMarker = leadingCrlf === -1 && text.startsWith(sep) ? 0 : leadingCrlf + 2
  if (firstMarker < 0 || !text.startsWith(sep, firstMarker)) {
    return { error: 'Malformed multipart body: boundary not found' }
  }

  const parts: MultipartPartInfo[] = []
  const fields: Record<string, string> = {}
  const chunks: string[] = [text.slice(0, firstMarker)] // preamble 原样保留
  let marker = firstMarker
  let found = false
  let hasFile = false

  while (true) {
    const afterSep = marker + sep.length
    if (text.startsWith('--', afterSep)) {
      // 结束标记：剩余字节（结束标记 + epilogue）一次收尾
      chunks.push(text.slice(marker))
      break
    }
    if (!text.startsWith('\r\n', afterSep)) {
      return { error: 'Malformed multipart body: missing line break after boundary' }
    }

    const headersStart = afterSep + 2
    const headersEnd = text.indexOf('\r\n\r\n', headersStart)
    if (headersEnd === -1) return { error: 'Malformed multipart body: part headers unterminated' }

    const headers = text.slice(headersStart, headersEnd)
    const valueStart = headersEnd + 4
    // 下一个 marker 自带前置 CRLF；该 CRLF 属于分隔符而非值
    const nextSepIdx = text.indexOf(`\r\n${sep}`, valueStart)
    if (nextSepIdx === -1) return { error: 'Malformed multipart body: part value unterminated' }

    const { name, filename } = dispositionName(headers)
    const contentType = headerValue(headers, 'content-type')
    const isFile = filename !== undefined
    if (isFile) hasFile = true
    parts.push({
      name,
      ...(isFile && { filename }),
      ...(contentType !== undefined && { contentType }),
      size: nextSepIdx - valueStart,
    })

    // 本轮原样输出：marker + part headers + 引导空行
    chunks.push(text.slice(marker, valueStart))
    const shouldEdit = edit !== undefined && !isFile && name === edit.field && !found
    if (shouldEdit) {
      chunks.push(edit.value)
      fields[name] = edit.value
      found = true
    } else {
      const rawValue = text.slice(valueStart, nextSepIdx)
      chunks.push(rawValue)
      if (!isFile && name) fields[name] = latin1ToUtf8(rawValue)
    }
    // 值结束处的 CRLF 属于分隔符，必须在 marker 之前补出；
    // 漏掉它会把下一个 boundary 粘到值末尾（上游按 part 边界解析会吃到脏字节）
    chunks.push('\r\n')
    marker = nextSepIdx + 2 // 跳过已补出的 CRLF，落在 "--boundary" 上
  }

  return { body: latin1ToBytes(chunks.join('')), parts, fields, found, hasFile }
}

/** 读取 part 结构与表单字段值（不修改 body） */
export function inspectMultipart(
  body: Uint8Array,
  boundary: string,
): MultipartScanResult | MultipartParseError {
  return scanMultipart(body, boundary)
}

/** 改写 multipart 中某个文本字段的值，其余字节原样保留 */
export function rewriteMultipartField(
  body: Uint8Array,
  boundary: string,
  field: string,
  value: string,
): MultipartScanResult | MultipartParseError {
  return scanMultipart(body, boundary, { field, value })
}

/** 读取请求 body，超过上限时返回 null（调用方回 413，不把超限请求读进内存） */
export async function readBodyWithLimit(
  request: Request,
  limit: number = MAX_AUDIO_BODY_BYTES,
): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > limit) return null
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > limit) return null
  return bytes
}
