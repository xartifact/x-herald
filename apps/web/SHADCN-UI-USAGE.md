# shadcn/ui 使用指南

## 已安装的组件

项目已成功集成 shadcn/ui，以下组件可直接使用：

### 基础组件
- **Button** - 按钮组件（多种样式变体）
- **Input** - 输入框
- **Label** - 标签
- **Textarea** - 多行文本框
- **Badge** - 徽章标签
- **Separator** - 分割线

### 表单组件
- **Form** - 表单容器（基于 react-hook-form）
- **Checkbox** - 复选框
- **Switch** - 开关
- **Select** - 下拉选择框

### 布局组件
- **Card** - 卡片容器
- **Table** - 表格
- **Tabs** - 选项卡
- **Dialog** - 对话框/模态框
- **Dropdown Menu** - 下拉菜单

### 反馈组件
- **Alert** - 警告提示框
- **Sonner** - Toast 通知（推荐替代 toast）

---

## 基本用法

### 1. 按钮 (Button)

```tsx
import { Button } from "@/components/ui/button"

export default function Example() {
  return (
    <div className="flex gap-2">
      <Button>默认按钮</Button>
      <Button variant="destructive">危险按钮</Button>
      <Button variant="outline">轮廓按钮</Button>
      <Button variant="secondary">次要按钮</Button>
      <Button variant="ghost">幽灵按钮</Button>
      <Button variant="link">链接按钮</Button>
      <Button size="sm">小按钮</Button>
      <Button size="lg">大按钮</Button>
    </div>
  )
}
```

### 2. 表单 (Form + Input)

```tsx
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
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

const formSchema = z.object({
  username: z.string().min(2, {
    message: "用户名至少需要 2 个字符。",
  }),
  email: z.string().email({
    message: "请输入有效的邮箱地址。",
  }),
})

export default function ProfileForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      email: "",
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>用户名</FormLabel>
              <FormControl>
                <Input placeholder="输入用户名" {...field} />
              </FormControl>
              <FormDescription>
                这是您的公开显示名称。
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>邮箱</FormLabel>
              <FormControl>
                <Input type="email" placeholder="输入邮箱" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">提交</Button>
      </form>
    </Form>
  )
}
```

### 3. 卡片 (Card)

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function CardExample() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>卡片标题</CardTitle>
        <CardDescription>卡片描述信息</CardDescription>
      </CardHeader>
      <CardContent>
        <p>这里是卡片的主要内容。</p>
      </CardContent>
      <CardFooter>
        <Button>操作按钮</Button>
      </CardFooter>
    </Card>
  )
}
```

### 4. 对话框 (Dialog)

```tsx
"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function DialogExample() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">打开对话框</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>编辑资料</DialogTitle>
          <DialogDescription>
            在这里修改您的个人资料，完成后点击保存。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              姓名
            </Label>
            <Input id="name" value="张三" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              用户名
            </Label>
            <Input id="username" value="@zhangsan" className="col-span-3" />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">保存修改</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 5. 表格 (Table)

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default function TableExample() {
  const invoices = [
    { id: "INV001", status: "已支付", method: "信用卡", amount: "$250.00" },
    { id: "INV002", status: "待支付", method: "PayPal", amount: "$150.00" },
    { id: "INV003", status: "未支付", method: "银行转账", amount: "$350.00" },
  ]

  return (
    <Table>
      <TableCaption>最近的发票列表</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>发票号</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>支付方式</TableHead>
          <TableHead className="text-right">金额</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium">{invoice.id}</TableCell>
            <TableCell>
              <Badge variant={invoice.status === "已支付" ? "default" : "secondary"}>
                {invoice.status}
              </Badge>
            </TableCell>
            <TableCell>{invoice.method}</TableCell>
            <TableCell className="text-right">{invoice.amount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### 6. Toast 通知 (Sonner)

**步骤 1：在根布局中添加 Toaster**

```tsx
// app/layout.tsx
import { Toaster } from "@/components/ui/sonner"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
```

**步骤 2：在组件中使用**

```tsx
"use client"

import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function ToastExample() {
  return (
    <div className="flex gap-2">
      <Button
        onClick={() =>
          toast.success("操作成功", {
            description: "您的更改已保存。",
          })
        }
      >
        成功提示
      </Button>
      <Button
        onClick={() =>
          toast.error("操作失败", {
            description: "发生了一个错误，请重试。",
          })
        }
        variant="destructive"
      >
        错误提示
      </Button>
      <Button
        onClick={() =>
          toast.info("提示信息", {
            description: "这是一条普通的提示信息。",
          })
        }
        variant="secondary"
      >
        信息提示
      </Button>
    </div>
  )
}
```

### 7. 下拉选择 (Select)

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function SelectExample() {
  return (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="选择一个选项" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">浅色主题</SelectItem>
        <SelectItem value="dark">深色主题</SelectItem>
        <SelectItem value="system">跟随系统</SelectItem>
      </SelectContent>
    </Select>
  )
}
```

### 8. 开关 (Switch)

```tsx
"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export default function SwitchExample() {
  return (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">飞行模式</Label>
    </div>
  )
}
```

---

## 管理后台集成建议

对于 `/admin` 后台页面，建议使用以下组件组合：

### 供应商/模型管理页面
- **Table** - 数据列表展示
- **Dialog** - 添加/编辑表单弹窗
- **Form + Input** - 表单字段
- **Badge** - 状态标签
- **Button** - 操作按钮
- **Dropdown Menu** - 更多操作菜单
- **Sonner** - 操作成功/失败提示

### Dashboard 页面
- **Card** - 统计卡片
- **Tabs** - 内容切换
- **Alert** - 重要提示信息
- **Separator** - 内容分割

---

## 主题配置

项目已配置深色模式支持，可在 `globals.css` 中自定义主题颜色：

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    /* ... 更多颜色变量 */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... 深色模式颜色 */
  }
}
```

---

## 添加更多组件

如需添加其他 shadcn/ui 组件：

```bash
bunx shadcn@latest add [component-name]
```

查看所有可用组件：https://ui.shadcn.com/docs/components
