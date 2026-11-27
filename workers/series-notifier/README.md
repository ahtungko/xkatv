# Cloudflare Worker 追剧更新定时推送（Series Notifier）

该独立 Worker 通过 Cloudflare **Cron Trigger** 定时检查 Supabase 中已开启追更的剧集是否有新集更新，并将结果汇总推送至用户配置的 **Telegram / Discord / 自定义 Webhook**。

> ✅ **支持部署在任意独立 Cloudflare 账号（小号）**，无需与主站同账号，完全隔离配额。

---

## 工作原理与配额保护

1. **按视频源合并批量请求**：同一个视频源下的多部剧集会合并为单次 `?ac=videolist&ids=1,2,3...` 批量请求（每批默认 20 部），大幅减少子请求数；若上游不支持批量则自动降级单条查询。
2. **跨用户去重**：多个用户追同一部剧（同一 `source_code` + `vod_id`）时仅请求一次 CMS 接口。
3. **自动跳过已完结剧集**：若视频源标注已完结（`source_completed = true`），后续定时任务自动跳过。
4. **子请求预算保护**：默认单次最多使用 `42` 次子请求（低于 CF 免费版 50 次上限），按 `last_checked_at` 轮询最久未检查的剧集；每 3 小时运行一次（每天仅 8 次调用）。
5. **合并摘要推送**：单次检查中同一用户有多部剧更新时，合并为一条消息推送。

---

## 第一步：执行数据库迁移

在 Supabase SQL Editor 中执行：

- `supabase/migrations/202611270001_series_push_notifications.sql`

（需先完成基础同步与 `202610190001_series_notifications.sql` 迁移。）

---

## 第二步：部署 Worker（支持主号或独立小号）

### 方式 A：Cloudflare 网页端 1 分钟部署（无需命令行）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)（可使用独立的免费小号）。
2. 进入 **Workers & Pages** → **Create** → **Create Worker**，命名为 `xkatv-series-notifier` 并点击 **Deploy**。
3. 点击 **Edit code**，将本目录 [`index.js`](./index.js) 的完整内容粘贴进去，点击 **Deploy**。
4. 进入 Worker 的 **Settings** → **Variables and Secrets**，添加以下 **Secrets**（建议全部勾选 Encrypt）：
   - `SUPABASE_URL`：你的 Supabase 项目地址（如 `https://xxxx.supabase.co`）
   - `SUPABASE_SERVICE_ROLE_KEY`：Supabase 的 `service_role` 密钥（仅放在 Worker Secret，切勿暴露到前端）
   - `CMS_SOURCES_JSON`（或 `CMS_SOURCES_URL`）：支持**远程 JSON 链接**或**内联 JSON**，完全兼容 xkaTV 现有配置格式：
     - **远程链接**（直接填你的 `XKA_INITIAL_VIDEO_SOURCES` 链接，多个链接可用逗号或换行分隔）：`https://example.com/sources.json`
     - **数组格式**（缺少 `id` 时自动按顺序映射为 `env_source_0`, `env_source_1`…）：`[{"id": "source_a", "url": "https://api.example.com/api.php/provide/vod"}]`
     - **对象格式**：`{"source_a": "https://api.example.com/api.php/provide/vod"}`
     - **完整配置格式**：包含 `videoSources` 字段的 xkaTV 导出 JSON 或远程配置链接
   - `TRIGGER_SECRET`（可选）：自定义密钥，用于手动调用 `POST /run` 立即测试一次检查。
5. 进入 **Settings** → **Trigger Events** → **Cron Triggers** → **Add Cron Trigger**，填入：
   ```text
   0 */3 * * *
   ```
   （每 3 小时检查一次，也可改为 `0 */6 * * *` 每 6 小时一次。）

### 方式 B：Wrangler CLI 部署

```bash
cd workers/series-notifier
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CMS_SOURCES_JSON
npx wrangler deploy
```

---

## 第三步：在 xkaTV 中配置推送通道

1. 登录你的 xkaTV 账号，进入 **我的账号**（`/account`）。
2. 在 **追剧外部推送** 区域开启总开关，并填写 **Telegram**、**Discord** 或 **自定义 Webhook** 配置。
3. 点击各通道旁的 **发送测试** 验证推送是否送达，最后点击 **保存推送设置**。
4. 在首页或收藏页至少检查过一次追更剧集（或绑定了视频源），使 `series_notifications` 记录对应的 `source_code` 与 `vod_id` 后，定时任务即可自动接管后台检测。

---

## 手动触发测试（可选）

如果配置了 `TRIGGER_SECRET`，可通过以下命令立即触发一次检查并查看统计结果：

```bash
curl -X POST https://xkatv-series-notifier.your-name.workers.dev/run \
  -H "Authorization: Bearer YOUR_TRIGGER_SECRET"
```
