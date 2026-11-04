# 圣经阅读器

本地网页应用，阅读简体和合本。经文来自 [GetBible](https://api.getbible.net) 公开的 1919 年和合本（Public Domain），全书已放在 `data/cuv.json`，搜索和阅读可离线进行。

## 使用

用浏览器直接打开 `index.html`，或在本目录启动一个静态服务器：

```bash
python -m http.server 8080
```

然后访问 http://localhost:8080

经文正文来自本地文件 `data/cuv.json`，不依赖外网。请用静态服务器打开；直接双击 `index.html` 时，浏览器可能拦截本地 JSON。

## 安装包

安卓安装包已打好：

`dist/shengjing-debug.apk`

拷到手机后直接打开安装。若系统提示「未知来源」，允许该文件管理器安装即可。这是调试包，可日常使用，尚未上架应用商店。

苹果无法在这台 Windows 电脑上打出 `.ipa`。请用 **Safari** 打开阅读器网页：分享 → **添加到主屏幕**。

电脑和手机连同一个 Wi-Fi，在项目目录运行：

```bash
python -m http.server 8080 --bind 0.0.0.0
```

手机浏览器打开 `http://电脑局域网IP:8080`。

- **安卓（Chrome）**：地址栏或页面底部出现「安装」，或菜单里的「添加到主屏幕 / 安装应用」。
- **苹果（必须用 Safari）**：底部分享按钮 → **添加到主屏幕**。

装好后从主屏幕图标打开即可全屏使用；首次打开会缓存经文，之后可离线阅读。

## 部署（免费）

**线上地址：https://lixiaofeng-ql.github.io/shengjing/**

项目是纯静态站点，产物在 `www/` 目录（`npm run pack:www` 生成，约 8.4 MB）。以下方案均免费：

### 已启用：GitHub Pages

仓库已内置 `.github/workflows/deploy-pages.yml`，推送到 `main` 分支即自动构建发布：

```bash
git add -A
git commit -m "更新内容"
git push
```

访问 https://lixiaofeng-ql.github.io/shengjing/ 即可。Pages 设置：Settings → Pages → Source = GitHub Actions。

注意：所有资源都用相对路径（`./sw.js`、`data/cuv.json`），放在子目录下也能正常工作。

### 方案二：Netlify Drop（最快，零配置）

1. 打开 <https://app.netlify.com/drop>
2. 把本地 `www` 文件夹整个拖进去
3. 立刻得到 `https://<随机名>.netlify.app` 网址

想换正式域名：Netlify 后台 → Domain management → Add custom domain。

`netlify.toml` 已写好构建命令与缓存策略，连接 Git 仓库后可自动部署：

```bash
npm i -g netlify-cli
netlify login
netlify deploy --prod --dir=www
```

### 方案三：Vercel

```bash
npm i -g vercel
vercel --prod          # 自动识别为静态站点
```

### 方案四：Cloudflare Pages

Cloudflare 后台 → Workers & Pages → Create → Pages → Upload assets，上传 `www` 目录即可。

### 建议

- 正式长期使用推荐 **GitHub Pages**（永久免费、域名稳定）或 **Netlify**（部署最快）。
- `data/cuv.json`（3.3 MB）是体积大头，建议首次访问用 Service Worker 缓存，之后完全离线可用。
- `data/notes/*.json`（约 4.5 MB，66 个文件）只在点击「注」时按需加载，已在 `netlify.toml` 中设置长缓存。

## 功能

- 旧约 / 新约书卷目录、章节网格与左右翻页
- 关键词搜索（旧约 / 新约 / 全部），也可输入 `约3:16` 跳转章节
- 点击节号收藏书签，可删除；记住上次阅读位置
- 阅读时点击节旁「注」或「本章注解」查看研经注解（创世记等已内置；繁体）
- 字体大小与日间 / 夜间主题
- 地址栏定位，例如 `/#/43/3/16` 打开约翰福音 3:16
