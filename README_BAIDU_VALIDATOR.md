# 百度竞价关键词商业价值验证工具

## 📋 项目简介

这是一个用于批量检测百度关键词是否有广告投放的自动化工具。通过搜索关键词并检测搜索结果中是否出现"广告"标识，来判断该关键词的商业价值。如果某个关键词有同行在投放广告，说明该词具有较高的商业价值（同行已验证 ROI）。

## 🎯 功能特性

- ✅ 批量读取 Excel 文件中的关键词
- ✅ 自动使用 Playwright 打开百度搜索
- ✅ 智能检测搜索结果中的广告标识
- ✅ 提取广告标题和链接（前3个）
- ✅ 自动保存截图（有广告的关键词）
- ✅ 随机等待，模拟真人操作，降低被封风险
- ✅ 异常处理，单个关键词失败不影响整体流程
- ✅ 结果导出到 Excel，保留原始数据

## 📦 安装步骤

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 2. 安装 Playwright 浏览器

```bash
playwright install chromium
```

或者安装所有浏览器：

```bash
playwright install
```

## 🚀 使用方法

### 准备工作

1. **准备 Excel 文件**: 在当前目录放置 `keywords.xlsx` 文件
2. **确保列名正确**: Excel 文件中必须有一列名为 `Keyword`（包含要验证的关键词）

示例 Excel 结构：

| Keyword |
|---------|
| 野生黄芪多少钱 |
| 黄芪的功效与作用 |
| 哪里买黄芪 |

### 基本使用

```bash
# 默认模式（显示浏览器窗口，方便观察）
python baidu_ad_validator.py

# 无头模式（后台运行，不显示浏览器）
python baidu_ad_validator.py --headless
```

### 高级选项

```bash
# 指定输入文件和输出文件
python baidu_ad_validator.py -i my_keywords.xlsx -o results.xlsx

# 指定关键词列名（如果列名不是 "Keyword"）
python baidu_ad_validator.py --column "关键词"

# 自定义截图保存目录
python baidu_ad_validator.py --screenshots my_screenshots

# 完整参数示例
python baidu_ad_validator.py -i keywords.xlsx -o validated.xlsx -c Keyword --screenshots screenshots --headless
```

### 参数说明

- `--input, -i`: 输入 Excel 文件路径（默认: `keywords.xlsx`）
- `--output, -o`: 输出 Excel 文件路径（默认: `keywords_validated.xlsx`）
- `--column, -c`: 关键词列名（默认: `Keyword`）
- `--headless`: 无头模式运行（不显示浏览器窗口）
- `--screenshots, -s`: 截图保存目录（默认: `screenshots`）

## 📊 输出结果

程序运行完成后，会生成以下文件：

### 1. Excel 结果文件

默认文件名: `keywords_validated.xlsx`

包含原始数据 + 以下新增列：

- **Has_Ads**: 是否有广告（Yes/No/Error）
- **Ad_Titles**: 广告标题列表（用 ` | ` 分隔，最多3个）
- **Ad_Links**: 广告链接列表（用 ` | ` 分隔，最多3个）

示例输出：

| Keyword | Has_Ads | Ad_Titles | Ad_Links |
|---------|---------|-----------|----------|
| 野生黄芪多少钱 | Yes | 野生黄芪价格_正品批发 | https://... |
| 黄芪的功效 | No | | |

### 2. 截图文件

如果关键词检测到广告，会在 `screenshots/` 目录下保存对应的截图（PNG 格式），文件名使用关键词名称（特殊字符会被清理）。

## ⚙️ 工作原理

1. **读取关键词**: 从 Excel 文件的 `Keyword` 列读取所有关键词
2. **启动浏览器**: 使用 Playwright 启动 Chromium 浏览器
3. **逐个搜索**: 
   - 访问百度首页
   - 输入关键词并搜索
   - 等待搜索结果加载
4. **检测广告**:
   - 扫描搜索结果页面
   - 查找包含"广告"或"推广"标识的结果项
   - 提取前3个广告的标题和链接
5. **保存结果**:
   - 如果发现广告，保存页面截图
   - 记录广告信息
6. **导出数据**: 将验证结果合并到原始 Excel 文件并保存

## 🛡️ 防封策略

- ✅ **随机等待**: 每次搜索之间随机等待 2-5 秒，模拟真人操作
- ✅ **真实 User-Agent**: 使用真实的 PC 端浏览器 User-Agent
- ✅ **自动化特征隐藏**: 使用 `--disable-blink-features=AutomationControlled` 减少自动化特征
- ✅ **操作间隔**: 搜索、点击等操作之间都有适当的延迟

## ⚠️ 注意事项

1. **使用频率**: 建议不要过于频繁地运行，避免被百度检测为机器人
2. **网络环境**: 确保网络连接稳定，避免频繁超时
3. **Excel 格式**: 确保 Excel 文件格式正确，列名匹配
4. **浏览器资源**: Playwright 会占用一定的系统资源，建议关闭不必要的程序
5. **页面变化**: 如果百度页面结构发生变化，可能需要更新选择器

## 🐛 常见问题

### Q: 提示 "文件未找到: keywords.xlsx"
A: 确保 Excel 文件在当前目录，或者使用 `-i` 参数指定正确的文件路径。

### Q: 提示 "Excel 文件中未找到列 'Keyword'"
A: 检查 Excel 文件的列名，或使用 `-c` 参数指定正确的列名。

### Q: 检测不到广告，但手动搜索能看到广告
A: 可能是页面加载时间不够，或者百度页面结构发生了变化。可以尝试：
- 检查截图（如果有保存）
- 增加等待时间（需要修改代码）
- 检查是否有验证码或反爬机制

### Q: 程序运行很慢
A: 这是正常的，因为：
- 每个关键词需要 2-5 秒的随机等待
- 页面加载需要时间
- 网络延迟

如果关键词很多（几千个），建议分批处理或使用无头模式提高效率。

### Q: 如何中断程序
A: 按 `Ctrl+C` 可以中断程序。已处理的关键词结果会保存在内存中，但只有程序正常结束时才会保存到 Excel。

## 📝 代码结构

```
baidu_ad_validator.py
├── BaiduAdValidator 类
│   ├── __init__: 初始化配置
│   ├── wait_random: 随机等待
│   ├── search_keyword: 搜索关键词
│   ├── detect_ads: 检测广告
│   ├── validate_keyword: 验证单个关键词
│   └── validate_batch: 批量验证
├── load_keywords_from_excel: 加载关键词
├── save_results_to_excel: 保存结果
└── main: 主函数
```

## 🔧 自定义配置

如果需要调整等待时间、检测逻辑等，可以修改 `baidu_ad_validator.py` 中的相应参数：

- `wait_random()`: 调整随机等待时间范围
- `detect_ads()`: 修改广告检测的选择器或逻辑
- `validate_keyword()`: 调整超时时间等参数

## 📄 许可证

本项目仅供学习和研究使用，请遵守百度的服务条款和使用规范。

