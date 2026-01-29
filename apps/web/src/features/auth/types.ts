/**
 * Auth 相关类型定义
 */

export interface AuthResponse {
  token: string;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user?: {
    role: string;
  };
}
