'use client'
import { useState } from 'react'
import StepImport from '@/app/components/StepImport'
import StepRules from '@/app/components/StepRules'
import StepDashboard from '@/app/components/StepDashboard'
import { ArrowLeft } from 'lucide-react' // 记得导入图标

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1)
  const [projectId, setProjectId] = useState<string | null>(null)

  // 返回上一页的逻辑
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          
          {/* 左侧：Logo 和 返回按钮 */}
          <div className="flex items-center gap-4">
            {currentStep > 1 && (
              <button 
                onClick={handleBack}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                title="返回上一步"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              NicheMiner <span className="text-xs font-normal text-slate-400 ml-1">v0.2</span>
            </h1>
          </div>

          {/* 右侧：步骤条 */}
          <div className="flex gap-2 text-sm text-slate-500">
            <span className={currentStep === 1 ? 'text-blue-600 font-bold' : ''}>1. 导入</span>
            <span>→</span>
            <span className={currentStep === 2 ? 'text-blue-600 font-bold' : ''}>2. 智能清洗</span>
            <span>→</span>
            <span className={currentStep === 3 ? 'text-blue-600 font-bold' : ''}>3. 选品看板</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto mt-10 p-6">
        {/* Step 1: 导入 */}
        {currentStep === 1 && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in slide-in-from-bottom-4">
            <StepImport 
              onNext={(id) => {
                setProjectId(id)
                setCurrentStep(2)
              }} 
            />
          </div>
        )}

        {/* Step 2: 清洗 */}
        {currentStep === 2 && projectId && (
          <StepRules 
            projectId={projectId} 
            onNext={() => setCurrentStep(3)} 
          />
        )}
        
        {/* 如果没项目ID却跳到了第2步，显示个错误提示 */}
        {currentStep === 2 && !projectId && (
          <div className="text-center py-20">
            <p className="text-red-500">请先完成第一步导入数据</p>
            <button onClick={() => setCurrentStep(1)} className="text-blue-500 underline mt-2">去导入</button>
          </div>
        )}

        {/* Step 3: 看板 */}
        {currentStep === 3 && projectId && (
          <StepDashboard 
            projectId={projectId} 
            onNext={() => {}} // 既然是最后一步，next 可以为空
          />
        )}
      </main>
    </div>
  )
}