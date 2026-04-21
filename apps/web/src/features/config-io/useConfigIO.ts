'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ExportFormat, ImportResult } from './types';

const API_BASE = '/api';

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
  };
}

async function exportConfig(): Promise<Blob> {
  const response = await fetch(`${API_BASE}/config/export`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to export config');
  }

  return response.blob();
}

async function importConfig(file: File): Promise<ImportResult> {
  const text = await file.text();
  let parsed: ExportFormat;

  try {
    parsed = JSON.parse(text) as ExportFormat;
  } catch {
    throw new Error('文件不是有效的 JSON 格式');
  }

  const response = await fetch(`${API_BASE}/config/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(parsed),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Failed to import config');
  }

  return result as ImportResult;
}

export function useExportConfig() {
  return useMutation<Blob, Error, void>({
    mutationFn: exportConfig,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `x-llm-gateway-config-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('导出成功');
    },
    onError: (error) => {
      toast.error('导出失败', { description: error.message });
    },
  });
}

export function useImportConfig() {
  return useMutation<ImportResult, Error, File>({
    mutationFn: importConfig,
    onError: (error) => {
      toast.error('导入失败', { description: error.message });
    },
  });
}
