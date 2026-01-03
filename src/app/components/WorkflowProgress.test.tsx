import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WorkflowProgress from './WorkflowProgress'

describe('WorkflowProgress', () => {
  it('should render all steps', () => {
    render(
      <WorkflowProgress
        currentStep={0}
        completedSteps={[]}
      />
    )

    expect(screen.getByText('Step 0')).toBeInTheDocument()
    expect(screen.getByText('Step 1')).toBeInTheDocument()
    expect(screen.getByText('Step 2')).toBeInTheDocument()
    expect(screen.getByText('Step 3')).toBeInTheDocument()
    
    expect(screen.getByText('数据获取')).toBeInTheDocument()
    expect(screen.getByText('数据清洗')).toBeInTheDocument()
    expect(screen.getByText('选品看板')).toBeInTheDocument()
    expect(screen.getByText('广告验证')).toBeInTheDocument()
  })

  it('should mark current step correctly', () => {
    render(
      <WorkflowProgress
        currentStep={1}
        completedSteps={[0]}
      />
    )

    // 查找所有步骤圆圈按钮
    const buttons = screen.getAllByRole('button')
    
    // Step 0 应该已完成（绿色）
    expect(buttons[0]).toHaveClass('bg-green-500')
    
    // Step 1 应该是当前步骤（蓝色，有动画）
    expect(buttons[1]).toHaveClass('bg-blue-500')
    expect(buttons[1]).toHaveClass('animate-pulse')
    
    // Step 2 和 Step 3 应该是未开始状态（灰色）
    expect(buttons[2]).toHaveClass('bg-gray-200')
    expect(buttons[3]).toHaveClass('bg-gray-200')
  })

  it('should handle completed steps', () => {
    render(
      <WorkflowProgress
        currentStep={2}
        completedSteps={[0, 1]}
      />
    )

    const buttons = screen.getAllByRole('button')
    
    // 前两个步骤应该已完成
    expect(buttons[0]).toHaveClass('bg-green-500')
    expect(buttons[1]).toHaveClass('bg-green-500')
    
    // 当前步骤应该是 Step 2
    expect(buttons[2]).toHaveClass('bg-blue-500')
  })
})

