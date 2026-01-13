# Task070 执行说明

## 任务内容
创建 `filter_tasks` 和 `filter_results` 表，包含所有必要字段和索引。

## 执行步骤

### 1. 登录 Supabase
1. 访问 Supabase 项目 Dashboard
2. 进入 SQL Editor

### 2. 执行 SQL
1. 打开文件：`.phrase/phases/phase-excel-filter/task070_schema.sql`
2. 复制全部 SQL 代码
3. 在 Supabase SQL Editor 中粘贴并执行

### 3. 验证执行结果

#### 3.1 验证表是否创建成功
在 SQL Editor 中执行：
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('filter_tasks', 'filter_results');
```
应该返回 2 行：`filter_tasks` 和 `filter_results`

#### 3.2 验证表结构
```sql
-- 查看 filter_tasks 表结构
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'filter_tasks'
ORDER BY ordinal_position;

-- 查看 filter_results 表结构
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'filter_results'
ORDER BY ordinal_position;
```

#### 3.3 验证索引是否创建成功
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('filter_tasks', 'filter_results')
ORDER BY tablename, indexname;
```

应该看到以下索引：
- `idx_filter_tasks_user_id`
- `idx_filter_tasks_project_id`
- `idx_filter_tasks_status`
- `idx_filter_tasks_created_at`
- `idx_filter_results_task_id`
- `idx_filter_results_is_verified`
- `idx_filter_results_keyword_text`
- `idx_filter_results_created_at`

#### 3.4 验证 RLS 策略
```sql
-- 查看 filter_tasks 的 RLS 策略
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'filter_tasks';

-- 查看 filter_results 的 RLS 策略
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'filter_results';
```

应该看到每个表都有 4 个策略（SELECT, INSERT, UPDATE, DELETE）

### 4. 测试插入（可选）
```sql
-- 注意：需要先有一个有效的 user_id（从 auth.users 表获取）
-- 测试插入 filter_tasks（需要替换 user_id）
INSERT INTO filter_tasks (
  user_id,
  file_name,
  keyword,
  filter_rule,
  selected_columns
) VALUES (
  'your-user-id-here'::uuid,
  'test.xlsx',
  '手串',
  'suffix',
  '["关键词"]'::jsonb
) RETURNING *;

-- 测试插入 filter_results（需要替换 task_id）
INSERT INTO filter_results (
  task_id,
  keyword_text,
  source_column
) VALUES (
  'your-task-id-here'::uuid,
  '沉香手串',
  '关键词'
) RETURNING *;
```

## 注意事项

1. **外键依赖**：
   - `filter_tasks.project_id` 引用 `projects(id)`，如果 projects 表不存在会报错
   - `filter_tasks.user_id` 引用 `auth.users(id)`，这是 Supabase 默认表

2. **RLS 策略**：
   - 所有表都启用了 Row Level Security
   - 用户只能访问自己创建的任务和结果
   - 如果测试时遇到权限问题，检查 RLS 策略是否正确

3. **唯一约束**：
   - `filter_results` 表有 `UNIQUE(task_id, keyword_text)` 约束
   - 同一任务中不能有重复的关键词

4. **触发器**：
   - `filter_tasks.updated_at` 字段会在 UPDATE 时自动更新
   - 如果触发器函数已存在，不会报错（使用了 `CREATE OR REPLACE`）

## 完成标志

✅ 在 Supabase 后台的 Table Editor 中能看到 `filter_tasks` 和 `filter_results` 两个表  
✅ 所有索引创建成功（可通过上述 SQL 验证）  
✅ RLS 策略创建成功（可通过上述 SQL 验证）  
✅ 可以正常插入测试数据（可选）

完成验证后，在 `task_excel_filter.md` 中将 task070 标记为 `[x]` 已完成。

