# Tech Reference: Excel 智能筛选工具

## Stack
- Framework: Next.js 14+ (App Router)
- Style: Tailwind CSS + Shadcn/UI
- DB: Supabase (PostgreSQL)
- Excel 解析: `xlsx` (SheetJS)
- Icons: `lucide-react`

## Schema (Database)

### filter_tasks 表
```sql
CREATE TABLE filter_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  header_row_index INT DEFAULT 0,
  selected_columns JSONB,
  keyword TEXT NOT NULL,
  filter_rule TEXT NOT NULL CHECK (filter_rule IN ('contains', 'suffix', 'prefix')),
  total_rows INT DEFAULT 0,
  filtered_count INT DEFAULT 0,
  deduplicated_count INT DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_filter_tasks_user_id ON filter_tasks(user_id);
CREATE INDEX idx_filter_tasks_project_id ON filter_tasks(project_id);
CREATE INDEX idx_filter_tasks_status ON filter_tasks(status);
```

### filter_results 表
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
  UNIQUE(task_id, keyword_text)
);

CREATE INDEX idx_filter_results_task_id ON filter_results(task_id);
CREATE INDEX idx_filter_results_is_verified ON filter_results(task_id, is_verified);
CREATE INDEX idx_filter_results_keyword_text ON filter_results(keyword_text);
```

## API Routes

### 文件上传与解析
- `POST /api/excel-filter/upload` - 上传并解析 Excel 文件
- `POST /api/excel-filter/detect-header` - 检测表头行

### 筛选处理
- `POST /api/excel-filter/filter` - 执行筛选
- `GET /api/excel-filter/tasks/:id` - 获取任务详情
- `GET /api/excel-filter/tasks/:id/results` - 获取筛选结果

### 手动筛选
- `POST /api/excel-filter/results/:id/verify` - 标记为已验证
- `POST /api/excel-filter/results/batch-verify` - 批量标记
- `GET /api/excel-filter/results` - 获取结果（支持筛选）

### 导出
- `GET /api/excel-filter/tasks/:id/export` - 导出为 CSV/Excel

## Key Functions

### 字段识别
```typescript
function detectHeaderRow(rows: string[][], maxScanRows = 10): number
```

### 筛选规则
```typescript
function filterByContains(text: string, keyword: string): string | null
function filterBySuffix(text: string, keyword: string): string | null
function filterByPrefix(text: string, keyword: string): string | null
```

### 去重
```typescript
function deduplicate(keywords: string[]): string[]
```

## Dependencies
- `xlsx`: ^0.18.5 (Excel 解析)
- `papaparse`: ^5.4.1 (CSV 导出，可选)

