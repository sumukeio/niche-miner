'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import StepImport from '@/app/components/StepImport'
import StepRules from '@/app/components/StepRules'
import StepDashboard from '@/app/components/StepDashboard'
import { ArrowLeft, Home } from 'lucide-react'
import Link from 'next/link'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  
  const [currentStep, setCurrentStep] = useState(1)
  const [projectName, setProjectName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProjectInfo()
    // 检查项目是否已有数据，决定显示哪个步骤
    checkProjectStatus()
  }, [projectId])

  const loadProjectInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single()

      if (error) throw error
      if (data) {
        setProjectName(data.name)
      }
    } catch (error: any) {
      console.error('加载项目信息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkProjectStatus = async () => {
    try {
      // 检查是否有关键词数据
      const { count } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)

      if (count && count > 0) {
        // 如果有数据，检查是否有valid状态的关键词
        const { count: validCount } = await supabase
          .from('keywords')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('status', 'valid')

        if (validCount && validCount > 0) {
          // 有有效关键词，直接进入看板
          setCurrentStep(3)
        } else {
          // 有数据但还没清洗，进入清洗步骤
          setCurrentStep(2)
        }
      }
      // 如果没有数据，保持在步骤1（导入）
    } catch (error) {
      console.error('检查项目状态失败:', error)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    } else {
      router.push('/dashboard')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-500">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* 左侧：返回按钮和项目名称 */}
          <div className="flex items-center gap-4">
            <button 
              onClick={handleBack}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              title={currentStep > 1 ? "返回上一步" : "返回工作台"}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Link
              href="/dashboard"
              className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              title="返回工作台"
            >
              <Home className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{projectName || '项目详情'}</h1>
              <p className="text-xs text-slate-400">项目 ID: {projectId.slice(0, 8)}...</p>
            </div>
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
              projectId={projectId}
              onNext={() => {
                // 导入完成后，检查是否有数据，决定下一步
                checkProjectStatus()
                setCurrentStep(2)
              }} 
            />
          </div>
        )}

        {/* Step 2: 清洗 */}
        {currentStep === 2 && (
          <StepRules 
            projectId={projectId} 
            onNext={() => setCurrentStep(3)} 
          />
        )}

        {/* Step 3: 看板 */}
        {currentStep === 3 && (
          <StepDashboard 
            projectId={projectId} 
            onNext={() => {}} 
          />
        )}
      </main>
    </div>
  )
}

