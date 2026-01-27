"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LogIn } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function AdminLogin() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)

  // 检查是否已登录（只检查一次）
  useEffect(() => {
    const token = localStorage.getItem("admin_token")

    if (token && !isRedirecting) {
      setIsRedirecting(true)
      router.push("/admin/dashboard")
    }
  }, [isRedirecting, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMsg = data.error || "登录失败"
        setError(errorMsg)
        toast.error(errorMsg)
        return
      }

      // 保存 token
      localStorage.setItem("admin_token", data.token)

      // 显示成功提示
      toast.success("登录成功，正在跳转...")

      // 设置跳转标志并使用 router.push
      setIsRedirecting(true)

      // 使用 setTimeout 确保状态更新后再跳转
      setTimeout(() => {
        router.push("/admin/dashboard")
      }, 100)
    } catch (err) {
      const errorMsg = "网络错误,请检查连接"
      setError(errorMsg)
      toast.error(errorMsg)
      console.error("登录错误:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">管理员登录</CardTitle>
            <CardDescription>
              登录 x-llm-gateway 管理后台
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">管理员密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入管理员密码"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>登录中...</>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" />
                    登录
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-2">
            <p className="text-sm text-muted-foreground text-center">
              提示：管理员密码在 .env 文件中配置
            </p>
            <Button variant="link" asChild className="text-sm">
              <a href="/">返回首页</a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
