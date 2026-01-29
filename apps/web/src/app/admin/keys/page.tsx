"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Plus, Pencil, Trash2, Search, Eye, EyeOff, Key, RefreshCw, Copy, Check } from "lucide-react"

import { useKeys, useCreateKey, useUpdateKey, useDeleteKey, useResetKey } from "@/hooks/use-keys"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

// 表单验证 schema
const keySchema = z.object({
  name: z.string().min(2, "名称至少需要 2 个字符"),
  allowedModels: z.string().optional(),
  rateLimitRpm: z.number().min(0).optional(),
  rateLimitRpd: z.number().min(0).optional(),
  tokenLimitDaily: z.number().min(0).optional(),
  enabled: z.boolean(),
  expiresAt: z.string().optional(),
})

type KeyFormData = z.infer<typeof keySchema>

export default function KeysPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showKeyValue, setShowKeyValue] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showNewKey, setShowNewKey] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resettingKeyId, setResettingKeyId] = useState<string | null>(null)
  const [resetKeyValue, setResetKeyValue] = useState<string | null>(null)

  // 使用 TanStack Query Hooks
  const { data: keys = [], isLoading: loading } = useKeys()
  const createKey = useCreateKey()
  const updateKey = useUpdateKey()
  const deleteKey = useDeleteKey()
  const resetKey = useResetKey()

  const form = useForm<KeyFormData>({
    resolver: zodResolver(keySchema),
    defaultValues: {
      name: "",
      allowedModels: "",
      enabled: true,
    },
  })

  // 获取当前编辑的密钥
  const editingKey = editingKeyId
    ? keys.find(k => k.id === editingKeyId)
    : null

  const onSubmit = async (data: KeyFormData) => {
    // 解析允许的模型列表
    const allowedModels = data.allowedModels
      ? data.allowedModels.split(',').map(s => s.trim()).filter(Boolean)
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
      await updateKey.mutateAsync({
        id: editingKeyId,
        data: payload,
      })
    } else {
      const result = await createKey.mutateAsync(payload)
      // 保存新创建的密钥值，只显示一次
      if (result && result.key) {
        setNewlyCreatedKey(result.key)
        setShowNewKey(true)
      }
    }

    setDialogOpen(false)
    setEditingKeyId(null)
    form.reset()
  }

  const handleEdit = (keyId: string) => {
    const key = keys.find(k => k.id === keyId)
    if (!key) return

    setEditingKeyId(keyId)
    setNewlyCreatedKey(null)
    setShowNewKey(false)

    form.reset({
      name: key.name,
      allowedModels: key.allowedModels?.join(', ') || "",
      rateLimitRpm: key.rateLimitRpm || undefined,
      rateLimitRpd: key.rateLimitRpd || undefined,
      tokenLimitDaily: key.tokenLimitDaily ? Number(key.tokenLimitDaily) : undefined,
      enabled: key.enabled,
      expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString().split('T')[0] : "",
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除密钥 "${name}" 吗？\n\n此操作不可撤销。`)) {
      return
    }

    await deleteKey.mutateAsync(id)
  }

  const handleAddNew = () => {
    setEditingKeyId(null)
    setNewlyCreatedKey(null)
    setShowNewKey(false)
    form.reset({
      name: "",
      allowedModels: "",
      enabled: true,
    })
    setDialogOpen(true)
  }

  const handleReset = async (keyId: string) => {
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
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const toggleShowKey = (keyId: string) => {
    setShowKeyValue(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }))
  }

  const filteredKeys = keys.filter((key) =>
    key.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "永不过期"
    const date = new Date(dateStr)
    const now = new Date()
    if (date < now) return "已过期"
    return date.toLocaleDateString("zh-CN")
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和操作栏 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">密钥管理</h2>
          <p className="text-muted-foreground">
            管理用于访问 LLM Gateway 的虚拟密钥
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          创建密钥
        </Button>
      </div>

      {/* 搜索栏 */}
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

      {/* 密钥列表 */}
      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              加载中...
            </div>
          </CardContent>
        </Card>
      ) : filteredKeys.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {searchQuery ? "没有找到匹配的密钥" : "还没有密钥"}
              </p>
              {!searchQuery && (
                <Button onClick={handleAddNew} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  创建第一个密钥
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>API 密钥</TableHead>
                  <TableHead>限制</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>过期时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <div className="font-medium">{key.name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-muted-foreground font-mono">
                          {showKeyValue[key.id]
                            ? key.key
                            : `${key.key.slice(0, 8)}...${key.key.slice(-4)}`}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleShowKey(key.id)}
                        >
                          {showKeyValue[key.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(key.key, key.id)}
                        >
                          {copiedKey === key.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        {key.rateLimitRpm && (
                          <span className="text-muted-foreground">
                            {key.rateLimitRpm} RPM
                          </span>
                        )}
                        {key.rateLimitRpd && (
                          <span className="text-muted-foreground">
                            {key.rateLimitRpd} RPD
                          </span>
                        )}
                        {key.tokenLimitDaily && (
                          <span className="text-muted-foreground">
                            {Number(key.tokenLimitDaily).toLocaleString()} tokens/天
                          </span>
                        )}
                        {!key.rateLimitRpm && !key.rateLimitRpd && !key.tokenLimitDaily && (
                          <span className="text-muted-foreground">无限制</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.enabled ? "default" : "destructive"}>
                        {key.enabled ? "启用" : "禁用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm ${key.expiresAt && new Date(key.expiresAt) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {formatDate(key.expiresAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReset(key.id)}
                          title="重置密钥"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(key.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(key.id, key.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 添加/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingKeyId ? "编辑密钥" : "创建密钥"}
            </DialogTitle>
            <DialogDescription>
              {editingKeyId
                ? "修改虚拟密钥配置"
                : "创建新的虚拟密钥用于访问 LLM Gateway"}
            </DialogDescription>
          </DialogHeader>

          {/* 显示新创建的密钥 */}
          {!editingKeyId && showNewKey && newlyCreatedKey && (
            <Alert className="bg-yellow-50 border-yellow-200">
              <Key className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="space-y-2">
                <p className="font-medium text-yellow-800">
                  请保存您的 API 密钥，它只显示一次！
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-yellow-100 px-2 py-1 rounded text-sm font-mono break-all">
                    {newlyCreatedKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(newlyCreatedKey, 'new')}
                  >
                    {copiedKey === 'new' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* 基本信息 */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">基本信息</h4>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>密钥名称 *</FormLabel>
                      <FormControl>
                        <Input placeholder="生产环境密钥" {...field} />
                      </FormControl>
                      <FormDescription>
                        给密钥起一个有意义的名称，便于识别用途
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>启用密钥</FormLabel>
                        <FormDescription>
                          禁用后此密钥将无法访问 API
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* 限制配置 */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium">访问限制</h4>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="rateLimitRpm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>每分钟请求数 (RPM)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="无限制"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="rateLimitRpd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>每天请求数 (RPD)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="无限制"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="tokenLimitDaily"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>每日 Token 限制</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="无限制"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormDescription>
                        每天最多消耗的 token 数量
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>过期时间</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        留空表示永不过期
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="allowedModels"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>允许的模型</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="gpt-4, gpt-3.5-turbo, claude-3-opus"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        用逗号分隔模型名称，留空表示允许访问所有模型
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  关闭
                </Button>
                {!showNewKey && (
                  <Button type="submit" disabled={createKey.isPending || updateKey.isPending}>
                    {createKey.isPending || updateKey.isPending
                      ? "保存中..."
                      : editingKeyId ? "保存更改" : "创建密钥"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 重置密钥确认对话框 */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>重置密钥</DialogTitle>
            <DialogDescription>
              确定要重置此密钥吗？重置后将生成新的 API 密钥，旧密钥将立即失效。
            </DialogDescription>
          </DialogHeader>

          {resetKeyValue && (
            <Alert className="bg-yellow-50 border-yellow-200">
              <Key className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="space-y-2">
                <p className="font-medium text-yellow-800">
                  请保存新的 API 密钥！
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-yellow-100 px-2 py-1 rounded text-sm font-mono break-all">
                    {resetKeyValue}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(resetKeyValue, 'reset')}
                  >
                    {copiedKey === 'reset' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetDialogOpen(false)
                setResetKeyValue(null)
                setResettingKeyId(null)
              }}
            >
              {resetKeyValue ? "关闭" : "取消"}
            </Button>
            {!resetKeyValue && (
              <Button
                variant="destructive"
                onClick={confirmReset}
                disabled={resetKey.isPending}
              >
                {resetKey.isPending ? "重置中..." : "确认重置"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
