/**
 * Next.js Instrumentation Hook
 * 在应用启动时执行，用于初始化数据库等全局资源
 *
 * 文档: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // 只在 Node.js 运行时加载，避免 Edge Runtime 报 Node.js 模块错误
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  }
}
