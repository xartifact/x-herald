import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import {
  STREAM_EVENT_BUS_STALE_TIMEOUT_MS,
  STREAM_WAITING_TIMEOUT_MS,
} from '@xartifact/x-herald-shared'

import { logEventBus } from './log-event-bus'
import type { LiveStreamEvent } from './log-event-bus'

describe('stalled stream cleanup', () => {
  let now = 1_000_000
  let clock: ReturnType<typeof spyOn<typeof Date, 'now'>>

  beforeEach(() => {
    logEventBus.stopCleanup()
    logEventBus.reset()
    now = 1_000_000
    clock = spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    logEventBus.stopCleanup()
    logEventBus.reset()
    clock.mockRestore()
  })

  function start(event: 'waiting' | 'started' = 'started') {
    const controller = new AbortController()
    logEventBus.registerAbortController('stream', controller)
    logEventBus.emitLog({
      event,
      logId: 'stream',
      modelName: 'test',
      providerName: 'test',
      incomingProtocol: 'openai',
      startTime: now,
    })
    return controller
  }

  function chunk() {
    logEventBus.emitLog({
      event: 'chunk',
      logId: 'stream',
      outputTokens: 1,
      totalChunks: 1,
      hasThinking: false,
      elapsedMs: now - 1_000_000,
    })
  }

  async function cleanupTick() {
    logEventBus.startCleanup(1)
    await new Promise((resolve) => setTimeout(resolve, 15))
    logEventBus.stopCleanup()
  }

  it('aborts a stalled stream after its last chunk and emits one terminal event', async () => {
    const controller = start()
    chunk()
    const terminal: LiveStreamEvent[] = []
    logEventBus.on('log', (event: LiveStreamEvent) => terminal.push(event))
    now += STREAM_EVENT_BUS_STALE_TIMEOUT_MS + 1
    await cleanupTick()
    expect(controller.signal.aborted).toBe(true)
    expect(logEventBus.activeStreams.has('stream')).toBe(false)
    expect(terminal).toEqual([{ event: 'aborted', logId: 'stream', reason: 'stale_cleanup' }])
  })

  it('keeps a long-running stream alive while chunks continue arriving', async () => {
    const controller = start()
    now += STREAM_EVENT_BUS_STALE_TIMEOUT_MS - 1
    chunk()
    now += STREAM_EVENT_BUS_STALE_TIMEOUT_MS - 1
    await cleanupTick()
    expect(controller.signal.aborted).toBe(false)
    expect(logEventBus.activeStreams.has('stream')).toBe(true)
  })

  for (const event of ['waiting', 'started'] as const) {
    it(`still cleans up stalled ${event} streams without chunks`, async () => {
      const controller = start(event)
      now +=
        (event === 'waiting' ? STREAM_WAITING_TIMEOUT_MS : STREAM_EVENT_BUS_STALE_TIMEOUT_MS) + 1
      await cleanupTick()
      expect(controller.signal.aborted).toBe(true)
      expect(logEventBus.activeStreams.size).toBe(0)
    })
  }

  it('does not abort a completed stream during later cleanup', async () => {
    const controller = start()
    chunk()
    logEventBus.emitLog({
      event: 'completed',
      logId: 'stream',
      status: 'success',
      inputTokens: 1,
      outputTokens: 1,
      responseTimeMs: 1,
    })
    now += STREAM_EVENT_BUS_STALE_TIMEOUT_MS + 1
    await cleanupTick()
    expect(controller.signal.aborted).toBe(false)
    expect(logEventBus.activeStreams.size).toBe(0)
  })
})
