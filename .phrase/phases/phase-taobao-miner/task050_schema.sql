-- Task050: 更新 keywords 表结构，支持淘宝数据源
-- 执行前请确认：此 SQL 需要在 Supabase SQL Editor 中执行

-- 1. 添加 source 字段（数据来源标识）
-- 默认值为 'upload'（兼容现有数据），新增值 'taobao' 表示来自淘宝挖掘
ALTER TABLE keywords 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload';

-- 添加注释说明
COMMENT ON COLUMN keywords.source IS '数据来源：upload（上传）, taobao（淘宝挖掘）';

-- 2. 添加 taobao_sales 字段（淘宝销量）
ALTER TABLE keywords 
ADD COLUMN IF NOT EXISTS taobao_sales INTEGER;

COMMENT ON COLUMN keywords.taobao_sales IS '淘宝商品销量（用于过滤红海/死海商品）';

-- 3. 添加 taobao_price 字段（淘宝价格）
ALTER TABLE keywords 
ADD COLUMN IF NOT EXISTS taobao_price NUMERIC(10, 2);

COMMENT ON COLUMN keywords.taobao_price IS '淘宝商品价格';

-- 4. 添加 origin_url 字段（商品详情页链接）
ALTER TABLE keywords 
ADD COLUMN IF NOT EXISTS origin_url TEXT;

COMMENT ON COLUMN keywords.origin_url IS '商品详情页链接（用于追溯）';

-- 5. 为 source 字段添加索引（便于查询不同来源的数据）
CREATE INDEX IF NOT EXISTS idx_keywords_source ON keywords(source);

-- 6. 为 taobao_sales 字段添加索引（便于销量范围查询）
CREATE INDEX IF NOT EXISTS idx_keywords_taobao_sales ON keywords(taobao_sales) 
WHERE taobao_sales IS NOT NULL;

-- 验证：查看表结构
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'keywords'
-- ORDER BY ordinal_position;


