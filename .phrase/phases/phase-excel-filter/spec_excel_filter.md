# Spec: Excel 智能筛选工具

## 1. Summary
在 NicheMiner 系统中新增独立的 Excel 智能筛选工具模块，支持自动识别字段、预览数据、按规则筛选提取关键词，并支持导入到手动筛选页面进行验证标记。

## 2. Goals
- **独立工具页面**：创建独立的 `/tools/excel-filter` 页面，不干扰现有工作流
- **智能字段识别**：自动识别 Excel 文件中的表头行，支持手动调整
- **数据预览**：以表格形式展示每列前 10 条数据，帮助用户确认字段
- **灵活筛选规则**：支持三种筛选规则（包含/后缀/前缀），准确提取关键词
- **手动筛选页面**：提供验证标记功能，支持筛选已验证/未验证的关键词
- **数据持久化**：筛选结果可保存到数据库，支持后续查看和导出

## 3. User Flows

### Flow 1: 文件上传与预览
1. 用户访问 `/tools/excel-filter` 页面
2. 上传 Excel 文件（`.xlsx`, `.xls`）
3. 系统自动识别表头行（扫描前 10 行，查找包含"关键词"等字段的行）
4. 显示字段列表和数据预览（每列前 10 条）
5. 用户确认或手动调整表头行号

### Flow 2: 配置筛选规则
1. 用户选择一个或多个要处理的列
2. 输入关键词（如"手串"）
3. 选择筛选规则：
   - 包含该关键词
   - 以该关键词为后缀
   - 以该关键词为前缀
4. 点击"开始筛选"按钮

### Flow 3: 查看筛选结果
1. 系统显示筛选进度
2. 筛选完成后显示结果列表和统计信息
3. 用户可以：
   - 查看详细结果
   - 导出结果（CSV/Excel）
   - 选择导入到手动筛选页面

### Flow 4: 手动筛选与验证
1. 用户选择"导入到手动筛选页面"
2. 进入手动筛选页面（`/tools/excel-filter/manual`）
3. 显示所有筛选出的关键词
4. 用户逐个或批量标记关键词为"已验证"
5. 使用筛选功能查看已验证/未验证的关键词
6. 导出最终验证结果

## 4. Technical Constraints

### 4.1 文件解析
- 使用 `xlsx` 库（SheetJS）解析 Excel 文件
- 支持 `.xlsx` 和 `.xls` 格式
- 处理大文件时使用流式读取，避免内存溢出
- 最大文件大小限制：50MB（可配置）

### 4.2 字段识别算法
- 扫描前 10 行（可配置）
- 查找包含常见字段关键词的行（"关键词"、"词"、"名称"、"标题"等）
- 如果未找到，默认使用第一行
- 支持用户手动指定表头行号

### 4.3 筛选规则实现

#### 规则1：包含该关键词
- 提取包含关键词的整个单元格内容
- 简单字符串匹配

#### 规则2：以该关键词为后缀
- 提取以关键词结尾的最长匹配片段
- 算法：找到关键词在文本中的最后位置，提取从开头到关键词结束的部分
- 示例："黄花梨手串价格" + "手串" → "黄花梨手串"

#### 规则3：以该关键词为前缀
- 提取以关键词开头的片段
- 可以提取整个文本，或提取到第一个分隔符（空格、标点等）

### 4.4 性能要求
- 处理 10,000 行数据，筛选时间 < 5 秒
- 大文件分块处理，显示进度条
- 前端使用 Web Worker 处理大量数据（可选）

### 4.5 数据存储
- 筛选任务和结果存储到 Supabase 数据库
- 支持临时存储（不保存到数据库，仅内存处理）
- 导入到手动筛选页面时，创建持久化记录

## 5. Database Schema

### 5.1 筛选任务表（filter_tasks）
```sql
CREATE TABLE filter_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  header_row_index INT DEFAULT 0,
  selected_columns JSONB,  -- 选中的列名数组，如 ["关键词", "PC日检索量"]
  keyword TEXT NOT NULL,
  filter_rule TEXT NOT NULL,  -- 'contains' | 'suffix' | 'prefix'
  total_rows INT DEFAULT 0,
  filtered_count INT DEFAULT 0,
  deduplicated_count INT DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_filter_tasks_user_id ON filter_tasks(user_id);
CREATE INDEX idx_filter_tasks_project_id ON filter_tasks(project_id);
CREATE INDEX idx_filter_tasks_status ON filter_tasks(status);
```

### 5.2 筛选结果表（filter_results）
```sql
CREATE TABLE filter_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES filter_tasks(id) ON DELETE CASCADE,
  keyword_text TEXT NOT NULL,
  source_column TEXT,
  source_row_index INT,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, keyword_text)  -- 同一任务中关键词唯一
);

CREATE INDEX idx_filter_results_task_id ON filter_results(task_id);
CREATE INDEX idx_filter_results_is_verified ON filter_results(task_id, is_verified);
CREATE INDEX idx_filter_results_keyword_text ON filter_results(keyword_text);
```

## 6. API Routes

### 6.1 文件上传与解析
- `POST /api/excel-filter/upload` - 上传 Excel 文件，返回解析结果
- `POST /api/excel-filter/detect-header` - 检测表头行

### 6.2 筛选处理
- `POST /api/excel-filter/filter` - 执行筛选，返回筛选结果
- `GET /api/excel-filter/tasks/:id` - 获取筛选任务详情
- `GET /api/excel-filter/tasks/:id/results` - 获取筛选结果列表

### 6.3 手动筛选
- `POST /api/excel-filter/results/:id/verify` - 标记关键词为已验证
- `POST /api/excel-filter/results/batch-verify` - 批量标记
- `GET /api/excel-filter/results` - 获取筛选结果（支持筛选已验证/未验证）

### 6.4 导出
- `GET /api/excel-filter/tasks/:id/export` - 导出筛选结果为 CSV/Excel

## 7. UI Components

### 7.1 页面组件
- `ExcelFilterPage` - 主页面（文件上传、预览、配置）
- `ManualFilterPage` - 手动筛选页面
- `FilterResultView` - 筛选结果展示组件

### 7.2 功能组件
- `FileUploader` - 文件上传组件
- `DataPreview` - 数据预览表格组件
- `FilterConfig` - 筛选配置表单组件
- `KeywordList` - 关键词列表组件（支持标记、筛选）
- `ProgressBar` - 进度条组件

## 8. 错误处理

### 8.1 文件解析错误
- 不支持的文件格式：提示用户上传正确的格式
- 文件损坏：提示用户重新上传
- 文件过大：提示用户压缩或分批处理

### 8.2 筛选错误
- 未选择列：提示用户选择至少一列
- 关键词为空：提示用户输入关键词
- 筛选结果为空：提示用户调整筛选规则

### 8.3 网络错误
- 上传失败：自动重试（最多 3 次）
- 保存失败：提示用户稍后重试

---

**文档版本**: 1.0  
**创建日期**: 2025-01-03  
**维护者**: NicheMiner 开发团队

