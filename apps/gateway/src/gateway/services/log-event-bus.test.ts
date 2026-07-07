import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { logEventBus, LiveStreamEvent } from './log-event-bus'

function getAbortControllers() {
  return (logEventBus as unknown as { abortControllers: Map<string, AbortController> })
    .abortControllers
}

describe('logEventBus', () => {
  beforeEach(() => {
    logEventBus.stopCleanup()
    logEventBus.activeStreams.clear()
    getAbortControllers().clear()
    logEventBus.removeAllListeners('log')
  })

  afterEach(() => {
    logEventBus.stopCleanup()
    logEventBus.removeAllListeners('log')
  })

  it('emitLog waiting → adds to activeStreams', () => {
    const event: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    logEventBus.emitLog(event)

    expect(logEventBus.activeStreams.has('log-1')).toBe(true)
    expect(logEventBus.activeStreams.get('log-1')).toEqual(event)
  })

  it('emitLog started → adds to activeStreams and overwrites waiting', () => {
    const waitingEvent: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    const startedEvent: LiveStreamEvent = {
      event: 'started',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }

    logEventBus.emitLog(waitingEvent)
    logEventBus.emitLog(startedEvent)

    const snapshot = logEventBus.activeStreams.get('log-1')
    expect(snapshot?.event).toBe('started')
  })

  it('emitLog chunk → adds to activeStreams', () => {
    const event: LiveStreamEvent = {
      event: 'chunk',
      logId: 'log-1',
      outputTokens: 10,
      totalChunks: 5,
      hasThinking: false,
      elapsedMs: 1000,
    }
    logEventBus.emitLog(event)

    expect(logEventBus.activeStreams.has('log-1')).toBe(true)
    expect(logEventBus.activeStreams.get('log-1')).toEqual(event)
  })

  it('emitLog completed → removes from activeStreams', () => {
    const waitingEvent: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    logEventBus.emitLog(waitingEvent)

    const completedEvent: LiveStreamEvent = {
      event: 'completed',
      logId: 'log-1',
      status: 'success',
      inputTokens: 100,
      outputTokens: 50,
      responseTimeMs: 2000,
    }
    logEventBus.emitLog(completedEvent)

    expect(logEventBus.activeStreams.has('log-1')).toBe(false)
  })

  it('emitLog aborted → removes from activeStreams', () => {
    const waitingEvent: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    logEventBus.emitLog(waitingEvent)

    const abortedEvent: LiveStreamEvent = {
      event: 'aborted',
      logId: 'log-1',
      reason: 'client_disconnect',
    }
    logEventBus.emitLog(abortedEvent)

    expect(logEventBus.activeStreams.has('log-1')).toBe(false)
  })

  it('registerAbortController + abortRequest → aborts controller, removes from maps, returns true', () => {
    const controller = new AbortController()
    const waitingEvent: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }

    logEventBus.emitLog(waitingEvent)
    logEventBus.registerAbortController('log-1', controller)

    expect(getAbortControllers().has('log-1')).toBe(true)

    const result = logEventBus.abortRequest('log-1')

    expect(result).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    expect(getAbortControllers().has('log-1')).toBe(false)
    expect(logEventBus.activeStreams.has('log-1')).toBe(false)
  })

  it('abortRequest for non-existent logId → returns false', () => {
    const result = logEventBus.abortRequest('non-existent')
    expect(result).toBe(false)
  })

  it('emitLog emits log event that listeners receive', () => {
    const receivedEvents: LiveStreamEvent[] = []
    logEventBus.on('log', (event: LiveStreamEvent) => {
      receivedEvents.push(event)
    })

    const event: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    logEventBus.emitLog(event)

    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]).toEqual(event)
  })

  it('activeStreams tracks lifecycle through waiting → started → chunk → completed', () => {
    const waiting: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    const started: LiveStreamEvent = {
      event: 'started',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    const chunk: LiveStreamEvent = {
      event: 'chunk',
      logId: 'log-1',
      outputTokens: 5,
      totalChunks: 1,
      hasThinking: false,
      elapsedMs: 500,
    }
    const completed: LiveStreamEvent = {
      event: 'completed',
      logId: 'log-1',
      status: 'success',
      inputTokens: 10,
      outputTokens: 5,
      responseTimeMs: 1500,
    }

    logEventBus.emitLog(waiting)
    expect(logEventBus.activeStreams.get('log-1')?.event).toBe('waiting')

    logEventBus.emitLog(started)
    expect(logEventBus.activeStreams.get('log-1')?.event).toBe('started')

    logEventBus.emitLog(chunk)
    expect(logEventBus.activeStreams.get('log-1')?.event).toBe('chunk')

    logEventBus.emitLog(completed)
    expect(logEventBus.activeStreams.has('log-1')).toBe(false)
  })

  it('registerAbortController + emitLog completed → controller cleaned up', () => {
    const controller = new AbortController()
    const waiting: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    const completed: LiveStreamEvent = {
      event: 'completed',
      logId: 'log-1',
      status: 'success',
      inputTokens: 10,
      outputTokens: 5,
      responseTimeMs: 1500,
    }

    logEventBus.emitLog(waiting)
    logEventBus.registerAbortController('log-1', controller)
    expect(getAbortControllers().has('log-1')).toBe(true)

    logEventBus.emitLog(completed)
    expect(getAbortControllers().has('log-1')).toBe(false)
    expect(logEventBus.activeStreams.has('log-1')).toBe(false)
  })

  it('multiple streams tracked independently', () => {
    const stream1: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    const stream2: LiveStreamEvent = {
      event: 'started',
      logId: 'log-2',
      modelName: 'claude-3',
      providerName: 'anthropic',
      startTime: Date.now(),
      incomingProtocol: 'anthropic',
    }

    logEventBus.emitLog(stream1)
    logEventBus.emitLog(stream2)

    expect(logEventBus.activeStreams.has('log-1')).toBe(true)
    expect(logEventBus.activeStreams.has('log-2')).toBe(true)
    expect(logEventBus.activeStreams.get('log-1')?.event).toBe('waiting')
    expect(logEventBus.activeStreams.get('log-2')?.event).toBe('started')

    const completed: LiveStreamEvent = {
      event: 'completed',
      logId: 'log-1',
      status: 'success',
      inputTokens: 10,
      outputTokens: 5,
      responseTimeMs: 1000,
    }
    logEventBus.emitLog(completed)

    expect(logEventBus.activeStreams.has('log-1')).toBe(false)
    expect(logEventBus.activeStreams.has('log-2')).toBe(true)
  })

  it('abortRequest emits aborted event with reason cancelled', () => {
    const receivedEvents: LiveStreamEvent[] = []
    logEventBus.on('log', (event: LiveStreamEvent) => {
      receivedEvents.push(event)
    })

    const waiting: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    logEventBus.emitLog(waiting)
    logEventBus.registerAbortController('log-1', new AbortController())

    logEventBus.abortRequest('log-1')

    const abortedEvent = receivedEvents.find((e) => e.event === 'aborted')
    expect(abortedEvent).toBeDefined()
    expect(abortedEvent).toEqual({ event: 'aborted', logId: 'log-1', reason: 'cancelled' })
  })

  it('abortRequest does not emit aborted event if stream was not active', () => {
    const receivedEvents: LiveStreamEvent[] = []
    logEventBus.on('log', (event: LiveStreamEvent) => {
      receivedEvents.push(event)
    })

    logEventBus.registerAbortController('log-1', new AbortController())
    const result = logEventBus.abortRequest('log-1')

    expect(result).toBe(false)
    const abortedEvent = receivedEvents.find((e) => e.event === 'aborted')
    expect(abortedEvent).toBeUndefined()
  })

  it('emitLog aborted cleans up abortController', () => {
    const controller = new AbortController()
    const waiting: LiveStreamEvent = {
      event: 'waiting',
      logId: 'log-1',
      modelName: 'gpt-4',
      providerName: 'openai',
      startTime: Date.now(),
      incomingProtocol: 'openai',
    }
    const aborted: LiveStreamEvent = { event: 'aborted', logId: 'log-1', reason: 'timeout' }

    logEventBus.emitLog(waiting)
    logEventBus.registerAbortController('log-1', controller)
    expect(getAbortControllers().has('log-1')).toBe(true)

    logEventBus.emitLog(aborted)
    expect(getAbortControllers().has('log-1')).toBe(false)
  })

  it('startCleanup and stopCleanup manage interval timer', () => {
    logEventBus.startCleanup(1000)
    expect(logEventBus.activeStreams.size).toBe(0)

    logEventBus.stopCleanup()
    // Should not throw and timer should be stopped
    expect(logEventBus.activeStreams.size).toBe(0)
  })
})
