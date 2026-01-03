# Scripts 目录说明

本目录包含 NicheMiner 项目的所有 Python 脚本。

## 脚本列表

### 1. baidu_ad_validator.py

**功能**：百度竞价关键词商业价值验证工具

**用途**：批量检测关键词是否有百度广告投放，验证商业价值

**使用方法**：
```bash
# 基本用法
python scripts/baidu_ad_validator.py --input samples/keywords.xlsx --output keywords_validated.xlsx

# 无头模式
python scripts/baidu_ad_validator.py --headless

# 使用代理
python scripts/baidu_ad_validator.py --proxy http://proxy:port

# 移动端模式
python scripts/baidu_ad_validator.py --mobile
```

**详细文档**：见本目录下的 `README.md`（原 `README_BAIDU_VALIDATOR.md`）

### 2. taobao_miner.py

**功能**：淘宝关键词挖掘工具

**用途**：通过种子词搜索淘宝，抓取符合销量范围的长尾商品标题，清洗后存入数据库

**使用方法**：
```bash
# 首次登录（会弹出浏览器窗口）
python scripts/taobao_miner.py

# 后续可以直接使用保存的登录信息
python scripts/taobao_miner.py
```

**详细文档**：见 `.phrase/phases/phase-taobao-miner/spec_taobao.md`

## 目录结构

```
scripts/
├── baidu_ad_validator.py      # 百度广告验证脚本
├── taobao_miner.py            # 淘宝挖掘脚本
├── screenshots/               # 截图保存目录
│   └── *.png                  # 抓取过程中的截图
└── README.md                  # 本文件
```

## 依赖安装

```bash
# 安装 Python 依赖
pip install -r ../requirements.txt

# 安装 Playwright 浏览器
playwright install chromium
```

## 环境变量

### 百度广告验证工具

可以通过环境变量配置代理：
- `PROXY_1`, `PROXY_2`, ..., `PROXY_5` - 5个代理IP（用于轮换）

### 淘宝挖掘工具

- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_KEY` - Supabase API Key

## 注意事项

1. **截图目录**：默认截图保存在 `scripts/screenshots/` 目录
2. **认证文件**：淘宝登录信息保存在项目根目录的 `auth_taobao.json`（已在 .gitignore 中排除）
3. **临时文件**：验证过程的临时文件保存在项目根目录的 `temp/` 目录

## 相关文档

- 项目主文档：`.phrase/docs/项目说明.md`
- 百度验证工具：`.phrase/docs/百度关键词验证工具说明.md`
- 淘宝挖掘工具：`.phrase/phases/phase-taobao-miner/spec_taobao.md`
