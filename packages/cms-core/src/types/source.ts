/**
 * 视频源配置
 */
export interface VideoSource {
  /** 唯一标识 */
  id: string
  /** 源名称 */
  name: string
  /** 搜索API基础地址 */
  url: string
  /** 详情API基础地址（可选，默认使用url） */
  detailUrl?: string
  /** 请求超时时间（毫秒） */
  timeout?: number
  /** 重试次数 */
  retry?: number
  /** 是否启用 */
  isEnabled: boolean
  /** 最后更新时间 */
  updatedAt?: Date
  /** 是否来自系统环境变量（随 upstream GitHub 动态更新与淘汰） */
  isEnv?: boolean
  /** 是否为限制级/NSFW 源 */
  isNsfw?: boolean
}

/**
 * 视频源存储
 */
export interface SourceStore {
  sources: VideoSource[]
  version: number
}

/**
 * 创建空的源存储
 */
export function createEmptySourceStore(): SourceStore {
  return {
    sources: [],
    version: 1,
  }
}
