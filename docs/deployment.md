# 部署指南

本文档详细介绍 xkaTV 的各种部署方式和更新同步方法。

---

## 直播功能升级

1. 新项目先执行 `supabase/schema.sql`；已有项目保留现有数据。两种情况均需再执行 [202611040001_site_settings.sql](../supabase/migrations/202611040001_site_settings.sql)，当前整合脚本尚未包含它。
2. 按 [直播配置](configuration.md#电视直播配置) 设置订阅、代理和初始开关，再部署应用。迁移不会预置开启状态，也不会覆盖已有数据库开关。
3. 使用外部直播 Worker 时，同步部署 [最新版 Worker](../workers/live-stream-proxy/index.js)，否则原生 HLS 的递归代理参数无法生效。
4. 刷新设备页面，用管理员开关修改状态，并在另一台设备确认导航与直播页面同步变化。

## Docker 部署

### 方式一：Docker Compose（推荐）

```bash
# 首次部署或代码更新后构建并启动
docker-compose up -d --build
```

**环境变量配置**（可选）：

1. 复制环境变量示例文件：

   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env` 文件进行自定义配置：

   ```env
   # 初始视频源（单行 JSON 格式）
   XKA_INITIAL_VIDEO_SOURCES=[{"name":"示例源","url":"https://api.example.com","isEnabled":true}]

   # TMDB API Token（可选，启用 TMDB 智能模式，申请方式见下方链接）
   XKA_TMDB_API_TOKEN=your_tmdb_token

   # TMDB API 基础地址（可选，支持相对路径）
   XKA_TMDB_API_BASE_URL=https://api.themoviedb.org/3

   # TMDB 图片基础地址（可选，支持相对路径）
   XKA_TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p/

   # 禁用分析（建议开启）
   XKA_DISABLE_ANALYTICS=true

   # 账号登录公开配置（完整步骤见 docs/cloud-sync.md）
   XKA_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   XKA_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
   ```

   > 中国大陆网络环境如遇 TMDB 官方域名访问不稳定，建议改为：
   >
   > `XKA_TMDB_API_BASE_URL=https://api.tmdb.org`
   >
   > `XKA_TMDB_IMAGE_BASE_URL=https://image.tmdb.org`

   > 📘 完整环境变量说明 → [配置管理](./configuration.md)
   > 📘 TMDB Token 申请方法 → [TMDB API Key 申请指南](./tmdb-key.md)

3. 首次构建并启动：
   ```bash
   docker-compose up -d --build
   ```

环境变量由容器在**启动时**读取。只修改 `.env` 后，重建容器即可，无需重建镜像：

```bash
docker-compose up -d --force-recreate
```

### 方式二：预构建镜像（快速启动）

本仓库的 CI/CD 工作流成功构建并发布后，可使用自己的 GHCR 镜像。首次部署请先在仓库 Actions 确认发布成功；若镜像尚未发布，请使用上面的 Docker Compose 源码构建方式。

```bash
# 私有镜像需先通过 docker login ghcr.io 登录具有读取权限的账号
docker pull ghcr.io/ahtungko/xkatv:latest
docker run -d --name xkatv -p 3000:80 \
  --env-file .env \
  ghcr.io/ahtungko/xkatv:latest

# 访问 http://localhost:3000
```

**可用镜像标签：**

| 标签           | 说明                      |
| -------------- | ------------------------- |
| `latest`       | main 分支最新构建         |
| `main`         | main 分支每次推送自动生成 |
| `main-abc1234` | 带 7 位提交哈希的精确标签 |

预构建镜像支持全部 `XKA_*` 环境变量。可用 `-e`、`--env-file` 或 Compose 的 `environment` 传入；修改后必须删除并重建容器，不能只执行 `docker restart`。

使用预构建镜像的 Compose 示例：

```yaml
services:
  xkatv:
    image: ghcr.io/ahtungko/xkatv:latest
    container_name: xkatv
    restart: unless-stopped
    ports:
      - '9321:80'
    environment:
      XKA_INITIAL_VIDEO_SOURCES: >-
        [{"name":"示例源","url":"https://api.example.com","isEnabled":true}]
      XKA_TMDB_API_TOKEN: ${XKA_TMDB_API_TOKEN:-}
      XKA_DISABLE_ANALYTICS: 'true'
```

若使用 `.env`，执行 `docker compose up -d --force-recreate` 让修改后的变量进入新容器。

旧版镜像升级步骤：

1. 拉取包含运行时环境变量支持的新版镜像。
2. 删除旧容器，不删除浏览器本地数据。
3. 使用原端口和新的 `-e` / `--env-file` 参数创建容器。
4. 浏览器刷新页面；初始配置变化时，应用会重新执行一次初始内容导入。若需完全替换已有本地配置，请在应用内执行「恢复默认配置」。

> 请使用本仓库构建的镜像，以包含本站的账号、追剧提醒和维护功能。

---

## 新版环境变量对部署方式的影响

所有部署方式继续使用相同的 `XKA_*` 变量名、JSON 格式和配置优先级，但生效阶段不同。

| 部署方式                | 新版影响                                               | 修改变量后操作                          |
| ----------------------- | ------------------------------------------------------ | --------------------------------------- |
| Docker 预构建镜像       | **有改进**：新增容器启动时读取环境变量                 | 删除并重建容器；无需重建镜像            |
| Docker Compose 本地构建 | **有调整**：应用配置从 `build.args` 移到 `environment` | `docker-compose up -d --force-recreate` |
| Vercel                  | **不影响**：仍在 Vite 构建时读取                       | 保存变量后 Redeploy                     |
| Cloudflare Pages        | **不影响**：仍在构建时读取                             | 保存变量后重新部署                      |
| Netlify                 | **不影响**：仍在构建时读取                             | 保存变量后重新部署                      |
| 本地开发                | **不影响**：仍从 `.env` 读取                           | 重启 `pnpm dev`                         |

Docker 运行时配置优先于镜像中可能存在的构建时配置；其他部署没有运行时配置文件时，自动回退到 Vite 构建时环境变量。

---

## Vercel 部署

点击下方按钮，一键部署到 Vercel：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ahtungko/xkatv&build-command=pnpm%20build&install-command=pnpm%20install&output-directory=dist)

**部署步骤：**

1. Fork 本仓库到您的 GitHub 账户
2. 登录 Vercel，点击 "New Project"
3. 导入您的 GitHub 仓库
4. 配置构建选项（通常自动识别）：
   - Install Command: `pnpm install`
   - Build Command: `pnpm build`
   - Output Directory: `dist`
5. （可选）配置环境变量（参考 [配置管理](./configuration.md)，TMDB Token 申请参考 [TMDB API Key 申请指南](./tmdb-key.md)）
6. 点击 "Deploy" 开始部署

> 新版不影响 Vercel。环境变量仍在构建时注入，修改后必须重新部署。

---

## Cloudflare Pages 部署

**部署步骤：**

1. Fork 本仓库到您的 GitHub 账户
2. 登录 Cloudflare Dashboard，进入 **Workers & Pages**
3. 点击 **Create application** -> **Pages** -> **Connect to Git**
4. 选择您的仓库
5. 配置构建选项：
   - **Framework preset**: 选择 `Vite`
   - **Build command**: `pnpm run build`
   - **Build output directory**: `dist`
6. 点击 **Save and Deploy**

> 📘 环境变量配置参考 [配置管理](./configuration.md)
>
> 仓库内置 `functions/`（支持 `/proxy` 跨域反代与 `/api/*` 管理接口）及 `public/_redirects` 路由规则，Cloudflare Pages 原生支持全套功能。如需使用账号管理与私有源，请在 Pages 设置中的 **Settings -> Environment variables** 配置对应变量。

---

## Netlify 部署

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/ahtungko/xkatv)

**部署步骤：**

1. 点击上方按钮，或登录 Netlify 点击 "Add new site" -> "Import an existing project"
2. 连接 GitHub 并选择您的仓库
3. Netlify 会自动识别配置文件 (`netlify.toml`)，无需手动配置构建命令
4. 点击 **Deploy site**

> 📘 环境变量配置参考 [配置管理](./configuration.md)
>
> 新版不影响 Netlify。环境变量仍在构建时注入，修改后必须重新部署。

---

## 本地运行

**环境要求：**

- Node.js 22 LTS（22.12+）或 24+；Docker 镜像与 CI 使用 Node.js 22
- pnpm >= 9.15.4

**启动步骤：**

```bash
# 克隆仓库
git clone https://github.com/ahtungko/xkatv.git
cd xkatv

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 访问 http://localhost:3000
```

**构建生产版本：**

```bash
pnpm build       # 构建
pnpm preview     # 预览，访问 http://localhost:4173
```

---

## 更新同步

### Vercel 更新

Vercel 部署的项目会自动跟踪 GitHub 仓库变化：

1. **自动更新**：每次推送到主分支时自动重新部署
2. **手动更新**：进入 Vercel 项目控制台 → Deployments → 点击 "Redeploy"

### Docker 更新

**Docker Compose 方式：**

```bash
git pull origin main
docker compose up -d --build
```

**预构建镜像方式：**

```bash
# 停止并删除旧容器
docker stop <container_id>
docker rm <container_id>

# 拉取本仓库已发布的镜像
docker pull ghcr.io/ahtungko/xkatv:latest

# 运行新容器
docker run -d --name xkatv -p 3000:80 --env-file .env ghcr.io/ahtungko/xkatv:latest
```

### 本地更新

```bash
git pull origin main
pnpm install
pnpm dev
```

### 开源致谢

本站由 ahtungko 独立维护与更新。项目遵循 [Apache License 2.0](../LICENSE) 开源协议，部分底层代码源自 OuonnkiTV 开源项目并保留原作者版权致谢。


