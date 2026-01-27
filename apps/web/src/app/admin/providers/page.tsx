"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Search, Eye, EyeOff } from "lucide-react"

import AdminNav from "@/components/admin/AdminNav"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Checkbox } from "@/components/ui/checkbox"

// 协议配置
interface ProtocolConfig {
  baseUrl: string
  enabled: boolean
}

type ProtocolsConfig = {
  openai?: ProtocolConfig
  anthropic?: ProtocolConfig
  gemini?: ProtocolConfig
}

interface Provider {
  id: string
  name: string
  protocols: ProtocolsConfig
  apiKey?: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// 协议选项
const PROTOCOL_OPTIONS = [
  { value: "openai", label: "OpenAI", defaultUrl: "https://api.openai.com/v1" },
  { value: "anthropic", label: "Anthropic", defaultUrl: "https://api.anthropic.com/v1" },
  { value: "gemini", label: "Google Gemini", defaultUrl: "https://generativelanguage.googleapis.com/v1" },
] as const

type ProtocolType = typeof PROTOCOL_OPTIONS[number]["value"]

const providerSchema = z.object({
  name: z.string().min(2, "名称至少需要 2 个字符"),
  apiKey: z.string().optional(),
  enabled: z.boolean(),
  // 协议配置
  protocols: z.object({
    openai: z.object({
      enabled: z.boolean(),
      baseUrl: z.string().url("请输入有效的 URL").optional(),
    }).optional(),
    anthropic: z.object({
      enabled: z.boolean(),
      baseUrl: z.string().url("请输入有效的 URL").optional(),
    }).optional(),
    gemini: z.object({
      enabled: z.boolean(),
      baseUrl: z.string().url("请输入有效的 URL").optional(),
    }).optional(),
  }).refine((protocols) => {
    // 至少启用一个协议
    return Object.values(protocols).some((p) => p?.enabled)
  }, {
    message: "至少需要启用一个协议",
  }),
})

type ProviderFormData = z.infer<typeof providerSchema>

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [showFormApiKey, setShowFormApiKey] = useState(false)

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null

  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: "",
      apiKey: "",
      enabled: true,
      protocols: {
        openai: { enabled: true, baseUrl: "https://api.openai.com/v1" },
        anthropic: { enabled: false, baseUrl: "https://api.anthropic.com/v1" },
        gemini: { enabled: false, baseUrl: "https://generativelanguage.googleapis.com/v1" },
      },
    },
  })

  const fetchProviders = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/providers", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setProviders(data.data)
      } else {
        toast.error("获取供应商列表失败")
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProviders()
  }, [])

  const onSubmit = async (data: ProviderFormData) => {
    try {
      // 过滤掉未启用的协议
      const enabledProtocols: ProtocolsConfig = {}
      Object.entries(data.protocols).forEach(([key, value]) => {
        if (value?.enabled && value.baseUrl) {
          enabledProtocols[key as ProtocolType] = {
            enabled: true,
            baseUrl: value.baseUrl,
          }
        }
      })

      const payload = {
        name: data.name,
        apiKey: data.apiKey || null,
        protocols: enabledProtocols,
        enabled: data.enabled,
      }

      const url = editingProvider
        ? `/api/providers/${editingProvider.id}`
        : "/api/providers"
      const method = editingProvider ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        toast.success(editingProvider ? "供应商已更新" : "供应商已创建")
        setDialogOpen(false)
        setEditingProvider(null)
        form.reset()
        fetchProviders()
      } else {
        const error = await response.json()
        toast.error(error.error || "操作失败")
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试")
    }
  }

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider)

    // 准备协议数据
    const protocols: ProviderFormData["protocols"] = {
      openai: provider.protocols.openai || { enabled: false, baseUrl: "https://api.openai.com/v1" },
      anthropic: provider.protocols.anthropic || { enabled: false, baseUrl: "https://api.anthropic.com/v1" },
      gemini: provider.protocols.gemini || { enabled: false, baseUrl: "https://generativelanguage.googleapis.com/v1" },
    }

    form.reset({
      name: provider.name,
      apiKey: provider.apiKey || "",
      enabled: provider.enabled,
      protocols,
    })
    setShowFormApiKey(false)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除供应商 "${name}" 吗？\n\n此操作不可撤销。`)) {
      return
    }

    try {
      const response = await fetch(`/api/providers/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        toast.success("供应商已删除")
        fetchProviders()
      } else {
        const error = await response.json()
        toast.error(error.error || "删除失败")
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试")
    }
  }

  const handleAddNew = () => {
    setEditingProvider(null)
    setShowFormApiKey(false)
    form.reset({
      name: "",
      apiKey: "",
      enabled: true,
      protocols: {
        openai: { enabled: true, baseUrl: "https://api.openai.com/v1" },
        anthropic: { enabled: false, baseUrl: "https://api.anthropic.com/v1" },
        gemini: { enabled: false, baseUrl: "https://generativelanguage.googleapis.com/v1" },
      },
    })
    setDialogOpen(true)
  }

  const filteredProviders = providers.filter((provider) =>
    provider.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 获取供应商支持的协议列表
  const getEnabledProtocols = (protocols: ProtocolsConfig) => {
    return Object.entries(protocols)
      .filter(([_, config]) => config.enabled)
      .map(([protocol]) => protocol)
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <main className="container mx-auto py-6 px-4">
        <div className="space-y-6">
          {/* 页面标题和操作栏 */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">供应商管理</h2>
              <p className="text-muted-foreground">
                管理所有 LLM 供应商配置
              </p>
            </div>
            <Button onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              添加供应商
            </Button>
          </div>

          {/* 搜索栏 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索供应商..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* 供应商列表 */}
          {loading ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  加载中...
                </div>
              </CardContent>
            </Card>
          ) : filteredProviders.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">
                    {searchQuery ? "没有找到匹配的供应商" : "还没有供应商"}
                  </p>
                  {!searchQuery && (
                    <Button onClick={handleAddNew} variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      添加第一个供应商
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
                      <TableHead>支持协议</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProviders.map((provider) => {
                      const enabledProtocols = getEnabledProtocols(provider.protocols)
                      return (
                        <TableRow key={provider.id}>
                          <TableCell>
                            <div className="font-medium">{provider.name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {provider.apiKey ? (
                                <>
                                  <code className="text-xs text-muted-foreground">
                                    {showApiKey[provider.id]
                                      ? provider.apiKey
                                      : "•".repeat(Math.min(provider.apiKey.length, 20))}
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() =>
                                      setShowApiKey((prev) => ({
                                        ...prev,
                                        [provider.id]: !prev[provider.id],
                                      }))
                                    }
                                  >
                                    {showApiKey[provider.id] ? (
                                      <EyeOff className="h-3 w-3" />
                                    ) : (
                                      <Eye className="h-3 w-3" />
                                    )}
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">未设置</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {enabledProtocols.map((protocol) => (
                                <Badge key={protocol} variant="outline" className="text-xs">
                                  {protocol}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={provider.enabled ? "default" : "destructive"}>
                              {provider.enabled ? "启用" : "禁用"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {new Date(provider.createdAt).toLocaleDateString("zh-CN")}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(provider)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(provider.id, provider.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* 添加/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? "编辑供应商" : "添加供应商"}
            </DialogTitle>
            <DialogDescription>
              {editingProvider
                ? "修改供应商配置信息"
                : "配置新的 LLM 供应商"}
            </DialogDescription>
          </DialogHeader>

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
                      <FormLabel>供应商名称 *</FormLabel>
                      <FormControl>
                        <Input placeholder="X-AIO API" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API 密钥</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            type={showFormApiKey ? "text" : "password"}
                            placeholder="sk-..."
                            {...field}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setShowFormApiKey(!showFormApiKey)}
                        >
                          {showFormApiKey ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <FormDescription>
                        供应商的 API 密钥（加密存储，所有协议共享）
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
                        <FormLabel>启用供应商</FormLabel>
                        <FormDescription>
                          禁用后此供应商将不会被路由使用
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

              {/* 协议配置 */}
              <div className="space-y-4 pt-4 border-t">
                <div>
                  <h4 className="text-sm font-medium">支持的协议 *</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    选择供应商支持的协议并配置对应的 API 地址
                  </p>
                </div>

                {PROTOCOL_OPTIONS.map((protocol) => (
                  <div key={protocol.value} className="border rounded-lg p-4 space-y-3">
                    <FormField
                      control={form.control}
                      name={`protocols.${protocol.value}.enabled`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="font-medium">
                              {protocol.label}
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    {form.watch(`protocols.${protocol.value}.enabled`) && (
                      <FormField
                        control={form.control}
                        name={`protocols.${protocol.value}.baseUrl`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API 地址</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={protocol.defaultUrl}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                ))}

                {form.formState.errors.protocols && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.protocols.message as string}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit">
                  {editingProvider ? "保存更改" : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
