'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Lock, Download, Play, Square, RefreshCw, Copy, CheckCircle, AlertCircle } from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Separator,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@x-llm-gateway/ui'

interface MitmStatus {
  running: boolean
  port: number
  activeConnections: number
  interceptedDomains: string[]
}

interface CaFingerprint {
  fingerprint: string
  algorithm: string
}

async function fetchStatus(): Promise<MitmStatus> {
  const res = await fetch('/api/mitm/status')
  if (!res.ok) throw new Error('Failed to fetch status')
  return res.json()
}

async function fetchFingerprint(): Promise<CaFingerprint> {
  const res = await fetch('/api/mitm/ca-fingerprint')
  if (!res.ok) throw new Error('Failed to fetch fingerprint')
  return res.json()
}

async function startProxy(port: number): Promise<MitmStatus> {
  const res = await fetch('/api/mitm/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Start failed' }))
    throw new Error(err.error || 'Start failed')
  }
  return res.json()
}

async function stopProxy(): Promise<MitmStatus> {
  const res = await fetch('/api/mitm/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Stop failed' }))
    throw new Error(err.error || 'Stop failed')
  }
  return res.json()
}

function downloadCaCert() {
  window.open('/api/mitm/ca-cert', '_blank')
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 w-8 p-0">
      {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  )
}

export function MitmPage() {
  const [proxyPort, setProxyPort] = useState(8443)
  const queryClient = useQueryClient()

  const statusQuery = useQuery<MitmStatus, Error>({
    queryKey: ['mitm-status'],
    queryFn: fetchStatus,
    refetchInterval: 5000,
  })

  const fingerprintQuery = useQuery<CaFingerprint, Error>({
    queryKey: ['mitm-fingerprint'],
    queryFn: fetchFingerprint,
  })

  const startMutation = useMutation<MitmStatus, Error, number>({
    mutationFn: startProxy,
    onSuccess: () => {
      toast.success('MITM 代理已启动')
      queryClient.invalidateQueries({ queryKey: ['mitm-status'] })
    },
    onError: (error) => {
      toast.error('启动失败', { description: error.message })
    },
  })

  const stopMutation = useMutation<MitmStatus, Error, void>({
    mutationFn: stopProxy,
    onSuccess: () => {
      toast.success('MITM 代理已停止')
      queryClient.invalidateQueries({ queryKey: ['mitm-status'] })
    },
    onError: (error: Error) => {
      toast.error('停止失败', { description: error.message })
    },
  })

  const status = statusQuery.data
  const isRunning = status?.running ?? false
  const isPending = startMutation.isPending || stopMutation.isPending

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Lock className="h-8 w-8" />
          MITM 代理
        </h1>
        <p className="text-muted-foreground mt-1">
          HTTPS 流量拦截与证书管理，用于捕获桌面应用（Cursor、Claude Desktop 等）的 API 请求
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>代理状态</CardTitle>
          <CardDescription>MITM 代理运行状态与连接信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">状态</span>
              <Badge variant={isRunning ? 'default' : 'secondary'}>
                {isRunning ? '运行中' : '已停止'}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusQuery.refetch()}
              disabled={statusQuery.isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${statusQuery.isFetching ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>

          {status && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-muted rounded-lg p-3">
                <div className="text-muted-foreground">监听端口</div>
                <div className="text-lg font-semibold">{status.port}</div>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <div className="text-muted-foreground">活跃连接</div>
                <div className="text-lg font-semibold">{status.activeConnections}</div>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <div className="text-muted-foreground">拦截域名</div>
                <div className="text-lg font-semibold">{status.interceptedDomains.length}</div>
              </div>
            </div>
          )}

          {status && status.interceptedDomains.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">当前拦截的域名</div>
              <div className="flex flex-wrap gap-2">
                {status.interceptedDomains.map((domain) => (
                  <Badge key={domain} variant="outline">{domain}</Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">端口</span>
              <input
                type="number"
                value={proxyPort}
                onChange={(e) => setProxyPort(Number(e.target.value))}
                disabled={isRunning || isPending}
                className="w-24 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {!isRunning ? (
              <Button
                onClick={() => startMutation.mutate(proxyPort)}
                disabled={isPending}
              >
                <Play className="mr-2 h-4 w-4" />
                {startMutation.isPending ? '启动中...' : '启动代理'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => stopMutation.mutate()}
                disabled={isPending}
              >
                <Square className="mr-2 h-4 w-4" />
                {stopMutation.isPending ? '停止中...' : '停止代理'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* CA Certificate Card */}
      <Card>
        <CardHeader>
          <CardTitle>CA 证书</CardTitle>
          <CardDescription>
            下载并安装 CA 根证书到系统信任存储，以允许 MITM 代理解密 HTTPS 流量
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>安全提示</AlertTitle>
            <AlertDescription>
              CA 证书仅用于本地 HTTPS 拦截。请勿在不受信任的网络中共享此证书。
              安装后，浏览器和系统应用将信任由该 CA 签名的所有证书。
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-2">
            <Button onClick={downloadCaCert} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              下载 CA 证书
            </Button>
          </div>

          {fingerprintQuery.data && (
            <div className="bg-muted rounded-lg p-3">
              <div className="text-sm text-muted-foreground mb-1">
                证书指纹 ({fingerprintQuery.data.algorithm})
              </div>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono break-all">{fingerprintQuery.data.fingerprint}</code>
                <CopyButton text={fingerprintQuery.data.fingerprint} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installation Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>安装指南</CardTitle>
          <CardDescription>在不同操作系统中安装 CA 证书的方法</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-sm">macOS</h3>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 mt-1">
                <li>双击下载的 <code>x-llm-gateway-ca.crt</code> 文件</li>
                <li>在“钥匙串访问”中，找到证书并双击</li>
                <li>展开“信任”部分，将“使用此证书时”设置为“始终信任”</li>
                <li>关闭窗口并输入管理员密码确认</li>
                <li>或在终端运行：<code className="bg-muted px-1 rounded">sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/Downloads/x-llm-gateway-ca.crt</code></li>
              </ol>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-sm">Windows</h3>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 mt-1">
                <li>双击下载的 <code>x-llm-gateway-ca.crt</code> 文件</li>
                <li>点击“安装证书”</li>
                <li>选择“本地计算机”，点击“下一步”</li>
                <li>选择“将所有的证书都放入下列存储”</li>
                <li>浏览并选择“受信任的根证书颁发机构”</li>
                <li>点击“完成”并确认安全警告</li>
              </ol>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-sm">Linux</h3>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 mt-1">
                <li>将证书复制到系统证书目录：</li>
                <li>
                  <code className="bg-muted px-1 rounded">
                    sudo cp x-llm-gateway-ca.crt /usr/local/share/ca-certificates/
                  </code>
                </li>
                <li>更新证书存储：</li>
                <li>
                  <code className="bg-muted px-1 rounded">sudo update-ca-certificates</code>
                </li>
                <li>对于 Firefox/Chrome，还需在浏览器设置中手动导入证书</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application Setup */}
      <Card>
        <CardHeader>
          <CardTitle>应用配置</CardTitle>
          <CardDescription>在桌面应用中配置 HTTP 代理</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-sm">Cursor</h3>
              <p className="text-sm text-muted-foreground mt-1">
                在 Cursor 设置中配置代理：Settings → Proxy → HTTP Proxy，设置为 <code className="bg-muted px-1 rounded">http://localhost:{isRunning ? status?.port : 8443}</code>
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-sm">Claude Desktop</h3>
              <p className="text-sm text-muted-foreground mt-1">
                编辑配置文件：
                <code className="bg-muted px-1 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code>
                （macOS）或相应路径（Windows/Linux）
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                添加环境变量：<code className="bg-muted px-1 rounded">HTTP_PROXY=http://localhost:{isRunning ? status?.port : 8443}</code>
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-sm">全局系统代理</h3>
              <p className="text-sm text-muted-foreground mt-1">
                也可以在系统网络设置中配置全局 HTTP 代理，让所有应用流量都经过网关：
                <code className="bg-muted px-1 rounded">http://localhost:{isRunning ? status?.port : 8443}</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
