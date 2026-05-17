/**
 * API 客户端 - 统一的 HTTP 请求封装
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`API Error: ${status} ${statusText}`)
    this.name = 'ApiError'
  }
}

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean
  params?: Record<string, string | number | boolean | undefined>
  /**
   * 是否提取嵌套的 data 字段。
   * - true: 返回 response.data（兼容旧接口）
   * - false: 返回完整 response（用于包含 pagination 等元数据的接口）
   * 默认: true
   */
  extractData?: boolean
}

/**
 * 通用请求函数
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { requiresAuth = true, headers = {}, params, extractData = true, ...fetchOptions } = options

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  }

  // 自动添加认证 token
  if (requiresAuth && typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_token')
    if (token) {
      finalHeaders['Authorization'] = `Bearer ${token}`
    }
  }

  // 构建 URL（包含查询参数）
  let url = endpoint
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value))
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      url = `${endpoint}?${queryString}`
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: finalHeaders,
  })

  // 处理错误响应
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(response.status, response.statusText, errorData)
  }

  // 处理 204 No Content
  if (response.status === 204) {
    return {} as T
  }

  const data = await response.json()

  // 根据 extractData 选项决定是否提取嵌套的 data 字段
  if (extractData) {
    return data.data ?? data
  }
  return data
}

/**
 * GET 请求
 */
export function get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  return request<T>(endpoint, { ...options, method: 'GET' })
}

/**
 * POST 请求
 */
export function post<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return request<T>(endpoint, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * PUT 请求
 */
export function put<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return request<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/**
 * DELETE 请求
 */
export function del<T>(
  endpoint: string,
  options?: RequestOptions
): Promise<T> {
  return request<T>(endpoint, { ...options, method: 'DELETE' })
}

/**
 * PATCH 请求
 */
export function patch<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return request<T>(endpoint, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
