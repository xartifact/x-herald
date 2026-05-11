import fs from 'fs';
import path from 'path';

import { loadConfig } from '@/core/config';
import { createDatabase } from '@/core/db/client';
import { seedSystemData } from '@/core/db/seed';
import logger from '@/core/lib/logger';
import { registerDefaultTransformers } from '@/features/gateway';

logger.info('[Instrumentation] 开始应用初始化...');

// Dev 模式下防止多实例并发（PGlite 不支持多进程并发写入同一目录）
if (process.env.NODE_ENV !== 'production') {
  const lockPath = path.join(process.cwd(), '.xllm-server.pid');
  try {
    if (fs.existsSync(lockPath)) {
      const existingPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);
      if (existingPid !== process.pid) {
        try {
          process.kill(existingPid, 0);
          logger.error({ existingPid }, '[Instrumentation] 检测到另一个开发服务器实例正在运行，拒绝启动');
          process.stderr.write(
            `\n[x-llm-gateway] 启动失败：另一个开发服务器已在运行（PID: ${existingPid}）\n` +
            `  请先关闭它，或运行: kill ${existingPid}\n\n`
          );
          process.exit(1);
        } catch {
          fs.unlinkSync(lockPath);
        }
      }
    }
    fs.writeFileSync(lockPath, String(process.pid));
    const cleanup = () => { try { fs.unlinkSync(lockPath); } catch { /* ignore */ } };
    process.once('exit', cleanup);
    process.once('SIGINT', () => { cleanup(); process.exit(0); });
    process.once('SIGTERM', () => { cleanup(); process.exit(0); });
  } catch (err) {
    logger.warn({ err }, '[Instrumentation] 开发服务器锁文件操作失败，继续启动');
  }
}

// TLS 验证配置：在 Docker 容器内若遇到 ERR_TLS_CERT_ALTNAME_INVALID，可设置 PROVIDER_SKIP_TLS_VERIFY=true
// 此处设置 NODE_TLS_REJECT_UNAUTHORIZED 作用于 TLS/crypto 层，不受 Next.js fetch patch 影响
if (process.env.PROVIDER_SKIP_TLS_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  logger.warn('[Instrumentation] TLS 证书验证已禁用 (PROVIDER_SKIP_TLS_VERIFY=true)');
}

try {
  // 1. 注册协议转换器
  registerDefaultTransformers();
  logger.info('Transformers registered');

  // 2. 加载配置
  const config = loadConfig();

  // 3. 初始化数据库（包含迁移）
  await createDatabase(config.database);
  logger.info('Database initialized');

  // 4. 初始化系统内置数据
  await seedSystemData();
  logger.info('System seed data initialized');

  logger.info('[Instrumentation] 应用初始化完成');

  // Recover circuit breaker states from DB (non-blocking)
  import('@/features/gateway/services/circuit-breaker')
    .then(({ recoverCircuitBreakerState }) => recoverCircuitBreakerState())
    .catch(() => {});
} catch (error) {
  logger.error({ err: error }, '[Instrumentation] 应用初始化失败');
  process.exit(1);
}
