import { UseFormReturn } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../shared/components/ui/form'
import { Input } from '../../../shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/components/ui/select'

// Record<string, any> defined locally // TODO(6): from apps/web

interface GroupBasicFieldsProps {
  form: UseFormReturn<Record<string, any>>
}

export function GroupBasicFields({ form }: GroupBasicFieldsProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">基本信息</h4>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>模型组名称 *</FormLabel>
              <FormControl>
                <Input placeholder="gpt-4" {...field} />
              </FormControl>
              <FormDescription>用于 API 调用的唯一标识</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>显示名称 *</FormLabel>
              <FormControl>
                <Input placeholder="GPT-4" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="aliases"
        render={({ field }) => (
          <FormItem>
            <FormLabel>别名</FormLabel>
            <FormControl>
              <Input placeholder="gpt4, openai-gpt-4" {...field} />
            </FormControl>
            <FormDescription>多个别名用逗号分隔，别名和模型名称一样可用于 API 调用</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>描述</FormLabel>
            <FormControl>
              <Input placeholder="模型组描述..." {...field} />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>类别</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="chat">对话</SelectItem>
                <SelectItem value="embedding">嵌入</SelectItem>
                <SelectItem value="image">图像</SelectItem>
                <SelectItem value="audio">音频</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
    </div>
  )
}
