import { describe, it, expect, beforeEach } from 'bun:test'

import { ConsoleLogBus, parsePinoLine, resetConsoleLogBus, LEVEL_PRIORITY } from './console-log-bus'

describe('parsePinoLine', () => {
  it('parses a standard pino JSON line with module and fields', () => {
    const entry = parsePinoLine(
      JSON.stringify({
        level: 30,
        time: 1787792881067,
        pid: 1,
        hostname: 'h',
        name: 'server',
        msg: 'Engine server started',
        port: 3000,
      }),
    )
    expect(entry).toEqual({
      time: '2026-08-27T01:08:01.067Z',
      level: 'info',
      msg: 'Engine server started',
      module: 'server',
      fields: { port: 3000 },
    })
  })

  it('maps string levels and strips builtin keys', () => {
    const entry = parsePinoLine(
      JSON.stringify({
        level: 'error',
        time: '2026-08-27T01:00:00.000Z',
        msg: 'boom',
        err: { message: 'x' },
        requestId: 'abc',
      }),
    )
    expect(entry?.level).toBe('error')
    expect(entry?.fields).toEqual({ requestId: 'abc' })
  })

  it('returns null for non-JSON input', () => {
    expect(parsePinoLine('not json')).toBeNull()
  })

  it('falls back to info for unknown level', () => {
    const entry = parsePinoLine(JSON.stringify({ level: 7, msg: 'weird' }))
    expect(entry?.level).toBe('info')
  })
})

describe('ConsoleLogBus', () => {
  beforeEach(() => {
    resetConsoleLogBus()
  })

  it('buffers written entries and returns them in snapshot order', () => {
    const bus = new ConsoleLogBus()
    bus.write(JSON.stringify({ level: 30, time: 1, msg: 'a' }))
    bus.write(JSON.stringify({ level: 50, time: 2, msg: 'b' }))

    const snapshot = bus.snapshot()
    expect(snapshot.map((e) => e.msg)).toEqual(['a', 'b'])
    expect(snapshot[1]?.level).toBe('error')
  })

  it('caps the ring buffer at bufferSize', () => {
    const bus = new ConsoleLogBus(2)
    bus.write(JSON.stringify({ level: 30, msg: '1' }))
    bus.write(JSON.stringify({ level: 30, msg: '2' }))
    bus.write(JSON.stringify({ level: 30, msg: '3' }))

    expect(bus.snapshot().map((e) => e.msg)).toEqual(['2', '3'])
  })

  it('broadcasts to subscribers and unsubscribes', () => {
    const bus = new ConsoleLogBus()
    const seen: string[] = []
    const unsubscribe = bus.subscribe((entry) => seen.push(entry.msg))

    bus.write(JSON.stringify({ level: 30, msg: 'first' }))
    expect(seen).toEqual(['first'])

    unsubscribe()
    bus.write(JSON.stringify({ level: 30, msg: 'second' }))
    expect(seen).toEqual(['first'])
  })

  it('ignores unparseable lines', () => {
    const bus = new ConsoleLogBus()
    bus.write('garbage')
    expect(bus.snapshot()).toHaveLength(0)
  })

  it('exposes LEVEL_PRIORITY consistent with pino ordering', () => {
    expect(LEVEL_PRIORITY.fatal).toBe(60)
    expect(LEVEL_PRIORITY.error).toBe(50)
    expect(LEVEL_PRIORITY.warn).toBe(40)
    expect(LEVEL_PRIORITY.info).toBe(30)
    expect(LEVEL_PRIORITY.debug).toBe(20)
    expect(LEVEL_PRIORITY.trace).toBe(10)
  })
})
