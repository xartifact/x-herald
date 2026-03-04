import { loadConfig } from '@/core/config';
import { createDatabase } from '@/core/db/client';
import { registerDefaultTransformers } from '@/features/gateway';
import logger from '@/core/lib/logger';

console.log('[Instrumentation] 开始应用初始化...');

// TLS 验证配置：在 Docker 容器内若遇到 ERR_TLS_CERT_ALTNAME_INVALID，可设置 PROVIDER_SKIP_TLS_VERIFY=true
// 此处设置 NODE_TLS_REJECT_UNAUTHORIZED 作用于 TLS/crypto 层，不受 Next.js fetch patch 影响
if (process.env.PROVIDER_SKIP_TLS_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('[Instrumentation] TLS 证书验证已禁用 (PROVIDER_SKIP_TLS_VERIFY=true)');
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

  console.log('[Instrumentation] 应用初始化完成');
} catch (error) {
  console.error('[Instrumentation] 应用初始化失败:', error);
  process.exit(1);
}
