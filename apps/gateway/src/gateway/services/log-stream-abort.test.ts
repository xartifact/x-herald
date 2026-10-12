import { describe, it, expect, mock } from 'bun:test'

// ─── Mock DB state ──────────────────────────────────────────────────────────
// requestLogs.set(...) 和 requestAttempts.set(...) 各自捕获最后一次写入的 payload，
// 用来断言 markStreamAborted 按 hadPartialData 分支写了正确的 status/errorMessage。

let lastRequestLogsSet: Record<string, unknown> | undefined
let lastRequestAttemptsSet: Record<string, unknown> | undefined

function createMockDb() {
  const requestLogsQuery = {
    set: mock((values: Record<string, unknown>) => {
      lastRequestLogsSet = values
      return { where: mock(() => Promise.resolve([])) }
    }),
  }
  const requestAttemptsQuery = {
    set: mock((values: Record<string, unknown>) => {
      lastRequestAttemptsSet = values
      return { where: mock(() => Promise.resolve([])) }
    }),
  }
  const trx = {
    update: mock((table: unknown) => {
      // requestLogs 和 requestAttempts 是两个不同的表对象引用，靠调用顺序区分：
      // markStreamAborted 里先 update(requestLogs) 再 update(requestAttempts)
      return updateCallCount++ === 0 ? requestLogsQuery : requestAttemptsQuery
    }),
  }
  let updateCallCount = 0
  return {
    transaction: mock(async (fn: (trx: typeof trx) => Promise<void>) => {
      updateCallCount = 0
      await fn(trx)
    }),
  }
}

mock.module('../../db/client', () => ({
  getDatabase: mock(() => createMockDb()),
}))

mock.module('../../lib/logger', () => ({
  default: {
    debug: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    child: mock(() => ({
      debug: mock(() => {}),
      error: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
    })),
  },
}))

const { markStreamAborted } = await import('./log-stream')

describe('markStreamAborted — 客户端主动取消 vs 真正断连的状态分类', () => {
  it('hadPartialData=true（已收到数据后断开）：status 记为 cancelled，不算失败', async () => {
    lastRequestLogsSet = undefined
    lastRequestAttemptsSet = undefined

    await markStreamAborted('log-1', 'attempt-1', true)

    expect(lastRequestLogsSet?.status).toBe('cancelled')
    expect(lastRequestLogsSet?.errorType).toBe('client_disconnect')
    expect(lastRequestLogsSet?.errorMessage).toBe('Client disconnected after receiving data')
    expect(lastRequestAttemptsSet?.status).toBe('cancelled')
  })

  it('hadPartialData=false（一个 chunk 都没收到就断开）：status 保持 failure', async () => {
    lastRequestLogsSet = undefined
    lastRequestAttemptsSet = undefined

    await markStreamAborted('log-2', 'attempt-2', false)

    expect(lastRequestLogsSet?.status).toBe('failure')
    expect(lastRequestLogsSet?.errorType).toBe('client_disconnect')
    expect(lastRequestLogsSet?.errorMessage).toBe('Client disconnected')
    expect(lastRequestAttemptsSet?.status).toBe('failure')
  })

  it('forceCancelled=true（TTFB 阶段客户端取消）：status 记为 cancelled', async () => {
    lastRequestLogsSet = undefined
    lastRequestAttemptsSet = undefined

    await markStreamAborted('log-4', 'attempt-4', false, { forceCancelled: true })

    expect(lastRequestLogsSet?.status).toBe('cancelled')
    expect(lastRequestLogsSet?.errorType).toBe('client_disconnect')
    expect(lastRequestLogsSet?.errorMessage).toBe('Client cancelled request')
    expect(lastRequestAttemptsSet?.status).toBe('cancelled')
  })

  it('forceCancelled=true 但 hadPartialData=true 时仍按取消处理', async () => {
    lastRequestLogsSet = undefined

    await markStreamAborted('log-5', 'attempt-5', true, { forceCancelled: true })

    expect(lastRequestLogsSet?.status).toBe('cancelled')
    expect(lastRequestLogsSet?.errorMessage).toBe('Client cancelled request')
  })

  it('terminalSeen=true（终止事件已见后挂断）：cancelled + 完整送达文案', async () => {
    lastRequestLogsSet = undefined

    await markStreamAborted('log-6', 'attempt-6', true, { terminalSeen: true })

    expect(lastRequestLogsSet?.status).toBe('cancelled')
    expect(lastRequestLogsSet?.errorMessage).toBe('Client disconnected after complete response')
  })

  it('terminalSeen + usage：tokens 随收尾一次性入账', async () => {
    lastRequestLogsSet = undefined

    await markStreamAborted('log-7', 'attempt-7', true, {
      terminalSeen: true,
      usage: { inputTokens: 100, outputTokens: 40 },
    })

    expect(lastRequestLogsSet?.inputTokens).toBe(100)
    expect(lastRequestLogsSet?.outputTokens).toBe(40)
    expect(lastRequestLogsSet?.totalTokens).toBe(140)
  })

  it('abort 收尾修正初始行占位：statusCode 499 + 真实耗时 + streaming 标记', async () => {
    lastRequestLogsSet = undefined
    lastRequestAttemptsSet = undefined

    await markStreamAborted('log-8', 'attempt-8', false, {
      isStreaming: true,
      responseTimeMs: 10226,
    })

    expect(lastRequestLogsSet?.statusCode).toBe(499)
    expect(lastRequestLogsSet?.responseTimeMs).toBe(10226)
    expect(lastRequestLogsSet?.streaming).toBe('true')
    expect(lastRequestAttemptsSet?.statusCode).toBe(499)
    expect(lastRequestAttemptsSet?.durationMs).toBe(10226)
  })

  it('零数据断开（hadPartialData=false）：failure + 断开细分元数据写入', async () => {
    lastRequestLogsSet = undefined

    await markStreamAborted('log-9', 'attempt-9', false, {})

    // metadata 深合并 SQL 始终写入（disconnectKind 按 hadPartialData 三值推导）；
    // 三值文案断言由 errorMessage 分支覆盖，drizzle sql 对象内部不在此重复断言
    expect(lastRequestLogsSet?.metadata).toBeDefined()
    expect(lastRequestLogsSet?.statusCode).toBe(499)
  })

  it('temp- 前缀的 logId 直接跳过，不写库', async () => {
    lastRequestLogsSet = undefined

    await markStreamAborted('temp-123', 'attempt-3', true)

    expect(lastRequestLogsSet).toBeUndefined()
  })
})
