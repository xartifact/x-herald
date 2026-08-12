import { useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Loader2 } from 'lucide-react'

import { useKeys, useCreateKey, useUpdateKey, useDeleteKey, useResetKey } from '../../../hooks/keys'
import { useKeysStats } from '../../../hooks/logs'
import type { KeyFormData } from '@xartifact/x-herald-ui'
import {
  Button,
  Card,
  CardContent,
  Input,
  KeyTable,
  KeyFormDialog,
  KeyResetDialog,
  KeyStatsSheet,
  ListPagination,
  PageHeader,
  EmptyState,
} from '@xartifact/x-herald-ui'
import { keySchema, type KeyFormSchema } from './key-form-schema'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

export function KeysPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [showKeyValue, setShowKeyValue] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showNewKey, setShowNewKey] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resettingKeyId, setResettingKeyId] = useState<string | null>(null)
  const [resetKeyValue, setResetKeyValue] = useState<string | null>(null)
  const [statsKeyId, setStatsKeyId] = useState<string | null>(null)
  const [statsPeriod, setStatsPeriod] = useState<'today' | '7d' | '30d' | 'all'>('7d')

  const { data: keysResult, isLoading: loading } = useKeys({
    page: currentPage,
    pageSize,
    search: deferredSearch || undefined,
  })
  const keys = useMemo(() => keysResult?.data ?? [], [keysResult])
  const pagination = keysResult?.pagination
  const { data: keysStats = [] } = useKeysStats(statsPeriod)
  const createKey = useCreateKey()
  const updateKey = useUpdateKey()
  const deleteKey = useDeleteKey()
  const resetKey = useResetKey()

  useEffect(() => {
    setCurrentPage(1)
  }, [deferredSearch])

  const form = useForm<KeyFormSchema>({
    resolver: zodResolver(keySchema),
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

  const statsKey = statsKeyId ? ((keys as any[]).find((k) => k.id === statsKeyId) ?? null) : null

  const statsMap = useMemo(() => new Map(keysStats.map((s) => [s.virtualKeyId, s])), [keysStats])

  const handleShowStats = useCallback((keyId: string) => setStatsKeyId(keyId), [])

  const onSubmit = useCallback(
    async (data: KeyFormData) => {
      const allowedModels = data.allowedModels
        ? data.allowedModels
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null

      const payload = {
        name: data.name,
        allowedModels,
        rateLimitRpm: data.rateLimitRpm ?? null,
        rateLimitRpd: data.rateLimitRpd ?? null,
        tokenLimitDaily: data.tokenLimitDaily ?? null,
        enabled: data.enabled,
        expiresAt: data.expiresAt || null,
      }

      if (editingKeyId) {
        await updateKey.mutateAsync({ id: editingKeyId, data: payload })
        setDialogOpen(false)
        setEditingKeyId(null)
        form.reset()
      } else {
        const result = await createKey.mutateAsync(payload)
        if (result && result.key) {
          setNewlyCreatedKey(result.key)
          setShowNewKey(true)
        }
      }
    },
    [editingKeyId, updateKey, createKey, form],
  )

  const handleEdit = useCallback(
    (keyId: string) => {
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
    },
    [keys, form],
  )

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`确定要删除密钥 "${name}" 吗？\n\n此操作不可撤销。`)) return
      await deleteKey.mutateAsync(id)
    },
    [deleteKey],
  )

  const handleAddNew = useCallback(() => {
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
  }, [form])

  const handleReset = useCallback((keyId: string) => {
    setResettingKeyId(keyId)
    setResetDialogOpen(true)
  }, [])

  const confirmReset = useCallback(async () => {
    if (!resettingKeyId) return
    const result = await resetKey.mutateAsync(resettingKeyId)
    if (result && result.key) {
      setResetKeyValue(result.key)
    }
    setResettingKeyId(null)
  }, [resettingKeyId, resetKey])

  const copyToClipboard = useCallback(async (keyValue: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(keyValue)
      setCopiedKey(keyId)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // clipboard 写入失败，静默忽略
    }
  }, [])

  const toggleShowKey = useCallback((keyId: string) => {
    setShowKeyValue((prev) => ({ ...prev, [keyId]: !prev[keyId] }))
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setEditingKeyId(null)
    setNewlyCreatedKey(null)
    setShowNewKey(false)
    form.reset()
  }, [form])

  const closeResetDialog = useCallback(() => {
    setResetDialogOpen(false)
    setResetKeyValue(null)
    setResettingKeyId(null)
  }, [])

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }, [])

  const formatDate = useCallback((dateStr: string | null) => {
    if (!dateStr) return '永不过期'
    const date = new Date(dateStr)
    const now = new Date()
    if (date < now) return '已过期'
    return date.toLocaleDateString('zh-CN')
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="密钥管理"
        description="管理用于访问 LLM Gateway 的虚拟密钥"
        actions={
          <Button onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            创建密钥
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索密钥..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          </CardContent>
        </Card>
      ) : keys.length === 0 ? (
        <EmptyState
          searchQuery={searchQuery}
          action={
            !searchQuery && (
              <Button onClick={handleAddNew} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                创建第一个密钥
              </Button>
            )
          }
        />
      ) : (
        <KeyTable
          keys={keys}
          display={{
            showKeyValue,
            copiedKey,
            onToggleShow: toggleShowKey,
            onCopy: copyToClipboard,
          }}
          actions={{
            onEdit: handleEdit,
            onDelete: handleDelete,
            onReset: handleReset,
            onShowStats: handleShowStats,
          }}
          stats={statsMap}
          formatDate={formatDate}
        />
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <ListPagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      <KeyFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog()
          else setDialogOpen(true)
        }}
        form={form}
        editingId={editingKeyId}
        isPending={createKey.isPending || updateKey.isPending}
        showNewKey={showNewKey}
        newlyCreatedKey={newlyCreatedKey}
        copiedKey={copiedKey}
        onSubmit={onSubmit}
        onCopyNewKey={() => newlyCreatedKey && copyToClipboard(newlyCreatedKey, 'new')}
      />

      <KeyResetDialog
        open={resetDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeResetDialog()
          else setResetDialogOpen(true)
        }}
        resetKeyValue={resetKeyValue}
        copied={copiedKey === 'reset'}
        isPending={resetKey.isPending}
        onConfirm={confirmReset}
        onCopy={() => resetKeyValue && copyToClipboard(resetKeyValue, 'reset')}
        onCancel={closeResetDialog}
      />

      <KeyStatsSheet
        open={statsKeyId !== null}
        onOpenChange={(open) => {
          if (!open) setStatsKeyId(null)
        }}
        virtualKey={statsKey}
        stat={statsKeyId ? statsMap.get(statsKeyId) : undefined}
        period={statsPeriod}
        onPeriodChange={setStatsPeriod}
      />
    </div>
  )
}
