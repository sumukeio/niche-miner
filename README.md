# NicheMiner - 关键词选品智能工具

一个基于 Next.js + Supabase + Python 的智能关键词选品工具系统，帮助电商和SEO从业者快速识别具有商业价值的"蓝海关键词"。

## 📋 项目概述

NicheMiner 提供完整的关键词选品工作流：
1. **数据获取**：支持导入5118表格或淘宝挖掘两种方式
2. **数据清洗**：智能分词分析和人工筛选
3. **选品看板**：蓝海评分算法和数据可视化
4. **广告验证**：百度广告验证，识别同行已验证的ROI关键词

## 🛠 技术栈

- **前端**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **后端**: Next.js API Routes, Supabase (PostgreSQL)
- **爬虫**: Python 3.x, Playwright
- **数据可视化**: Recharts

## 📁 项目结构

```
niche-miner/
├── .phrase/                    # 文档驱动开发（DDD）根目录
│   ├── docs/                   # 项目文档
│   └── phases/                 # 各阶段的文档
│       ├── phase-init-20260103/
│       └── phase-taobao-miner/
│
├── scripts/                    # Python 脚本
│   ├── baidu_ad_validator.py   # 百度广告验证脚本
│   ├── taobao_miner.py         # 淘宝挖掘脚本
│   ├── screenshots/            # 截图保存目录
│   └── README.md               # 脚本使用说明
│
├── samples/                    # 示例/测试文件
│   ├── keywords.xlsx           # 示例关键词文件
│   └── keywords_validated.xlsx # 示例验证结果
│
├── src/                        # Next.js 源代码
│   ├── app/                    # App Router
│   │   ├── api/                # API 路由
│   │   ├── components/         # React 组件
│   │   ├── dashboard/          # 工作台页面
│   │   ├── project/            # 项目详情页面
│   │   └── ...
│   ├── lib/                    # 工具库
│   └── types.d.ts              # TypeScript 类型定义
│
├── public/                     # 静态资源
├── temp/                       # 临时文件（gitignore）
│
├── .cursorrules               # Cursor 开发规则
├── .gitignore
├── package.json               # Node.js 依赖
├── requirements.txt           # Python 依赖
└── tsconfig.json
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 Python 依赖
pip install -r requirements.txt

# 安装 Playwright 浏览器（用于爬虫）
playwright install chromium
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key

# 可选：代理配置（用于百度广告验证）
PROXY_1=http://proxy1:port
PROXY_2=http://proxy2:port
PROXY_3=http://proxy3:port
PROXY_4=http://proxy4:port
PROXY_5=http://proxy5:port
```

### 3. 运行开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 4. 使用 Python 脚本

```bash
# 百度广告验证
python scripts/baidu_ad_validator.py --input samples/keywords.xlsx

# 淘宝挖掘（首次需要登录）
python scripts/taobao_miner.py
```

## 📚 文档

### 项目文档

- **项目说明**: `.phrase/docs/项目说明.md`
- **阶段性总结**: `.phrase/docs/项目阶段性总结.md`
- **工作流设计**: `.phrase/phases/phase-taobao-miner/需求_工作流重新设计.md`

### 功能文档

- **百度广告验证**: `.phrase/docs/百度关键词验证工具说明.md`
- **淘宝挖掘工具**: `.phrase/phases/phase-taobao-miner/spec_taobao.md`
- **脚本使用**: `scripts/README.md`

## 🔄 工作流程

```
数据获取 (Step 0)
  ├─ 方式1: 导入5118表格
  └─ 方式2: 淘宝挖掘
         ↓
数据清洗 (Step 1) - 智能分词筛选
         ↓
选品看板 (Step 2) - 蓝海评分
         ↓
广告验证 (Step 3) - 商业价值验证
```

## 📖 开发规范

本项目遵循 **Document-Driven Development (DDD)** 原则：

1. **先读文档**：开发前阅读 `.phrase/phases/.../` 下的文档
   - `spec_*.md`: 需求说明
   - `tech-refer_*.md`: 技术参考
   - `task_*.md`: 任务清单
2. **原子任务**：一次只做一个任务（taskNNN）
3. **严格类型**：使用 TypeScript，避免 `any`
4. **代码规范**：遵循 `.cursorrules` 中的规则

## 🗄️ 数据库

项目使用 Supabase (PostgreSQL)：

- **projects**: 项目表
- **keywords**: 关键词表（支持多种数据源：upload/taobao）

详细 Schema 见：`.phrase/docs/项目说明.md`

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**版本**: v0.2  
**最后更新**: 2025-01-03
