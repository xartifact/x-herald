'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 如果是登录页，跳过验证
    if (pathname === '/admin/login') {
      setIsLoading(false);
      return;
    }

    // 验证 token
    const verifyAuth = async () => {
      const token = localStorage.getItem('admin_token');

      if (!token) {
        router.push('/admin/login');
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem('admin_token');
          router.push('/admin/login');
          return;
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Auth verification failed:', error);
        localStorage.removeItem('admin_token');
        router.push('/admin/login');
      }
    };

    verifyAuth();
  }, [pathname, router]);

  // 登录页直接渲染
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // 其他页面显示加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在验证身份...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
