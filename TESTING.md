# 测试文档

## 测试框架

项目使用 **Vitest** 作为测试框架，配合 **React Testing Library** 进行组件测试。

## 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并查看 UI（推荐）
npm run test:ui

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监听模式（开发时使用）
npm test -- --watch
```

## 测试结构

```
src/
├── lib/
│   └── supabaseClient.test.ts        # Supabase 客户端测试
└── app/
    └── components/
        └── WorkflowProgress.test.tsx  # 工作流进度组件测试

test/
├── setup.ts                          # 测试环境配置
└── utils.tsx                         # 测试工具函数
```

## 已实现的测试

### 1. Supabase Client 测试 (`src/lib/supabaseClient.test.ts`)
- ✅ 验证 Supabase 客户端是否正确初始化
- ✅ 验证基本的查询方法可用

### 2. WorkflowProgress 组件测试 (`src/app/components/WorkflowProgress.test.tsx`)
- ✅ 验证所有步骤都能正确渲染
- ✅ 验证当前步骤的正确标记
- ✅ 验证已完成步骤的状态

## 编写新测试

### 组件测试示例

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import YourComponent from './YourComponent'

describe('YourComponent', () => {
  it('should render correctly', () => {
    render(<YourComponent />)
    expect(screen.getByText('Expected Text')).toBeInTheDocument()
  })
})
```

### API 路由测试示例

```tsx
import { describe, it, expect, vi } from 'vitest'

describe('API Route', () => {
  it('should handle requests', async () => {
    // 测试逻辑
  })
})
```

## 测试覆盖率目标

- 组件测试覆盖率：> 70%
- 工具函数覆盖率：> 80%
- API 路由覆盖率：> 60%

## 最佳实践

1. **测试行为而非实现细节**：关注用户如何使用组件，而不是内部实现
2. **使用语义化查询**：优先使用 `getByRole`、`getByLabelText` 等
3. **测试可访问性**：确保组件对屏幕阅读器友好
4. **保持测试独立**：每个测试应该可以独立运行
5. **使用描述性的测试名称**：清楚表达测试的目的

## CI/CD 集成

测试将在 CI/CD 流程中自动运行：

```yaml
# 示例 GitHub Actions 配置
- name: Run tests
  run: npm test -- --run

- name: Generate coverage
  run: npm run test:coverage
```


