import { loadConfig } from '@/core/config';
import { createDatabase } from '@/core/db/client';
import { seedSystemData } from '@/core/db/seed';
import logger from '@/core/lib/logger';
import { registerDefaultTransformers } from '@/features/gateway';

logger.info('[Instrumentation] 开始应用初始化...');

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
} catch (error) {
  logger.error({ err: error }, '[Instrumentation] 应用初始化失败');
  process.exit(1);
}
