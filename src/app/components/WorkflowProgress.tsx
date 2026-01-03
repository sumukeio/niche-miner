'use client'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

interface WorkflowProgressProps {
  currentStep: number
  completedSteps: number[] // 已完成的步骤数组，例如 [0, 1] 表示 Step 0 和 Step 1 已完成
  onStepClick?: (step: number) => void // 可选：点击步骤时触发
}

const STEP_LABELS = [
  { number: 0, name: '数据获取' },
  { number: 1, name: '数据清洗' },
  { number: 2, name: '选品看板' },
  { number: 3, name: '广告验证' },
]

export default function WorkflowProgress({ 
  currentStep, 
  completedSteps, 
  onStepClick 
}: WorkflowProgressProps) {
  const isCompleted = (step: number) => completedSteps.includes(step)
  const isCurrent = (step: number) => step === currentStep

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative">
        {/* 连接线 */}
        <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200 -z-10">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ 
              width: `${(completedSteps.length / STEP_LABELS.length) * 100}%` 
            }}
          />
        </div>

        {/* 步骤节点 */}
        {STEP_LABELS.map((step, index) => {
          const completed = isCompleted(step.number)
          const current = isCurrent(step.number)
          // 如果一个步骤已经完成，即使它是当前步骤，也应该显示为完成状态
          const clickable = (completed || current) && onStepClick

          return (
            <div
              key={step.number}
              className="flex flex-col items-center flex-1 relative z-10"
            >
              {/* 步骤圆圈 */}
              <button
                onClick={() => clickable && onStepClick?.(step.number)}
                disabled={!clickable}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-200
                  ${completed
                    ? 'bg-green-500 text-white shadow-lg'
                    : current
                    ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-200 animate-pulse'
                    : 'bg-gray-200 text-gray-400'
                  }
                  ${clickable ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                `}
              >
                {completed ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : current ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Circle className="w-6 h-6" />
                )}
              </button>

              {/* 步骤标签 */}
              <div className="mt-2 text-center">
                <div className={`
                  text-sm font-medium
                  ${completed || current ? 'text-gray-900' : 'text-gray-400'}
                `}>
                  Step {step.number}
                </div>
                <div className={`
                  text-xs mt-0.5
                  ${completed || current ? 'text-gray-700' : 'text-gray-400'}
                `}>
                  {step.name}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

