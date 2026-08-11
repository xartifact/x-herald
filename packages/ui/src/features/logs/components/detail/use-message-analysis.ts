import { useState } from 'react'

export type AnalysisMode = 'full' | 'system' | 'user' | 'selected'

export interface AnalysisResult {
  scenario: string
  promptStrategies: string[]
  tokenBreakdown: {
    systemPromptRatio: number
    contextRatio: number
    userQueryRatio: number
  }
  signals: {
    hasPii: boolean
    hasInjectionAttempt: boolean
    hasExternalUrls: boolean
    language: string
  }
  mismatch: string | null
}

type AnalysisStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

async function readAnalysisStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onProgress: () => void,
): Promise<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const chunk = line.slice(6).trim()
      if (chunk === '[DONE]') continue
      try {
        const parsed = JSON.parse(chunk) as {
          error?: string
          choices?: Array<{ delta?: { content?: string } }>
        }
        if (parsed.error) throw new Error(parsed.error)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          accumulated += delta
          onProgress()
        }
      } catch (e) {
        if (e instanceof Error && e.message !== 'skip') throw e
      }
    }
  }

  return accumulated
}

interface UseMessageAnalysisOptions {
  logId: string
  selectedIndices: number[]
}

export function useMessageAnalysis({ logId, selectedIndices }: UseMessageAnalysisOptions) {
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [activeMode, setActiveMode] = useState<AnalysisMode>('full')

  const hasSelection = selectedIndices.length > 0
  const isActive = status !== 'idle'

  async function handleAnalyze(mode: AnalysisMode) {
    setStatus('loading')
    setResult(null)
    setError('')
    setExpanded(true)
    setActiveMode(mode)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
      const body = mode === 'selected' ? { indices: selectedIndices } : { mode }
      const response = await fetch(`/api/logs/${logId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? `请求失败 (${response.status})`)
        setStatus('error')
        return
      }
      setStatus('streaming')
      const raw = await readAnalysisStream(response.body!.getReader(), () => {
        /* progress pulse */
      })
      try {
        // strip possible markdown code fences
        const cleaned = raw
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim()
        setResult(JSON.parse(cleaned) as AnalysisResult)
        setStatus('done')
      } catch {
        setError('模型返回的结果无法解析，请重试')
        setStatus('error')
      }
    } catch {
      setError('请求失败，请检查网络连接')
      setStatus('error')
    }
  }

  return {
    status,
    result,
    error,
    expanded,
    setExpanded,
    handleAnalyze,
    hasSelection,
    isActive,
    activeMode,
  }
}
