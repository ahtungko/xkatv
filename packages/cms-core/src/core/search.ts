import type {
  VideoItem,
  VideoSource,
  SearchResult,
  Pagination,
  RequestAdapter,
  ProxyStrategy,
  ApiPathConfig,
} from '../types'

import { buildSearchUrl } from '../utils/url'
import { normalizeVodId } from '../utils/video'

/**
 * 搜索配置
 */
export interface SearchConfig {
  requestAdapter: RequestAdapter
  proxyStrategy: ProxyStrategy
  apiConfig: ApiPathConfig
}

/**
 * 单源搜索
 * @param query 搜索关键词
 * @param source 视频源
 * @param config 搜索配置
 */
export async function searchVideos(
  query: string,
  source: VideoSource,
  config: SearchConfig,
  page: number = 1,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const { requestAdapter, proxyStrategy, apiConfig } = config

  try {
    if (!query) {
      return {
        success: false,
        items: [],
        error: '缺少搜索参数',
      }
    }

    if (!source || !source.url) {
      return {
        success: false,
        items: [],
        error: '无效的API配置',
      }
    }

    const apiUrl = buildSearchUrl(source.url, query, page, apiConfig)
    const finalUrl = proxyStrategy.shouldProxy(apiUrl) ? proxyStrategy.applyProxy(apiUrl) : apiUrl

    const response = await requestAdapter.fetch(finalUrl, {
      headers: apiConfig.search.headers,
      timeout: source.timeout,
      retry: source.retry,
      signal,
    })

    if (!response.ok) {
      return {
        success: false,
        items: [],
        error: `API请求失败: ${response.status}`,
      }
    }

    let data: {
      list?: VideoItem[]
      page?: unknown
      pagecount?: unknown
      total?: unknown
      [key: string]: unknown
    } | null = null
    if (typeof response.text === 'function') {
      const text = await response.text()
      if (!text || !text.trim()) {
        return {
          success: false,
          items: [],
          error: `视频源 [${source.name}] 返回了空正文`,
        }
      }
      try {
        data = JSON.parse(text)
      } catch {
        return {
          success: false,
          items: [],
          error: `视频源 [${source.name}] 返回数据非有效 JSON`,
        }
      }
    } else {
      data = await response.json()
    }

    if (!data || !Array.isArray(data.list)) {
      return {
        success: false,
        items: [],
        error: 'API返回的数据格式无效',
      }
    }

    // 添加源信息到每个结果
    const items: VideoItem[] = data.list.flatMap((item: VideoItem) => {
      const vodId = normalizeVodId(item?.vod_id)
      return vodId === null
        ? []
        : [
            {
              ...item,
              vod_id: vodId,
              source_name: source.name,
              source_code: source.id,
              api_url: source.url,
            },
          ]
    })

    // 解析分页信息
    const pagination: Pagination = {
      page: Number(data.page) || page,
      totalPages: Number(data.pagecount) || 0,
      totalResults: Number(data.total) || 0,
    }

    return {
      success: true,
      items,
      pagination,
    }
  } catch (error) {
    if (signal?.aborted) throw error
    console.warn(`[CMS] 视频源 [${source.name}] 搜索异常:`, error)
    return {
      success: false,
      items: [],
      error: error instanceof Error ? error.message : '请求处理失败',
    }
  }
}
