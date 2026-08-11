import { Activity, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../../../shared/components/ui/button'
import { useTestInstance } from '../hooks'

interface InstanceTestButtonProps {
  instanceId: string
  instanceName?: string
}

/**
 * 实例清单上的一键"测试"按钮：调用后端 POST /instances/:id/test 探测模型连通性
 * 与可用性，以 toast 展示结果（延迟、响应片段或失败原因）。
 */
export function InstanceTestButton({ instanceId, instanceName }: InstanceTestButtonProps) {
  const testInstance = useTestInstance()
  const pending = testInstance.isPending

  const handleClick = () => {
    testInstance.mutate(instanceId, {
      onSuccess: (result) => {
        const label = instanceName ? `${instanceName} · ` : ''
        if (result.ok) {
          toast.success(
            `${label}连通正常 · ${result.latencyMs}ms${result.snippet ? ` · ${result.snippet}` : ''}`,
          )
        } else {
          toast.error(`${label}${result.message}`)
        }
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handleClick}
      disabled={pending}
      title="测试模型连通性与可用性"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Activity className="h-3.5 w-3.5 text-success" />
      )}
    </Button>
  )
}
