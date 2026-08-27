import { useEffect, useRef, useState } from 'react'

import { Pause, Play, RotateCcw, ScrollText, Terminal } from 'lucide-react'

import {
  useConsoleLogs,
  CONSOLE_LOG_LEVELS,
  CONSOLE_LOG_LEVEL_LABELS,
  CONSOLE_LOG_LEVEL_COLORS,
  type ConsoleLogEntry,
  type ConsoleLogLevel,
} from '../../../hooks/logs'
import { Badge } from '@xartifact/x-herald-ui'
import { Button } from '@xartifact/x-herald-ui'
import { Card, CardContent } from '@xartifact/x-herald-ui'
import { PageHeader } from '@xartifact/x-herald-ui'

const LEVEL_ORDER: ConsoleLogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

function formatTime(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + `.${String(d.getMilliseconds()).padStart(3, '0')}`
  )
}

/** 单条日志行：时间 + 级别 + 模块 + 消息 + 结构化字段 */
function LogLine({ entry }: { entry: ConsoleLogEntry }) {
  const fieldEntries = Object.entries(entry.fields)
  return (
    <div className="font-mono text-xs leading-5 px-2 py-0.5 hover:bg-accent/40 whitespace-pre-wrap break-all">
      <span className="text-muted-foreground/70">{formatTime(entry.time)}</span>{' '}
      <span className={`${CONSOLE_LOG_LEVEL_COLORS[entry.level]} w-14 inline-block`}>
        {CONSOLE_LOG_LEVEL_LABELS[entry.level]}
      </span>
      {entry.module && <span className="text-cyan-500/80">[{entry.module}]</span>}{' '}
      <span className="text-foreground/90">{entry.msg}</span>
      {fieldEntries.length > 0 && (
        <span className="text-muted-foreground/80">
          {' '}
          {fieldEntries.map(([k, v]) => `${k}=${formatField(v)}`).join(' ')}
        </span>
      )}
    </div>
  )
}

function formatField(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function ConsoleLogsPage() {
  const [minLevel, setMinLevel] = useState<ConsoleLogLevel>('warn')
  const { entries, connected, paused, setPaused, clear } = useConsoleLogs({ minLevel })
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const userScrolledUpRef = useRef(false)

  // 自动滚动到最新（用户上滑后暂停自动滚动，回到底部恢复）
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !autoScroll) return
    el.scrollTop = el.scrollHeight
  }, [entries, autoScroll])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    userScrolledUpRef.current = !nearBottom
    setAutoScroll(nearBottom)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="控制台日志"
        description="网关进程实时日志（pino），默认 warn 及以上，可切换级别"
      />

      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">实时日志</span>
            <Badge variant={connected ? 'default' : 'secondary'} className="text-xs">
              {connected ? '已连接' : '已断开'}
            </Badge>

            <div className="ml-auto flex items-center gap-2">
              <select
                value={minLevel}
                onChange={(e) => setMinLevel(e.target.value as ConsoleLogLevel)}
                className="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="日志级别"
              >
                {LEVEL_ORDER.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {CONSOLE_LOG_LEVEL_LABELS[lvl]} 及以上
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? '继续' : '暂停'}
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? '继续' : '暂停'}
              </Button>
              <Button variant="outline" size="sm" onClick={clear} aria-label="清空">
                <RotateCcw className="h-4 w-4" />
                清空
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAutoScroll(true)
                  userScrolledUpRef.current = false
                  const el = scrollRef.current
                  if (el) el.scrollTop = el.scrollHeight
                }}
                aria-label="回到最新"
              >
                <ScrollText className="h-4 w-4" />
                {autoScroll ? '自动滚动' : '回到最新'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-[60vh] overflow-y-auto bg-background/50 rounded-md p-2 space-y-0"
            data-testid="console-log-viewport"
          >
            {entries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                {paused ? '已暂停，暂不接收新日志' : '等待日志…（默认 warn 及以上）'}
              </div>
            ) : (
              entries.map((entry, idx) => <LogLine key={`${entry.time}-${idx}`} entry={entry} />)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
