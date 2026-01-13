-- Task070: 创建 Excel 智能筛选工具的数据库表
-- 执行前请确认：此 SQL 需要在 Supabase SQL Editor 中执行

-- 1. 创建 filter_tasks 表（筛选任务表）
CREATE TABLE IF NOT EXISTS filter_tasks (
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

-- 添加表注释
COMMENT ON TABLE filter_tasks IS 'Excel 筛选任务表，记录每次筛选任务的配置和状态';

-- 添加字段注释
COMMENT ON COLUMN filter_tasks.project_id IS '关联的项目ID（可选，筛选结果可以关联到项目）';
COMMENT ON COLUMN filter_tasks.user_id IS '创建任务的用户ID';
COMMENT ON COLUMN filter_tasks.file_name IS '上传的Excel文件名';
COMMENT ON COLUMN filter_tasks.file_size IS '文件大小（字节）';
COMMENT ON COLUMN filter_tasks.header_row_index IS '表头所在行号（从0开始）';
COMMENT ON COLUMN filter_tasks.selected_columns IS '选中的列名数组，JSON格式，如 ["关键词", "PC日检索量"]';
COMMENT ON COLUMN filter_tasks.keyword IS '筛选关键词';
COMMENT ON COLUMN filter_tasks.filter_rule IS '筛选规则：contains（包含）、suffix（后缀）、prefix（前缀）';
COMMENT ON COLUMN filter_tasks.total_rows IS '原始数据总行数';
COMMENT ON COLUMN filter_tasks.filtered_count IS '筛选后的数据条数';
COMMENT ON COLUMN filter_tasks.deduplicated_count IS '去重后的数据条数';
COMMENT ON COLUMN filter_tasks.status IS '任务状态：pending（待处理）、processing（处理中）、completed（已完成）、failed（失败）';
COMMENT ON COLUMN filter_tasks.error_message IS '错误信息（如果任务失败）';

-- 2. 创建 filter_results 表（筛选结果表）
CREATE TABLE IF NOT EXISTS filter_results (
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

-- 添加表注释
COMMENT ON TABLE filter_results IS 'Excel 筛选结果表，存储筛选出的关键词及其验证状态';

-- 添加字段注释
COMMENT ON COLUMN filter_results.task_id IS '关联的筛选任务ID';
COMMENT ON COLUMN filter_results.keyword_text IS '筛选出的关键词文本';
COMMENT ON COLUMN filter_results.source_column IS '来源列名';
COMMENT ON COLUMN filter_results.source_row_index IS '来源行号（在原始Excel中的行号）';
COMMENT ON COLUMN filter_results.is_verified IS '是否已验证';
COMMENT ON COLUMN filter_results.verified_at IS '验证时间';

-- 3. 创建索引

-- filter_tasks 表索引
CREATE INDEX IF NOT EXISTS idx_filter_tasks_user_id ON filter_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_filter_tasks_project_id ON filter_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_filter_tasks_status ON filter_tasks(status);
CREATE INDEX IF NOT EXISTS idx_filter_tasks_created_at ON filter_tasks(created_at DESC);

-- filter_results 表索引
CREATE INDEX IF NOT EXISTS idx_filter_results_task_id ON filter_results(task_id);
CREATE INDEX IF NOT EXISTS idx_filter_results_is_verified ON filter_results(task_id, is_verified);
CREATE INDEX IF NOT EXISTS idx_filter_results_keyword_text ON filter_results(keyword_text);
CREATE INDEX IF NOT EXISTS idx_filter_results_created_at ON filter_results(created_at DESC);

-- 4. 创建 updated_at 自动更新触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. 为 filter_tasks 表创建 updated_at 自动更新触发器
DROP TRIGGER IF EXISTS update_filter_tasks_updated_at ON filter_tasks;
CREATE TRIGGER update_filter_tasks_updated_at
  BEFORE UPDATE ON filter_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. 启用 Row Level Security (RLS)
ALTER TABLE filter_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE filter_results ENABLE ROW LEVEL SECURITY;

-- 7. 创建 RLS 策略：用户只能访问自己的任务和结果
-- filter_tasks 表策略
CREATE POLICY "Users can view their own filter tasks"
  ON filter_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own filter tasks"
  ON filter_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own filter tasks"
  ON filter_tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own filter tasks"
  ON filter_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- filter_results 表策略（通过 task_id 关联到用户）
CREATE POLICY "Users can view results of their own tasks"
  ON filter_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM filter_tasks
      WHERE filter_tasks.id = filter_results.task_id
      AND filter_tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert results for their own tasks"
  ON filter_results FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM filter_tasks
      WHERE filter_tasks.id = filter_results.task_id
      AND filter_tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update results of their own tasks"
  ON filter_results FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM filter_tasks
      WHERE filter_tasks.id = filter_results.task_id
      AND filter_tasks.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM filter_tasks
      WHERE filter_tasks.id = filter_results.task_id
      AND filter_tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete results of their own tasks"
  ON filter_results FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM filter_tasks
      WHERE filter_tasks.id = filter_results.task_id
      AND filter_tasks.user_id = auth.uid()
    )
  );

-- 验证：查看表结构
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'filter_tasks'
-- ORDER BY ordinal_position;

-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'filter_results'
-- ORDER BY ordinal_position;

-- 验证：查看索引
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('filter_tasks', 'filter_results')
-- ORDER BY tablename, indexname;

