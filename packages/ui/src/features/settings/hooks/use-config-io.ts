'use client';

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { ExportFormat, ImportResult } from '@xartifact/x-llm-gateway-shared'
import { post } from '@xartifact/x-llm-gateway-ui'

async function exportConfigFn(): Promise<Blob> {
  // Blob 下载 — 使用 raw fetch（api-client 仅支持 JSON）
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch('/api/config/export', { headers })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to export config')
  }
  return response.blob()
}

async function importConfigFn(file: File): Promise<ImportResult> {
  const text = await file.text()
  let parsed: ExportFormat
  try {
    parsed = JSON.parse(text) as ExportFormat
  } catch {
    throw new Error('文件不是有效的 JSON 格式')
  }
  return post<ImportResult>('/api/config/import', parsed)
}

export function useExportConfig() {
  return useMutation<Blob, Error, void>({
    mutationFn: exportConfigFn,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const date = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = url
      a.download = `x-llm-gateway-config-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('导出成功')
    },
    onError: (error) => {
      toast.error('导出失败', { description: error.message })
    },
  })
}

export function useImportConfig() {
  return useMutation<ImportResult, Error, File>({
    mutationFn: importConfigFn,
    onError: (error) => {
      toast.error('导入失败', { description: error.message })
    },
  })
}
