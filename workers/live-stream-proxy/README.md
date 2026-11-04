# Cloudflare Worker 直播流代理池部署指南

原生 HLS 播放（例如不支持 Hls.js 的 Safari）需要重新部署最新版 Worker。
播放器通过 `native=1` 请求递归代理：子播放列表、密钥和切片地址都会保留在代理域名下，避免 HTTP 混合内容请求。
直播播放列表返回 `Cache-Control: no-store`，视频切片继续按上游策略处理。

该 Worker 专为解决在 HTTPS 生产站点中播放国内 HTTP 电视直播流（IPTV）时的 **Mixed Content（混合内容被阻断）** 与 **CORS 跨域** 问题而设计。

---

## 核心设计原理

1. **零主号配额消耗**：
   - 使用 Hls.js 时，HTTPS 资源默认直连；HTTPS 页面中的 HTTP 资源通过直播代理池加载。
   - 原生 HLS 分支会代理主清单及其子清单、密钥和切片（包括 HTTPS 资源），以确保后续请求不绕过代理。
2. **多号分布式代理池**：
   - 建议注册 **2 ~ 3 个独立的 Cloudflare 免费小号**，每个小号每日提供 100,000 次请求免费配额。
   - 3 个小号合并可提供 **300,000 次请求/天**，相当于每天 **~200 小时** 的全天候直播观看量。
   - 小号使用 Cloudflare 赠送的 `*.workers.dev` 免费子域名，与主站域名及主账号完全隔离，无封号或降级风险。
3. **M3U8 相对路径重写**：
   - 针对部分 IPTV 源内包含相对路径切片（如 `segment_001.ts`），Worker 自动根据源地址补全为完整绝对路径，确保后续切片请求也能平滑命中代理池。
4. **流式原生透传**：
   - TS 视频切片以原生 Stream 直传，内存零占用，响应速度极快。

---

## 部署步骤（1 分钟网页端部署）

### 1. 登录 Cloudflare 控制台
打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) 并登录您的**次要（小号）账号**。

### 2. 创建 Worker
1. 在左侧菜单中点击 **Workers & Pages** -> **Overview**。
2. 点击 **Create Application** -> 选择 **Workers** -> 点击 **Create Worker**。
3. 输入任意名称（例如 `stream-proxy`），点击右下角 **Deploy**。

### 3. 粘贴代理代码
1. 部署完成后，点击 **Edit code**。
2. 清空编辑器中的所有默认代码，将本项目中 [`index.js`](./index.js) 的完整代码复制并粘贴进去。
3. 点击右上角 **Deploy** 保存并生效。

### 4. 获取 Worker 访问域名
在 Worker 详情页中，您会看到分配的公共域名，形如：
```text
https://stream-proxy.your-name.workers.dev
```

### 5. 重复部署至其他小号
在第 2 个、第 3 个 Cloudflare 小号中重复上述步骤，您将分别得到 3 个独立的域名：
- `https://proxy-1.xxx.workers.dev`
- `https://proxy-2.yyy.workers.dev`
- `https://proxy-3.zzz.workers.dev`

---

## 在 xkaTV 中配置代理池

1. 打开您的 xkaTV 站点，进入 **设置** -> **网络设置**。
2. 找到专用的 **电视直播专属代理池 (IPTV)** 输入框，填入上述 3 个域名（使用**英文逗号**或**换行**分隔）：
   ```text
   https://proxy-1.xxx.workers.dev, https://proxy-2.yyy.workers.dev, https://proxy-3.zzz.workers.dev
   ```
3. 保存设置。（原有的「影视源代理地址」依然保持默认 `/proxy?url=` 即可，实现完全隔离，不挤占直播 Worker 配额）。

> 💡 **自动负载均衡**：xkaTV 会自动将这 3 个节点组织为代理池。在播放 HTTP 直播流时，Hls.js 的 HTTP 请求会随机选择节点；原生 HLS 的后续请求沿用清单中重写的代理节点，不保证逐切片分散。

---

## 添加电视直播源

进入 **设置** -> **视频源管理** -> **电视直播源 (IPTV M3U)**，点击 **添加直播源**：
- 输入直播源名称（如：`央视卫视精选`）
- 输入在线 M3U 播放列表地址（例如常见的电信/联通 IPTV 聚合源）
- 点击保存后，系统将自动抓取频道并归纳至站内的 **电视直播** 专区。

全站直播开关及数据库迁移另见 [配置说明](../../docs/configuration.md#电视直播配置)。部署 Worker 不会自动安装 Supabase 迁移。
