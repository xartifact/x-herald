/**
 * 统一分页元数据 — page 模式（offset/limit + count）。
 * 用于实体列表（keys / potential-models 等）。
 *
 * 日志类大表（logs / intent-logs / routing-traces）使用 cursor 模式，
 * 不返回此结构。
 */
export interface Pagination {
  /** 当前页码，从 1 开始 */
  page: number
  /** 每页条数 */
  pageSize: number
  /** 符合筛选条件的总记录数 */
  total: number
  /** 总页数（至少为 1） */
  totalPages: number
}

/** 带分页元数据的列表响应 */
export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}
