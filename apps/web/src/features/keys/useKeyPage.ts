'use client'

import { useState, useMemo } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { useKeysStats } from '@/hooks/use-logs'

import type { KeyFormData } from '@x-llm-gateway/engine'
import { useKeys, useCreateKey, useUpdateKey, useDeleteKey, useResetKey } from './useKeys'

const keySchema = z.object({
  name: z.string().min(2, '名称至少需要 2 个字符'),
  allowedModels: z.string(),
  rateLimitRpm: z.number().optional(),
  rateLimitRpd: z.number().optional(),
  tokenLimitDaily: z.number().optional(),
  enabled: z.boolean(),
  expiresAt: z.string(),
})

type KeyFormSchema = z.infer<typeof keySchema>

export function useKeyPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showKeyValue, setShowKeyValue] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showNewKey, setShowNewKey] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resettingKeyId, setResettingKeyId] = useState<string | null>(null)
  const [resetKeyValue, setResetKeyValue] = useState<string | null>(null)
  const [statsKeyId, setStatsKeyId] = useState<string | null>(null)
  const [statsPeriod, setStatsPeriod] = useState<'today' | '7d' | '30d' | 'all'>('7d')

  const { data: keys = [], isLoading: loading } = useKeys()
  const { data: keysStats = [] } = useKeysStats(statsPeriod)
  const createKey = useCreateKey()
  const updateKey = useUpdateKey()
  const deleteKey = useDeleteKey()
  const resetKey = useResetKey()

  const form = useForm<KeyFormSchema>({
    resolver: zodResolver(keySchema as any),
    defaultValues: {
      name: '',
      allowedModels: '',
      enabled: true,
      rateLimitRpm: undefined,
      rateLimitRpd: undefined,
      tokenLimitDaily: undefined,
      expiresAt: '',
    },
  })

  const editingKey = editingKeyId ? keys.find((k) => k.id === editingKeyId) : null
  const statsKey = statsKeyId ? keys.find((k) => k.id === statsKeyId) ?? null : null

  const statsMap = useMemo(
    () => new Map(keysStats.map((s) => [s.virtualKeyId, s])),
    [keysStats],
  )

  const handleShowStats = (keyId: string) => setStatsKeyId(keyId)

  const onSubmit = async (data: KeyFormSchema) => {
    const allowedModels = data.allowedModels
      ? data.allowedModels.split(',').map((s) => s.trim()).filter(Boolean)
      : null

    const payload = {
      name: data.name,
      allowedModels: allowedModels,
      rateLimitRpm: data.rateLimitRpm || null,
      rateLimitRpd: data.rateLimitRpd || null,
      tokenLimitDaily: data.tokenLimitDaily || null,
      enabled: data.enabled,
      expiresAt: data.expiresAt || null,
    }

    if (editingKeyId) {
      await updateKey.mutateAsync({ id: editingKeyId, data: payload })
    } else {
      const result = await createKey.mutateAsync(payload)
      if (result && result.key) {
        setNewlyCreatedKey(result.key)
        setShowNewKey(true)
      }
    }

    if (editingKeyId) {
      setDialogOpen(false)
      setEditingKeyId(null)
      form.reset()
    }
  }

  const handleEdit = (keyId: string) => {
    const key = keys.find((k) => k.id === keyId)
    if (!key) return

    setEditingKeyId(keyId)
    setNewlyCreatedKey(null)
    setShowNewKey(false)

    form.reset({
      name: key.name,
      allowedModels: key.allowedModels?.join(', ') || '',
      rateLimitRpm: key.rateLimitRpm || undefined,
      rateLimitRpd: key.rateLimitRpd || undefined,
      tokenLimitDaily: key.tokenLimitDaily ? Number(key.tokenLimitDaily) : undefined,
      enabled: key.enabled,
      expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString().split('T')[0] : '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除密钥 "${name}" 吗？\n\n此操作不可撤销。`)) return
    await deleteKey.mutateAsync(id)
  }

  const handleAddNew = () => {
    setEditingKeyId(null)
    setNewlyCreatedKey(null)
    setShowNewKey(false)
    form.reset({
      name: '',
      allowedModels: '',
      enabled: true,
      rateLimitRpm: undefined,
      rateLimitRpd: undefined,
      tokenLimitDaily: undefined,
      expiresAt: '',
    })
    setDialogOpen(true)
  }

  const handleReset = (keyId: string) => {
    setResettingKeyId(keyId)
    setResetDialogOpen(true)
  }

  const confirmReset = async () => {
    if (!resettingKeyId) return
    const result = await resetKey.mutateAsync(resettingKeyId)
    if (result && result.key) {
      setResetKeyValue(result.key)
    }
    setResettingKeyId(null)
  }

  const copyToClipboard = async (keyValue: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(keyValue)
      setCopiedKey(keyId)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // clipboard 写入失败，静默忽略
    }
  }

  const toggleShowKey = (keyId: string) => {
    setShowKeyValue((prev) => ({ ...prev, [keyId]: !prev[keyId] }))
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingKeyId(null)
    setNewlyCreatedKey(null)
    setShowNewKey(false)
    form.reset()
  }

  const closeResetDialog = () => {
    setResetDialogOpen(false)
    setResetKeyValue(null)
    setResettingKeyId(null)
  }

  const filteredKeys = keys.filter((key) =>
    key.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '永不过期'
    const date = new Date(dateStr)
    const now = new Date()
    if (date < now) return '已过期'
    return date.toLocaleDateString('zh-CN')
  }

  return {
    keys,
    loading,
    filteredKeys,
    dialogOpen,
    setDialogOpen,
    editingKeyId,
    editingKey,
    searchQuery,
    setSearchQuery,
    showKeyValue,
    copiedKey,
    showNewKey,
    newlyCreatedKey,
    resetDialogOpen,
    setResetDialogOpen,
    resetKeyValue,
    isSubmitting: createKey.isPending || updateKey.isPending,
    isResetting: resetKey.isPending,
    form,
    onSubmit,
    handleEdit,
    handleDelete,
    handleAddNew,
    handleReset,
    confirmReset,
    copyToClipboard,
    toggleShowKey,
    closeDialog,
    closeResetDialog,
    formatDate,
    statsKeyId,
    setStatsKeyId,
    statsKey,
    statsPeriod,
    setStatsPeriod,
    statsMap,
    handleShowStats,
  }
}
