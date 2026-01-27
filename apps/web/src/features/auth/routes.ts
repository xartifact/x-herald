import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { loadConfig } from '@x-llm-gateway/config';
import logger from '../../lib/logger';

const authRoutes = new Hono();
const config = loadConfig();

// 简单的密码验证（后续可以改为数据库）
const ADMIN_PASSWORD = config.admin.password;

// POST /api/auth/login - 管理员登录
authRoutes.post('/login', async (c) => {
  try {
    const { password } = await c.req.json();

    // 验证密码
    if (!password || password !== ADMIN_PASSWORD) {
      return c.json(
        {
          error: 'Invalid password',
          code: 'INVALID_CREDENTIALS',
        },
        401
      );
    }

    // 生成 JWT token
    const token = await sign(
      {
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7天过期
      },
      config.admin.password, // 使用密码作为 secret（生产环境应该用独立的 JWT_SECRET）
      'HS256' // 显式指定算法
    );

    logger.info('Admin logged in successfully');

    return c.json({
      success: true,
      token,
      expiresIn: 60 * 60 * 24 * 7,
    });
  } catch (error) {
    logger.error({ error }, 'Login error');
    return c.json(
      {
        error: 'Login failed',
        code: 'LOGIN_ERROR',
      },
      500
    );
  }
});

// POST /api/auth/logout - 登出（客户端删除 token）
authRoutes.post('/logout', async (c) => {
  return c.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// GET /api/auth/me - 获取当前用户信息
authRoutes.get('/me', async (c) => {
  try {
    // 从 header 获取 token
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(
        {
          error: 'Missing or invalid authorization header',
          code: 'UNAUTHORIZED',
        },
        401
      );
    }

    const token = authHeader.substring(7);

    // 验证 token
    const payload = await verify(token, config.admin.password, 'HS256');

    return c.json({
      role: payload.role,
      authenticated: true,
    });
  } catch (error) {
    logger.error({ error }, 'Token verification error');
    return c.json(
      {
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      },
      401
    );
  }
});

export default authRoutes;
