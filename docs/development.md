# 开发者指南

本文档面向希望参与开发或了解项目架构的开发者。

---

## 技术栈

| 技术 | 版本 | 用途 |
| ---- | ---- | ---- |
| React | 19 | 前端框架 |
| TypeScript | 5.8 | 类型系统 |
| Vite | 6 | 构建工具 |
| TailwindCSS | 4 | 样式框架 |
| Radix UI + shadcn/ui | - | UI 组件库 |
| Framer Motion | 12 | 动画库 |
| Artplayer | 5 | 视频播放器 |
| Zustand | 5 | 状态管理（immer + persist） |
| React Router | 7 | 路由管理 |
| React Hook Form + Zod | 7 / 4 | 表单验证 |
| tmdb-ts | 2 | TMDB API 客户端 |
| hls.js | 1 | HLS 流媒体支持 |
| Vitest | 4 | 单元测试 |

**代理架构：**

| 环境 | 实现方式 |
| ---- | ---- |
| 本地开发 | Vite 中间件代理 |
| Vercel | Serverless Function (`api/proxy.ts`) |
| Cloudflare | Workers Function (`functions/proxy.ts`) |
| Netlify | Serverless Function (`netlify/functions/proxy.ts`) |
| Docker | Nginx + Node.js Express (`proxy-server.js`) |

所有代理共享核心逻辑 `shared/proxy-core.js`。

---

## 项目结构

项目采用 **Feature-Sliced Design** 架构，功能按领域模块组织。

```text
xkatv/
├─ api/                        # Vercel Serverless Functions
│  └─ proxy.ts
├─ functions/                  # Cloudflare Workers Functions
│  └─ proxy.ts
├─ netlify/functions/          # Netlify Serverless Functions
│  └─ proxy.ts
├─ shared/                     # 跨平台代理核心逻辑
│  └─ proxy-core.js
├─ packages/
│  └─ cms-core/                # @xkatv/cms-core 内容管理核心包
│     ├─ src/
│     │  ├─ core/              # 搜索、聚合、解析、并发控制
│     │  ├─ adapters/          # 网络适配器（fetch、proxy）
│     │  ├─ m3u8/              # M3U8 流处理
│     │  ├─ source/            # 视频源管理（导入、验证、存储）
│     │  ├─ events/            # 事件系统
│     │  ├─ types/             # 类型定义
│     │  └─ utils/             # 工具函数
│     └─ tsup.config.ts
├─ src/
│  ├─ app/                     # 应用入口
│  │  ├─ main.tsx              # 入口文件
│  │  ├─ layouts/              # 布局组件
│  │  ├─ router/               # 路由定义
│  │  └─ styles/               # 全局样式
│  ├─ features/                # 功能模块（Feature-Sliced Design）
│  │  ├─ auth/                 # 认证守卫
│  │  ├─ favorites/            # 收藏管理
│  │  ├─ history/              # 观看历史
│  │  ├─ home/                 # 首页
│  │  ├─ media/                # 媒体详情
│  │  ├─ player/               # 视频播放
│  │  ├─ search/               # 搜索功能
│  │  └─ settings/             # 设置管理
│  ├─ shared/                  # 共享资源
│  │  ├─ components/           # 通用组件
│  │  │  ├─ ui/                # shadcn/ui 基础组件
│  │  │  ├─ icons/             # 图标组件
│  │  │  ├─ theme/             # 主题组件
│  │  │  └─ common/            # 业务通用组件
│  │  ├─ config/               # 应用配置
│  │  ├─ hooks/                # 通用 Hooks
│  │  ├─ lib/                  # 工具库（缓存、代理、路由等）
│  │  ├─ store/                # Zustand Store
│  │  └─ types/                # 全局类型定义
│  └─ middleware/               # Vite 开发代理
│     └─ proxy.dev.ts
├─ public/                     # 静态资源
├─ Dockerfile                  # Docker 多阶段构建
├─ docker-compose.yml          # Docker Compose 编排
├─ nginx.conf                  # Nginx 配置
├─ supervisord.conf            # Supervisord 进程管理
├─ proxy-server.js             # Docker 代理服务器
├─ vite.config.ts              # Vite 构建配置
├─ vitest.config.ts            # Vitest 测试配置
├─ tsconfig.json               # TypeScript 配置
├─ eslint.config.js            # ESLint 配置
├─ components.json             # shadcn/ui 组件配置
└─ pnpm-workspace.yaml         # pnpm Monorepo 工作区
```

每个 feature 模块通常包含以下子目录：

| 子目录 | 说明 |
| ------ | ---- |
| `components/` | 模块专属 UI 组件 |
| `views/` | 页面级视图组件 |
| `hooks/` | 模块专属 Hooks |
| `lib/` | 模块工具函数 |
| `store/` | 模块状态管理 |
| `types/` | 模块类型定义 |
| `constants/` | 模块常量 |
| `index.ts` | 模块公共导出 |

---

## 性能检查

普通生产构建 `pnpm build` 不生成 `.vite/manifest.json`，发布目录 `dist` 只保留站点运行所需产物。运行 `pnpm build:analyze` 会在独立的 `.generated/bundle-analysis` 目录构建、生成清单并输出体积分析，不修改 `dist`。之后可用 `pnpm analyze:bundle` 重读分析结果，也可运行 `pnpm analyze:bundle <分析构建目录>` 对比其他产物。分析目录不应作为 Vercel、Netlify、Cloudflare 或 Nginx 的发布目录；Docker/Nginx 另外拒绝 `/.vite/` 请求，防止旧产物残留时被读取。

脚本优先按源文件键定位分块，再按清单中的源文件或模块名回退查找，兼容带哈希的共享分块键；没有独立播放器分块时显示「不可用」。统计会沿静态依赖递归去重，gzip 按文件估算，不包含图片、字体、CSS、运行时接口请求或按状态显示的公告与更新日志，不等同于浏览器加载耗时。

认证守卫先加载，登录成功后才加载应用路由和主布局；设置布局随设置页加载，更新日志弹窗在首次显示时才加载，关闭后保留组件以完成退出过渡。保持这些按需加载边界，避免在入口通过静态导入重新引入完整页面。Radix 使用独立组件包，Phosphor 图标使用已导出的单图标路径，Lodash 只导入使用的函数。

TMDB 趋势、电影榜单和剧集榜单分别请求实际使用的接口。各榜单独立触发加载，并在 store 中阻止同一榜单的重叠请求，避免其他榜单返回结果时反复请求空列表或仍在加载的列表；手动刷新和失败后的重试仍可使用。

## 依赖安全维护

开发、CI 和 Docker 构建以 Node.js 22 LTS（22.12+）为基线，也支持 Node.js 24+。Node.js 20 已停止维护，不再作为项目的构建和镜像版本。Docker 中独立安装的 Express/CORS 需与根项目的代理依赖一起升级，不能只修改 pnpm 锁文件；代理回归测试会实际启动 Node 服务并验证本机上游转发。

运行 `pnpm audit` 与 `pnpm audit --prod` 分别检查完整依赖和生产依赖，并核对告警的实际触发条件。安全升级按运行依赖、构建工具、测试工具分组验证；`package.json` 的 `pnpm.overrides` 只为已确认的间接依赖设置同主版本内的安全下限，上游依赖更新后应重新审视这些约束，不强制跨主版本替换。`pnpm-lock.yaml` 必须随依赖声明一并提交。

四个 Vercel API 使用 `shared/serverless-http.ts` 中基于 Node HTTP 的窄接口类型，只声明项目实际使用的请求字段和平台响应 helper；请求体保持 `unknown`，由各端点的 Zod schema 校验。类型导入会在构建时擦除，平台仍提供实际请求/响应实现，项目不再仅为类型安装整套 `@vercel/node` 构建 SDK。`pnpm check:api-types` 覆盖这四个 API，并保留对 Vercel 风格依赖解析的检查。

## 项目展示信息

本站名称、维护者、简介、仓库及反馈链接统一从根目录 `package.json` 的 `name`、`author`、`description`、`repository`、`bugs` 读取。登录页、导航、页面标题、关于页以及构建产物中的 HTML 标题/元信息、PWA 清单自动使用这些字段。`src/shared/config/project.ts` 只保留原项目来源链接，并导出构建时生成的信息。

每次开发启动或生产构建时，`scripts/project-metadata.mjs` 自动读取 Git 信息：版本为 `package.json` 基础版号加提交标识（例如 `2.1.0+git.abc1234`），日期使用当前代码的提交时间，日志汇总最多 20 条可用的第一父链提交标题，`fix:` 项归入修复。同一提交重复部署不会重复提示新版本；需要调整基础版号时只修改 `package.json`。构建元数据生成后会打包进前端，不在浏览器请求 GitHub，也不自动修改 Git、发布 Release 或创建提交。

提交标题会直接展示在版本日志中，请写明实际改动。关于页显示的是可用的近期更新条目数，不是累计发布版本数。未提供 Git 历史时明确显示「未提供记录」，日期回退为构建日期，不编造更新内容。只导出公开项目信息，不包含构建环境密钥。

CI 的 Docker 构建会自动生成 `.generated/project-metadata.json` 快照；该目录不提交 Git。源码环境手动构建 Docker 时，可先运行 `node scripts/project-metadata.mjs --output .generated/project-metadata.json`，再执行 `docker compose up -d --build`。没有快照也能构建，但只能使用可用的基础版号/构建参数，无法展示缺失的提交日志。旧快照与当前版号、仓库或部署提交不匹配时会被忽略。

本地存储键名与 `XKA_*` 环境变量保持兼容，升级后可继续使用已有配置。

## @xkatv/cms-core

`@xkatv/cms-core` 是一个无头（headless）、纯函数、事件驱动的 CMS 视频源聚合搜索引擎。它与框架无关，可以在任何 JavaScript/TypeScript 项目中使用，适合构建自己的视频搜索应用、机器人、CLI 工具等。

### 安装

```bash
npm install @xkatv/cms-core
# 或
pnpm add @xkatv/cms-core
```

如需 M3U8 流处理功能，还需安装可选依赖：

```bash
pnpm add hls.js
```

### 快速上手

```typescript
import { createCmsClient, createFetchAdapter, createUrlPrefixProxyStrategy } from '@xkatv/cms-core'

// 1. 创建客户端
const client = createCmsClient({
  requestAdapter: createFetchAdapter(),
  proxyStrategy: createUrlPrefixProxyStrategy('/proxy?url='),
  concurrencyLimit: 3,
})

// 2. 定义视频源
const sources = [
  { id: 'source1', name: '示例源', url: 'https://api.example.com', isEnabled: true },
  { id: 'source2', name: '另一个源', url: 'https://api2.example.com', isEnabled: true },
]

// 3. 监听搜索事件（可选）
client.on('search:progress', event => {
  console.log(`搜索进度: ${event.completed}/${event.total}`)
})

client.on('search:result', event => {
  console.log(`${event.source.name} 返回 ${event.items.length} 条结果`)
})

// 4. 聚合搜索（多源并发，自动去重）
const results = await client.aggregatedSearch('关键词', sources, 1)
console.log(`共找到 ${results.length} 条结果`)

// 5. 获取视频详情和播放地址
const detail = await client.getDetail('video_id', sources[0])
if (detail.success) {
  console.log(detail.videoInfo)    // 视频信息
  console.log(detail.episodes)     // 剧集列表和播放地址
}

// 6. 用完销毁
client.destroy()
```

### 导出入口

| 入口 | 说明 |
| ---- | ---- |
| `@xkatv/cms-core` | 核心模块（客户端、搜索、聚合、解析、事件、适配器） |
| `@xkatv/cms-core/m3u8` | M3U8 流处理（过滤、HLS 加载、处理器） |
| `@xkatv/cms-core/source` | 视频源管理（导入、验证、存储） |

### 核心 API

| API | 说明 |
| --- | ---- |
| `createCmsClient(config?)` | 创建客户端实例，集成搜索、详情、事件等全部功能 |
| `client.search(query, source)` | 单源搜索 |
| `client.aggregatedSearch(query, sources, page, signal?)` | 多源聚合搜索，支持并发控制和 AbortSignal 取消 |
| `client.listVideos(source, page?)` | 获取视频列表（推荐/最新内容） |
| `client.getDetail(id, source)` | 获取视频详情和播放地址 |
| `client.parsePlayUrl(playUrl, playFrom?)` | 解析播放地址，提取剧集列表 |
| `client.on(event, handler)` | 监听事件（search:start/progress/result/complete/error/abort, detail:*） |

### 代理策略

包内置了多种代理策略，用于处理跨域请求：

```typescript
import {
  createUrlPrefixProxyStrategy,  // URL 前缀代理（如 /proxy?url=xxx）
  createWhitelistProxyStrategy,  // 白名单代理（仅代理指定域名）
  createDirectStrategy,          // 直连（不使用代理）
} from '@xkatv/cms-core'
```

### 适用场景

- 构建自定义视频搜索前端（React、Vue、Svelte 等任意框架）
- 开发视频搜索 Telegram/Discord 机器人
- 编写 CLI 视频搜索工具
- 搭建视频源管理和测试平台
- 任何需要聚合 CMS 视频 API 的场景

### 构建与发布

```bash
# 本地构建
pnpm --filter @xkatv/cms-core build

# npm 发布（通过 GitHub Actions 手动触发）
# 进入 Actions → Publish @xkatv/cms-core → Run workflow
```

---

## 开发指南

### 环境准备

```bash
# 环境要求
# Node.js 22 LTS（22.12+）或 24+
# pnpm >= 9.15.4

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

### 代码规范

```bash
# ESLint 检查
pnpm lint

# TypeScript 类型检查
pnpm build  # tsc -b && vite build

# 运行测试
pnpm test
```

### 提交规范

| 前缀 | 说明 |
| ---- | ---- |
| `feat:` | 新功能 |
| `fix:` | 修复 Bug |
| `docs:` | 文档更新 |
| `style:` | 代码格式调整 |
| `refactor:` | 重构代码 |
| `perf:` | 性能优化 |
| `test:` | 测试相关 |
| `chore:` | 构建/工具链更新 |

---

## 常用命令

| 命令 | 说明 |
| ---- | ---- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产环境构建 |
| `pnpm preview` | 预览构建结果 |
| `pnpm test` | 运行测试 |
| `pnpm lint` | ESLint 代码检查 |
| `pnpm docker:build` | 构建 Docker 镜像 |
| `pnpm docker:up` | 启动 Docker 容器 |
| `pnpm docker:down` | 停止 Docker 容器 |
| `pnpm docker:logs` | 查看 Docker 日志 |
