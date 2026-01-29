"use client"

import { Button } from "@/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/ui/card"
import { Input } from "@/ui/input"
import { Label } from "@/ui/label"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table"
import { Badge } from "@/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs"
import { Switch } from "@/ui/switch"
import { Checkbox } from "@/ui/checkbox"
import { Textarea } from "@/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert"
import { Separator } from "@/ui/separator"
import { toast } from "sonner"
import Link from "next/link"

export default function ComponentsShowcasePage() {
  return (
    <div className="container mx-auto py-10 space-y-8">
      {/* 页面标题 */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">shadcn/ui 组件展示</h1>
        <p className="text-muted-foreground">
          项目中已集成的所有 shadcn/ui 组件示例
        </p>
        <Link href="/" className="text-sm text-primary hover:underline">
          ← 返回首页
        </Link>
      </div>

      <Separator />

      {/* 按钮组件 */}
      <Card>
        <CardHeader>
          <CardTitle>按钮 (Button)</CardTitle>
          <CardDescription>各种样式和大小的按钮组件</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button>默认按钮</Button>
            <Button variant="destructive">危险按钮</Button>
            <Button variant="outline">轮廓按钮</Button>
            <Button variant="secondary">次要按钮</Button>
            <Button variant="ghost">幽灵按钮</Button>
            <Button variant="link">链接按钮</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">小按钮</Button>
            <Button size="default">默认大小</Button>
            <Button size="lg">大按钮</Button>
          </div>
        </CardContent>
      </Card>

      {/* 表单组件 */}
      <Card>
        <CardHeader>
          <CardTitle>表单组件</CardTitle>
          <CardDescription>输入框、选择器、开关等表单元素</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="text-input">文本输入框</Label>
              <Input id="text-input" placeholder="请输入内容" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="select">下拉选择器</Label>
              <Select>
                <SelectTrigger id="select">
                  <SelectValue placeholder="选择一个选项" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="option1">选项 1</SelectItem>
                  <SelectItem value="option2">选项 2</SelectItem>
                  <SelectItem value="option3">选项 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="textarea">多行文本框</Label>
            <Textarea id="textarea" placeholder="请输入多行内容" />
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="switch-demo" />
            <Label htmlFor="switch-demo">启用功能</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="checkbox-demo" />
            <Label htmlFor="checkbox-demo">同意条款和条件</Label>
          </div>
        </CardContent>
      </Card>

      {/* Toast 通知 */}
      <Card>
        <CardHeader>
          <CardTitle>Toast 通知 (Sonner)</CardTitle>
          <CardDescription>各种类型的消息提示</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
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
            <Button
              onClick={() =>
                toast("带操作的提示", {
                  action: {
                    label: "撤销",
                    onClick: () => toast.info("已撤销"),
                  },
                })
              }
              variant="outline"
            >
              带操作按钮
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 对话框 */}
      <Card>
        <CardHeader>
          <CardTitle>对话框 (Dialog)</CardTitle>
          <CardDescription>模态弹窗组件</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button>打开对话框</Button>
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
                  <Input id="name" defaultValue="张三" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="username" className="text-right">
                    用户名
                  </Label>
                  <Input
                    id="username"
                    defaultValue="@zhangsan"
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">保存修改</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* 选项卡 */}
      <Card>
        <CardHeader>
          <CardTitle>选项卡 (Tabs)</CardTitle>
          <CardDescription>内容切换组件</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="tab1" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="tab1">选项卡 1</TabsTrigger>
              <TabsTrigger value="tab2">选项卡 2</TabsTrigger>
              <TabsTrigger value="tab3">选项卡 3</TabsTrigger>
            </TabsList>
            <TabsContent value="tab1" className="space-y-2">
              <p className="text-sm">这是选项卡 1 的内容。</p>
            </TabsContent>
            <TabsContent value="tab2" className="space-y-2">
              <p className="text-sm">这是选项卡 2 的内容。</p>
            </TabsContent>
            <TabsContent value="tab3" className="space-y-2">
              <p className="text-sm">这是选项卡 3 的内容。</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 表格 */}
      <Card>
        <CardHeader>
          <CardTitle>表格 (Table)</CardTitle>
          <CardDescription>数据表格展示</CardDescription>
        </CardHeader>
        <CardContent>
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
              <TableRow>
                <TableCell className="font-medium">INV001</TableCell>
                <TableCell>
                  <Badge>已支付</Badge>
                </TableCell>
                <TableCell>信用卡</TableCell>
                <TableCell className="text-right">$250.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">INV002</TableCell>
                <TableCell>
                  <Badge variant="secondary">待支付</Badge>
                </TableCell>
                <TableCell>PayPal</TableCell>
                <TableCell className="text-right">$150.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">INV003</TableCell>
                <TableCell>
                  <Badge variant="destructive">未支付</Badge>
                </TableCell>
                <TableCell>银行转账</TableCell>
                <TableCell className="text-right">$350.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 警告框 */}
      <Alert>
        <AlertTitle>提示</AlertTitle>
        <AlertDescription>
          这是一个信息提示框，用于向用户展示重要信息。
        </AlertDescription>
      </Alert>

      {/* 徽章 */}
      <Card>
        <CardHeader>
          <CardTitle>徽章 (Badge)</CardTitle>
          <CardDescription>状态标签组件</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge>默认</Badge>
            <Badge variant="secondary">次要</Badge>
            <Badge variant="destructive">危险</Badge>
            <Badge variant="outline">轮廓</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
