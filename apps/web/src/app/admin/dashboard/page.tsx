'use client';

import AdminNav from '@/components/admin/AdminNav';

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">欢迎使用管理后台</h2>

          {/* 快速开始卡片 */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
            <a
              href="/admin/providers"
              className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-lg transition"
            >
              <div className="flex items-center">
                <div className="shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white text-2xl">
                    🔌
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    供应商管理
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    添加 OpenAI、Anthropic 等供应商
                  </p>
                </div>
              </div>
            </a>

            <a
              href="/admin/models"
              className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-lg transition"
            >
              <div className="flex items-center">
                <div className="shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-green-500 text-white text-2xl">
                    🤖
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    模型管理
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    配置 GPT-4、Claude 等模型
                  </p>
                </div>
              </div>
            </a>

            <a
              href="/admin/keys"
              className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-lg transition"
            >
              <div className="flex items-center">
                <div className="shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-purple-500 text-white text-2xl">
                    🔑
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    密钥管理
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    生成和管理虚拟密钥
                  </p>
                </div>
              </div>
            </a>
          </div>

          {/* 快速开始指南 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              快速开始指南
            </h3>
            <ol className="list-decimal list-inside space-y-3 text-gray-700">
              <li>
                <strong>添加供应商</strong> - 前往"供应商管理"，添加 OpenAI、Anthropic 等 LLM 提供商
              </li>
              <li>
                <strong>配置模型</strong> - 在"模型管理"中配置可用的模型（如 GPT-4、Claude-3）
              </li>
              <li>
                <strong>生成密钥</strong> - 在"密钥管理"中为终端用户生成虚拟密钥
              </li>
              <li>
                <strong>开始使用</strong> - 用户使用虚拟密钥调用 Gateway API
              </li>
            </ol>
          </div>

          {/* 系统状态 */}
          <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              系统状态
            </h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="inline-block h-2 w-2 bg-green-500 rounded-full mr-2"></span>
                <span className="text-gray-700">API 服务运行中</span>
              </div>
              <div className="flex items-center">
                <span className="inline-block h-2 w-2 bg-green-500 rounded-full mr-2"></span>
                <span className="text-gray-700">数据库连接正常</span>
              </div>
              <div className="mt-4">
                <a
                  href="/api/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  查看详细健康状态 →
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
