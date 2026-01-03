'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Loader2 } from 'lucide-react'
import WorkflowProgress from '@/app/components/WorkflowProgress'
import StepDataAcquisition from '@/app/components/StepDataAcquisition'
import StepRules from '@/app/components/StepRules'
import StepDashboard from '@/app/components/StepDashboard'
import StepAdValidation from '@/app/components/StepAdValidation'

interface ProjectStats {
  totalKeywords: number
  pendingCount: number
  validCount: number
  trashCount: number
  hasValidatedAds: boolean
}

export default function WorkflowPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [stats, setStats] = useState<ProjectStats>({
    totalKeywords: 0,
    pendingCount: 0,
    validCount: 0,
    trashCount: 0,
    hasValidatedAds: false,
  })

  // 加载项目信息和统计
  useEffect(() => {
    if (projectId) {
      loadProjectData()
    }
  }, [projectId])

  // 当步骤变化时重新加载统计
  useEffect(() => {
    if (projectId) {
      loadStats()
    }
  }, [projectId, currentStep])

  const loadProjectData = async () => {
    try {
      setLoading(true)

      // 加载项目名称
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single()

      if (projectError) throw projectError
      if (project) {
        setProjectName(project.name)
      }

      // 加载统计信息
      await loadStats()
    } catch (error: any) {
      console.error('加载项目数据失败:', error)
      alert('加载项目失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      // 获取关键词统计
      const { count: totalCount } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .neq('status', 'trash')

      const { count: pendingCount } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'pending')

      const { count: validCount } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'valid')

      const { count: trashCount } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'trash')

      // 检查是否有广告验证结果（检查 keywords 表中是否有 has_ads 字段不为空）
      const { data: validatedData } = await supabase
        .from('keywords')
        .select('has_ads')
        .eq('project_id', projectId)
        .eq('status', 'valid')
        .not('has_ads', 'is', null)
        .limit(1)

      const newStats: ProjectStats = {
        totalKeywords: totalCount || 0,
        pendingCount: pendingCount || 0,
        validCount: validCount || 0,
        trashCount: trashCount || 0,
        hasValidatedAds: (validatedData?.length || 0) > 0,
      }

      setStats(newStats)

      // 根据统计信息判断当前步骤和已完成步骤
      const { current, completed } = determineSteps(newStats)
      setCurrentStep(current)
      setCompletedSteps(completed)
    } catch (error: any) {
      console.error('加载统计失败:', error)
    }
  }

  // 步骤判断逻辑（task060）
  const determineSteps = (stats: ProjectStats): { current: number; completed: number[] } => {
    const completed: number[] = []

    // Step 0: 数据获取
    // 如果有关键词，Step 0 完成
    if (stats.totalKeywords > 0) {
      completed.push(0)
    }

    // Step 1: 数据清洗
    // 判断条件（优先级从高到低）：
    // 1. 如果有 valid 关键词，说明清洗已经完成（最可靠的判断）
    // 2. 如果总关键词数 > 0 且 pendingCount = 0（所有关键词都已处理）
    // 注意：只要有 valid 关键词，无论 pendingCount 是多少，都认为清洗完成
    if (stats.validCount > 0) {
      completed.push(1)
    } else if (stats.pendingCount === 0 && stats.totalKeywords > 0) {
      completed.push(1)
    }

    // Step 2: 选品看板
    // 如果有 valid 关键词，Step 2 可以访问（视为完成）
    if (stats.validCount > 0) {
      completed.push(2)
    }

    // Step 3: 广告验证
    // 如果已有验证结果，Step 3 完成
    if (stats.hasValidatedAds) {
      completed.push(3)
    }

    // 判断当前应该显示的步骤
    let current = 0

    // 如果没有任何关键词，显示 Step 0
    if (stats.totalKeywords === 0) {
      current = 0
    }
    // 如果还有 pending 状态的关键词，显示 Step 1
    else if (stats.pendingCount > 0 && stats.validCount === 0) {
      current = 1
    }
    // 如果有 valid 关键词但未验证广告，显示 Step 2 或 Step 3
    else if (stats.validCount > 0) {
      if (!stats.hasValidatedAds) {
        current = 2 // 优先显示看板，让用户先看数据
      } else {
        current = 3
      }
    }

    return { current, completed }
  }

  const handleStepClick = (step: number) => {
    // 只允许点击已完成的步骤
    if (completedSteps.includes(step) || step <= currentStep) {
      setCurrentStep(step)
    }
  }

  const handleDataLoaded = () => {
    // 数据加载后，重新加载统计并自动进入下一步
    loadStats().then(() => {
      // 自动跳转到 Step 1（数据清洗）
      if (stats.totalKeywords > 0) {
        setCurrentStep(1)
      }
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                返回工作台
              </button>
              <div className="h-6 w-px bg-gray-300" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{projectName || '项目'}</h1>
                <p className="text-sm text-gray-500">项目工作流</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 工作流进度条 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <WorkflowProgress
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
          />
        </div>

        {/* 当前步骤内容 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {currentStep === 0 && (
            <StepDataAcquisition projectId={projectId} onDataLoaded={handleDataLoaded} />
          )}
          {currentStep === 1 && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">数据清洗</h2>
                <p className="text-gray-500">
                  通过智能分词和特征词提取，筛选出有价值的商品关键词
                </p>
              </div>
              <StepRules projectId={projectId} onNext={() => setCurrentStep(2)} />
            </div>
          )}
          {currentStep === 2 && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">选品看板</h2>
                <p className="text-gray-500">
                  查看蓝海评分最高的关键词，进行数据分析和导出
                </p>
              </div>
              <StepDashboard projectId={projectId} onNext={() => setCurrentStep(3)} />
            </div>
          )}
          {currentStep === 3 && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">广告验证</h2>
                <p className="text-gray-500">
                  验证关键词的商业价值，查看是否有同行投放广告
                </p>
              </div>
              <StepAdValidation projectId={projectId} onNext={() => {}} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

