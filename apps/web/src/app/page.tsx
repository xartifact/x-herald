export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">
          x-llm-gateway
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
          Modern LLM Gateway with Smart Routing
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <a
            href="/admin/login"
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            🔐 管理员登录
          </a>
          <a
            href="/test-api"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            测试 API
          </a>
          <a
            href="/components-showcase"
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            组件展示
          </a>
          <a
            href="/dashboard"
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            控制台
          </a>
          <a
            href="/docs"
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
          >
            文档
          </a>
        </div>
      </div>
    </div>
  );
}
