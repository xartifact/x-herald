import { describe, it, expect, spyOn } from 'bun:test'

import * as logService from './log-service'
import { handleGatewayError } from './error-handler'
import { NoAvailableInstanceError } from './model-group-router'
import { createTestVirtualKey } from '../../test/factories'

describe('handleGatewayError 503 分支', () => {
  it('写入 clientType 与 originalModelName（与正常请求日志对齐）', async () => {
    const logRequestSpy = spyOn(logService, 'logRequest').mockImplementation(() =>
      Promise.resolve(),
    )
    try {
      const err = new NoAvailableInstanceError('gpt-4', 'No enabled instances')
      const c = {
        json: () => ({ status: 0 }) as never,
        header: () => undefined,
        req: { raw: { signal: new AbortController().signal } },
      } as never

      await handleGatewayError({
        error: err,
        c,
        virtualKey: createTestVirtualKey(),
        requestHeaders: {},
        clientIp: '127.0.0.1',
        userAgent: 'test-client/1.0',
        clientType: 'curl',
        requestPath: '/api/v1/chat/completions',
        requestMethod: 'POST',
        isStreaming: false,
        startTime: Date.now(),
        rawBody: { model: 'gpt-4' },
      })

      expect(logRequestSpy).toHaveBeenCalled()
      const params = logRequestSpy.mock.calls[0]?.[0] as {
        modelName: string
        originalModelName: string | undefined
        clientType: string | undefined
        status: string
        requestPath: string
      }
      expect(params.modelName).toBe('gpt-4')
      expect(params.originalModelName).toBe('gpt-4')
      expect(params.clientType).toBe('curl')
      expect(params.status).toBe('failure')
      expect(params.requestPath).toBe('/api/v1/chat/completions')
    } finally {
      logRequestSpy.mockRestore()
    }
  })
})
