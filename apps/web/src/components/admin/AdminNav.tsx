'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useLogout } from '@/features/auth/useAuth';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { LogOut, ChevronDown, LayoutDashboard, Server, Brain, Key, FileText, BarChart3, Settings, Layers } from 'lucide-react';
import { cn } from '@/core/lib/utils';

// 导航项类型
interface NavItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

interface NavGroup {
  label: string;
  icon?: React.ReactNode;
  items: NavItem[];
}

// 导航配置
const navGroups: NavGroup[] = [
  {
    label: '概览',
    icon: <LayoutDashboard className="h-4 w-4" />,
    items: [
      { href: '/admin/dashboard', label: '控制台', icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
  {
    label: '配置管理',
    icon: <Settings className="h-4 w-4" />,
    items: [
      { href: '/admin/providers', label: '供应商', icon: <Server className="h-4 w-4" /> },
      { href: '/admin/model-groups', label: '模型组', icon: <Layers className="h-4 w-4" /> },
      { href: '/admin/keys', label: '密钥', icon: <Key className="h-4 w-4" /> },
    ],
  },
  {
    label: '监控分析',
    icon: <BarChart3 className="h-4 w-4" />,
    items: [
      { href: '/admin/logs', label: '请求日志', icon: <FileText className="h-4 w-4" /> },
    ],
  },
];

// 扁平化所有导航项用于渲染
const allNavItems = navGroups.flatMap(group => group.items);

export default function AdminNav() {
  const pathname = usePathname();
  const logout = useLogout();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const handleLogout = () => {
    logout.mutate();
  };

  // 检查当前路径是否在组内
  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'));
  };

  // 检查当前路径是否匹配导航项
  const isItemActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                x-llm-gateway
              </h1>
            </div>

            {/* 桌面端导航 */}
            <div className="hidden md:ml-6 md:flex md:space-x-2">
              {navGroups.map((group) => (
                <DropdownMenu
                  key={group.label}
                  open={openDropdown === group.label}
                  onOpenChange={(open) => setOpenDropdown(open ? group.label : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                        isGroupActive(group)
                          ? "text-primary bg-primary/10"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      )}
                    >
                      {group.icon && <span className="mr-2">{group.icon}</span>}
                      {group.label}
                      <ChevronDown className="ml-1 h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {group.items.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center cursor-pointer",
                            isItemActive(item.href) && "bg-primary/10 text-primary"
                          )}
                          onClick={() => setOpenDropdown(null)}
                        >
                          {item.icon && <span className="mr-2">{item.icon}</span>}
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ))}
            </div>

            {/* 移动端导航 */}
            <div className="md:hidden ml-4 flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                    菜单
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {navGroups.map((group) => (
                    <div key={group.label}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {group.label}
                      </div>
                      {group.items.map((item) => (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center cursor-pointer",
                              isItemActive(item.href) && "bg-primary/10 text-primary"
                            )}
                          >
                            {item.icon && <span className="mr-2">{item.icon}</span>}
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* 当前页面标题 */}
            <span className="hidden md:block text-sm text-muted-foreground">
              {allNavItems.find(item => isItemActive(item.href))?.label}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={logout.isPending}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {logout.isPending ? '退出中...' : '退出'}
            </Button>
          </div>
        </div>
      </div>

      {/* 移动端二级导航栏 - 显示当前组的所有选项 */}
      <div className="md:hidden border-t bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-4 py-2 overflow-x-auto">
            {navGroups
              .filter(group => isGroupActive(group))
              .flatMap(group => group.items)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap",
                    isItemActive(item.href)
                      ? "bg-primary text-white"
                      : "text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {item.label}
                </Link>
              ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
