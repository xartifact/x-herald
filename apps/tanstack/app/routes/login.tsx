import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@x-llm-gateway/ui'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@x-llm-gateway/ui'
import { Input } from '@x-llm-gateway/ui'
import { Label } from '@x-llm-gateway/ui'
import { LogIn } from 'lucide-react'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (data.token) {
        localStorage.setItem('admin_token', data.token)
        router.navigate({ to: '/admin/dashboard' })
      } else {
        setError('Login failed')
      }
    } catch {
      setError('Connection failed')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>x-llm-gateway</CardTitle>
          <CardDescription>输入管理密码以登录</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入管理密码"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full">
              <LogIn className="mr-2 h-4 w-4" /> 登录
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
