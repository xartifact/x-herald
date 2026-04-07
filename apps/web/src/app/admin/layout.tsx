'use client';

import { useEffect, useState, useCallback } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import AdminNav from '@/components/admin/AdminNav';
import { useAuthMe } from '@/features/auth/useAuth';
import { useRenderCount } from '@/hooks/use-render-count';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useRenderCount('AdminLayout', true);

  const router = useRouter();
  const pathname = usePathname();
  const [shouldVerify, setShouldVerify] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // 登录页不需要验证
  const isLoginPage = pathname === '/admin/login';

  // 使用 useCallback 稳定函数引用
  const redirectToLogin = useCallback(() => {
    router.push('/admin/login');
  }, [router]);

  useEffect(() => {
    // 只在客户端执行
    if (typeof window === 'undefined') return;

    if (!isLoginPage) {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        redirectToLogin();
      } else {
        setShouldVerify(true);
      }
    }
    setIsChecking(false);
  }, [isLoginPage, redirectToLogin]);

  // 使用 useAuthMe 验证 token
  const { isLoading, isError } = useAuthMe({
    enabled: shouldVerify && !isLoginPage,
  });

  useEffect(() => {
    if (shouldVerify && !isLoginPage && isError) {
      localStorage.removeItem('admin_token');
      redirectToLogin();
    }
  }, [isError, shouldVerify, isLoginPage, redirectToLogin]);

  // 登录页直接渲染
  if (isLoginPage) {
    return <>{children}</>;
  }

  // 初始检查或验证中显示加载状态
  if (isChecking || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在验证身份...</p>
        </div>
      </div>
    );
  }

  // 已验证用户 - 渲染带导航的布局
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="container mx-auto py-6 px-4">
        {children}
      </main>
    </div>
  );
}
