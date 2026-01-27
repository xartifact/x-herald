#!/usr/bin/env bun

/**
 * 测试数据库初始化功能
 *
 * 使用方法:
 * bun run packages/database/test-init.ts
 */

import { createDatabase, closeDatabase } from './src/client';

async function testDatabaseInit() {
  console.log('🧪 开始测试数据库初始化...\n');

  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'llm_gateway',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
  };

  console.log('📋 数据库配置:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   User: ${config.user}`);
  console.log(`   SSL: ${config.ssl}\n`);

  try {
    // 创建数据库连接（会自动初始化）
    const db = createDatabase(config);

    // 等待初始化完成
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log('\n✅ 数据库初始化测试完成');
    console.log('ℹ️  你可以使用 psql 连接数据库验证表是否创建成功:');
    console.log(`   psql -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database}`);
    console.log(`   \\dt  -- 查看所有表`);

    // 关闭连接
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

testDatabaseInit();
