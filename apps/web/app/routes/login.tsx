import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@xartifact/x-herald-ui'
import { useLogin } from '@xartifact/x-herald-ui'
import { LogIn, Monitor, Moon, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@xartifact/x-herald-ui'

export function LoginPage() {
  const { resolvedTheme, setTheme } = useTheme()
  const [password, setPassword] = useState('')

  const navigate = useNavigate()
  const login = useLogin()

  // 检查是否已登录
  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      navigate({ to: '/admin' })
    }
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await login.mutateAsync(password)
    navigate({ to: '/admin' })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background">
      <div className="absolute top-4 right-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="切换主题">
              {resolvedTheme === 'dark' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="mr-2 h-4 w-4" />
              亮色
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="mr-2 h-4 w-4" />
              暗色
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="mr-2 h-4 w-4" />
              跟随系统
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Card className="w-96">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">管理员登录</CardTitle>
          <CardDescription>登录 x-herald 管理后台</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="grid gap-4">
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
                  disabled={login.isPending}
                />
              </div>
              {!!login.error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {login.error instanceof Error ? login.error.message : '登录失败'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <p className="text-sm text-muted-foreground text-center">
              提示：管理员密码在 .env 文件中配置
            </p>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? (
                '登录中...'
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  登录
                </>
              )}
            </Button>
            <Button variant="link" className="text-sm" asChild>
              <a href="/">返回首页</a>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
