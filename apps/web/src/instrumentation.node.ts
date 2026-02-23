import { loadConfig } from '@/core/config';
import { createDatabase } from '@/core/db/client';
import { registerDefaultTransformers } from '@/features/gateway';
import logger from '@/core/lib/logger';

console.log('[Instrumentation] 开始应用初始化...');

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
