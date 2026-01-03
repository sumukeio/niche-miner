import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'

// 自定义渲染函数，可以添加全局 providers（如主题、路由等）
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }


