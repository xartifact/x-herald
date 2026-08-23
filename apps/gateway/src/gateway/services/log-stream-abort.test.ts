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

  it('temp- 前缀的 logId 直接跳过，不写库', async () => {
    lastRequestLogsSet = undefined

    await markStreamAborted('temp-123', 'attempt-3', true)

    expect(lastRequestLogsSet).toBeUndefined()
  })
})
