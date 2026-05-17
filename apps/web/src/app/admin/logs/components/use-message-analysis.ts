'use client'

import { useState } from 'react'

type AnalysisStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

async function readAnalysisStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

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
        const parsed = JSON.parse(chunk) as { error?: string; choices?: Array<{ delta?: { content?: string } }> }
        if (parsed.error) throw new Error(parsed.error)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) { text += delta; onChunk(text) }
      } catch (e) {
        if (e instanceof Error && e.message !== 'skip') throw e
      }
    }
  }
}

interface UseMessageAnalysisOptions {
  logId: string
  selectedIndices: number[]
}

export function useMessageAnalysis({ logId, selectedIndices }: UseMessageAnalysisOptions) {
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(true)

  const hasSelection = selectedIndices.length > 0
  const isActive = status !== 'idle'

  async function handleAnalyze() {
    setStatus('loading')
    setResult('')
    setError('')
    setExpanded(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
      const response = await fetch(`/api/logs/${logId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify(hasSelection ? { indices: selectedIndices } : {}),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        setError(data.error ?? `请求失败 (${response.status})`)
        setStatus('error')
        return
      }
      setStatus('streaming')
      await readAnalysisStream(response.body!.getReader(), (text) => setResult(text))
      setStatus('done')
    } catch {
      setError('请求失败，请检查网络连接')
      setStatus('error')
    }
  }

  return { status, result, error, expanded, setExpanded, handleAnalyze, hasSelection, isActive }
}
