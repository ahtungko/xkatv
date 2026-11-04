# xkaTV 独立直播流代理服务器 (Zero-Dependency Node Proxy)

专为 **Serv00（免费主机）**、**自建 Linux VPS**、**家中软路由/NAS** 设计的轻量化直播流反向代理。

---

## 为什么需要独立代理？

1. **解除 Cloudflare 1003 限制**：
   - Cloudflare Workers 平台硬性禁止子请求连接纯 IP（IPv4 / IPv6），会返回 `403 Forbidden (error code: 1003)`。
   - 大量国内 IPTV 源（包括央视、卫视、运营商 OTT 源）使用纯 IP（如 `http://74.91.26.218:82/...`），此代理在原生 Node.js 下运行，**没有任何纯 IP 或非标准端口限制**。
2. **零外部依赖 (Zero Dependency)**：
   - 仅使用 Node.js 18+ 原生内置模块（`http`、`fetch`、`URL`）。
   - **无需执行 `npm install`**，拷贝单个 `app.js` 即可直接运行。
3. **零主站配额消耗**：
   - 无需担心消耗 Cloudflare 或 Vercel 主站请求额度。

---

## 部署方式一：Serv00（免 SSH、5 分钟网页部署）

Serv00 是波兰知名免费 FreeBSD 虚拟主机，自带 Node.js 运行环境与免费 SSL 证书。

### 1. 开启应用运行权限与预留端口
1. 登录 Serv00 控制面板。
2. 点击左侧 **Additional services** -> **Run your own applications**，勾选并设置为 **Enabled**。
3. 点击左侧 **Port reservation** -> **Add port**：
   - Type 选 **TCP**
   - 点击保存，记下系统分配的随机端口（例如 `31245`）。

### 2. 创建 Node.js 站点
1. 点击左侧 **WWW Websites** -> **Add new website**：
   - **Domain**: 输入分配给你的免费二级域名（如 `yourname.serv00.net`）或自定义域名。
   - **Website type**: 选择 **Node.js**。
   - **Port**: 填入第 1 步申请到的端口号。
   - **Node executable**: 选择 `Node.js v20.20.2`（或 v18+）。
   - **Environment**: 选择 `production`。
2. 创建完成后，点击域名右侧的 **Manage SSL certificates** -> **Add certificate** -> 勾选 **Let's Encrypt** 免费申请 HTTPS 证书。

### 3. 上传代码（无需 SSH）
1. 点击左侧或顶部菜单的 **File Manager**（文件管理器）。
2. 依次进入目录：
   ```text
   domains/你的域名/public_nodejs/
   ```
3. 找到默认生成的 `app.js`，选中并点击 **Edit**（编辑）。
4. 清空文件内容，将本项目 [`app.js`](./app.js) 的完整代码粘贴进去，点击 **Save**。

### 4. 重启与验证
1. 回到 **WWW Websites** 列表，点击域名右侧的 **Restart**。
2. 在浏览器打开：
   ```text
   https://yourname.serv00.net/
   ```
   看到 `{"status":"ok","service":"xkaTV Live Stream Proxy"}` 即代表运行成功！
3. 在 xkatv 设置中填入：
   ```text
   https://yourname.serv00.net/proxy?url=
   ```

---

## 部署方式二：Linux VPS / 树莓派 / NAS (PM2 或 Docker)

### 直接启动
```bash
PORT=3000 node app.js
```

### PM2 后台常驻
```bash
npm install -g pm2
pm2 start app.js --name xkatv-proxy --env PORT=3000
pm2 save
pm2 startup
```

---

## 路由说明

- `GET /`：健康检查接口。
- `GET /proxy?url=<TARGET_URL>`：直播流与视频切片代理。
- `GET /proxy?native=1&url=<TARGET_URL>`：原生 HLS（iOS/Safari）递归 M3U8 切片重写模式。
