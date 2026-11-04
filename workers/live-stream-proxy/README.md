# Cloudflare Worker 直播流代理池部署指南

该 Worker 专为解决在 HTTPS 生产站点中播放国内 HTTP 电视直播流（IPTV）时的 **Mixed Content（混合内容被阻断）** 与 **CORS 跨域** 问题而设计。

---

## 核心设计原理

1. **零主号配额消耗**：
   - 如果直播源本身为 `https://`，xkaTV 客户端会 **100% 直连源站**，不请求任何 Worker，0 消耗。
   - 只有当站点在 HTTPS 环境且播放 `http://` 直播源时，客户端才会分流走 Worker 代理。
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
2. 在 **代理地址** 输入框中，填入上述 3 个域名（使用**英文逗号**或**换行**分隔）：
   ```text
   https://proxy-1.xxx.workers.dev, https://proxy-2.yyy.workers.dev, https://proxy-3.zzz.workers.dev
   ```
3. 保存设置。

> 💡 **自动负载均衡**：xkaTV 会自动将这 3 个节点组织为代理池。在播放 HTTP 直播流时，所有的切片下载与 manifest 刷新将在 3 个节点间随机轮询分发，均匀分摊配额。

---

## 添加电视直播源

进入 **设置** -> **视频源管理** -> **电视直播源 (IPTV M3U)**，点击 **添加直播源**：
- 输入直播源名称（如：`央视卫视精选`）
- 输入在线 M3U 播放列表地址（例如常见的电信/联通 IPTV 聚合源）
- 点击保存后，系统将自动抓取频道并归纳至站内的 **电视直播** 专区。
