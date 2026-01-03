'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, FolderOpen, Calendar, Trash2, ArrowRight, Loader2, CheckCircle2, Circle, Upload, ShoppingBag, CheckSquare, Square, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { importFileToProject } from '@/lib/fileImportUtils'

interface Project {
  id: string
  name: string
  created_at: string
  keywords_count?: number
  pending_count?: number
  valid_count?: number
  current_step?: number
  workflow_status?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  // 辅助函数：检查错误是否有实际内容
  const hasRealError = (error: any): boolean => {
    if (!error) return false
    
    // 如果是字符串，直接返回 true
    if (typeof error === 'string') return true
    
    // 如果是对象，检查是否有有意义的属性
    if (typeof error === 'object') {
      // 检查常见的错误属性
      if (error.message || error.code || error.details || error.hint) return true
      
      // 检查对象是否有非空属性
      const keys = Object.keys(error)
      if (keys.length === 0) return false
      
      // 检查是否有非空值的属性
      return keys.some(key => {
        const value = error[key]
        return value !== null && value !== undefined && value !== ''
      })
    }
    
    return false
  }

  // 辅助函数：安全地记录错误
  const logErrorIfReal = (message: string, error: any) => {
    if (hasRealError(error)) {
      console.error(message, error)
    }
  }

  const loadProjects = async () => {
    try {
      setLoading(true)
      
      // 查询项目列表（带重试机制）
      let data: any[] | null = null
      let queryError: any = null
      
      const queryProjects = async () => {
        const { data: result, error } = await supabase
          .from('projects')
          .select('id, name, created_at')
          .order('created_at', { ascending: false })
        return { data: result, error }
      }
      
      // 第一次查询
      const firstAttempt = await queryProjects()
      
      if (firstAttempt.error) {
        queryError = firstAttempt.error
        // 检查是否是"无法强制转换为单个 JSON 对象"的错误
        if (firstAttempt.error.message && firstAttempt.error.message.includes('Cannot coerce')) {
          console.warn('检测到查询错误，尝试重新查询...', firstAttempt.error)
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, 300))
          const retryAttempt = await queryProjects()
          if (retryAttempt.error) {
            throw new Error(retryAttempt.error.message || '查询项目失败')
          }
          data = retryAttempt.data
        } else {
          throw new Error(firstAttempt.error.message || '查询项目失败')
        }
      } else {
        data = firstAttempt.data
      }

      if (!data || data.length === 0) {
        setProjects([])
        setLoading(false)
        return
      }

      // 处理数据，获取每个项目的详细统计
      // 使用 Promise.allSettled 而不是 Promise.all，确保即使某个项目查询失败，其他项目仍能正常加载
      const projectsWithStatsResults = await Promise.allSettled(
        (data || []).map(async (project: any) => {
          // 验证项目数据有效性
          if (!project || !project.id) {
            console.warn('跳过无效的项目数据:', project)
            return null
          }
          try {
            // 获取关键词统计
            const { count: totalCount, error: totalError } = await supabase
              .from('keywords')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', project.id)
              .neq('status', 'trash')

            logErrorIfReal(`查询项目 ${project.id} 总关键词数失败:`, totalError)

            const { count: pendingCount, error: pendingError } = await supabase
              .from('keywords')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', project.id)
              .eq('status', 'pending')

            logErrorIfReal(`查询项目 ${project.id} 待清洗关键词数失败:`, pendingError)

            const { count: validCount, error: validError } = await supabase
              .from('keywords')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', project.id)
              .eq('status', 'valid')

            logErrorIfReal(`查询项目 ${project.id} 有效关键词数失败:`, validError)

            // 判断当前步骤
            let currentStep = 0
            let workflowStatus = '未开始'
            
            if ((totalCount || 0) === 0) {
              currentStep = 0
              workflowStatus = '数据获取'
            } else if ((pendingCount || 0) > 0) {
              currentStep = 1
              workflowStatus = '数据清洗'
            } else if ((validCount || 0) > 0) {
              // 检查是否有广告验证结果
              const { count: validatedCount, error: validatedError } = await supabase
                .from('keywords')
                .select('*', { count: 'exact', head: true })
                .eq('project_id', project.id)
                .eq('status', 'valid')
                .not('has_ads', 'is', null)
              
              logErrorIfReal(`查询项目 ${project.id} 验证结果失败:`, validatedError)
              
              if ((validatedCount || 0) > 0) {
                currentStep = 3
                workflowStatus = '已完成'
              } else {
                currentStep = 2
                workflowStatus = '选品看板'
              }
            }

            return {
              id: project.id,
              name: project.name,
              created_at: project.created_at,
              keywords_count: totalCount || 0,
              pending_count: pendingCount || 0,
              valid_count: validCount || 0,
              current_step: currentStep,
              workflow_status: workflowStatus
            }
          } catch (err: any) {
            console.error(`处理项目 ${project.id} 数据时出错:`, err)
            // 即使单个项目出错，也返回基本信息
            return {
              id: project.id,
              name: project.name,
              created_at: project.created_at,
              keywords_count: 0,
              pending_count: 0,
              valid_count: 0,
              current_step: 0,
              workflow_status: '未开始'
            }
          }
        })
      )

      // 过滤掉失败的结果和 null 值，只保留成功的项目
      const projectsWithStats = projectsWithStatsResults
        .filter((result): result is PromiseFulfilledResult<any> => 
          result.status === 'fulfilled' && result.value !== null
        )
        .map(result => result.value)

      setProjects(projectsWithStats)
    } catch (error: any) {
      console.error('加载项目失败:', error)
      const errorMessage = error?.message || error?.toString() || '未知错误'
      alert('加载项目失败: ' + errorMessage)
      // 即使出错也设置空数组，避免无限加载
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadProgress(0)
    setUploadStatus('')

    try {
      // 使用共享的导入函数，自动创建项目并导入数据
      const { projectId, importedCount } = await importFileToProject(
        file,
        undefined, // 不提供projectId，会自动创建
        (progress) => {
          setUploadProgress(progress.progress)
          setUploadStatus(progress.statusText)
        }
      )

      // 导入完成后跳转到工作流页面
      router.push(`/project/${projectId}/workflow`)
    } catch (error: any) {
      alert('导入失败: ' + error.message)
      setUploading(false)
      setUploadProgress(0)
      setUploadStatus('')
    } finally {
      // 重置文件输入
      e.target.value = ''
    }
  }

  // 处理长按开始
  const handleLongPressStart = (projectId: string) => {
    if (selectionMode) return // 如果已经在选择模式，不处理长按
    
    const timer = setTimeout(() => {
      setSelectionMode(true)
      // 长按时自动选中该项目
      setSelectedProjects(new Set([projectId]))
      setLongPressTimer(null)
    }, 500) // 500ms 长按判定
    
    setLongPressTimer(timer)
  }

  // 处理长按结束/取消
  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  // 退出选择模式
  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedProjects(new Set())
  }

  // 切换单个项目选中状态
  const toggleProjectSelection = (projectId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!selectionMode) {
      setSelectionMode(true)
    }
    
    setSelectedProjects(prev => {
      const newSet = new Set(prev)
      if (newSet.has(projectId)) {
        newSet.delete(projectId)
      } else {
        newSet.add(projectId)
      }
      return newSet
    })
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedProjects.size === projects.length) {
      setSelectedProjects(new Set())
    } else {
      setSelectedProjects(new Set(projects.map(p => p.id)))
    }
  }

  // 删除单个项目
  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm('确定要删除这个项目吗？这将删除所有相关的关键词数据。')) {
      return
    }

    await deleteProjects([projectId])
  }

  // 批量删除项目
  const handleBatchDelete = async () => {
    if (selectedProjects.size === 0) return

    const count = selectedProjects.size
    if (!confirm(`确定要删除选中的 ${count} 个项目吗？这将删除所有相关的关键词数据。`)) {
      return
    }

    await deleteProjects(Array.from(selectedProjects))
    // 删除后退出选择模式
    exitSelectionMode()
  }

  // 删除项目的核心逻辑（支持单个和批量）
  const deleteProjects = async (projectIds: string[]) => {
    if (projectIds.length === 0) return

    try {
      setDeleting(true)

      // 分批删除关键词，避免超时（每批最多 1000 条）
      // 先尝试批量删除，如果失败则逐个项目删除
      try {
        const { error: keywordsError } = await supabase
          .from('keywords')
          .delete()
          .in('project_id', projectIds)

        if (keywordsError && hasRealError(keywordsError)) {
          // 如果批量删除失败，尝试逐个项目删除关键词
          console.warn('批量删除关键词失败，尝试逐个删除:', keywordsError)
          
          for (const projectId of projectIds) {
            const { error: singleError } = await supabase
              .from('keywords')
              .delete()
              .eq('project_id', projectId)
            
            if (singleError && hasRealError(singleError)) {
              console.warn(`删除项目 ${projectId} 的关键词时出错:`, singleError)
            }
          }
        }
      } catch (keywordsErr: unknown) {
        // 如果删除关键词失败，继续尝试删除项目（可能数据库有级联删除）
        console.warn('删除关键词时出现异常（继续删除项目）:', keywordsErr)
      }

      // 删除项目（移除 .select() 以减少查询时间）
      // 如果项目很多，也尝试分批删除
      if (projectIds.length === 1) {
        // 单个项目删除
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', projectIds[0])

        if (error) {
          throw new Error(error.message || '删除项目失败')
        }
      } else {
        // 批量删除项目，如果失败则逐个删除
        const { error: batchError } = await supabase
          .from('projects')
          .delete()
          .in('id', projectIds)

        if (batchError && hasRealError(batchError)) {
          // 批量删除失败，尝试逐个删除
          console.warn('批量删除项目失败，尝试逐个删除:', batchError)
          
          const failedIds: string[] = []
          for (const projectId of projectIds) {
            const { error: singleError } = await supabase
              .from('projects')
              .delete()
              .eq('id', projectId)
            
            if (singleError && hasRealError(singleError)) {
              failedIds.push(projectId)
              console.error(`删除项目 ${projectId} 失败:`, singleError)
            }
          }
          
          if (failedIds.length > 0) {
            throw new Error(`部分项目删除失败: ${failedIds.join(', ')}`)
          }
        } else if (batchError) {
          // 空错误对象，可能是超时，但操作可能已成功
          console.warn('删除操作可能超时，但可能已成功:', batchError)
        }
      }

      // 等待数据库操作完成
      await new Promise(resolve => setTimeout(resolve, 300))

      // 从当前列表中移除已删除的项目
      setProjects(prev => prev.filter(p => !projectIds.includes(p.id)))

      // 清空选中状态
      setSelectedProjects(new Set())

      // 延迟重新加载项目列表
      setTimeout(async () => {
        try {
          await loadProjects()
        } catch (reloadError: unknown) {
          console.error('重新加载项目列表失败:', reloadError)
        }
      }, 200)
    } catch (error: unknown) {
      // 改进错误处理，提取更多错误信息
      let errorMessage = '未知错误'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null) {
        const err = error as { message?: string; code?: string; details?: string; hint?: string }
        errorMessage = err.message || err.code || err.details || err.hint || '未知错误'
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      console.error('删除项目失败:', error)
      
      // 检查是否是超时错误
      if (errorMessage.includes('timeout') || errorMessage.includes('canceling statement')) {
        alert('删除操作超时。如果项目包含大量数据，删除可能需要更长时间。\n\n请稍后刷新页面查看删除结果。')
      } else {
        alert(`删除项目失败: ${errorMessage}`)
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              NicheMiner
            </Link>
            <span className="text-slate-400">工作台</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* 创建项目区域 - 两个并排的大方块 */}
        <div className="mb-8 grid md:grid-cols-2 gap-6">
          {/* 左边：导入长尾词 */}
          <label className="block">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="file-upload"
            />
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-12 text-center cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl h-full flex items-center justify-center min-h-[200px]">
              {uploading ? (
                <div className="flex flex-col items-center gap-4 w-full">
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                  <span className="text-white font-semibold text-lg">{uploadStatus || '正在导入数据...'}</span>
                  {uploadProgress > 0 && (
                    <div className="w-full max-w-xs bg-white/20 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-white h-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">导入长尾词</h3>
                    <p className="text-blue-100">
                      上传长尾词文件（支持 CSV、XLSX、XLS 格式）
                    </p>
                  </div>
                </div>
              )}
            </div>
          </label>

          {/* 右边：去淘宝挖掘 */}
          <Link
            href="/taobao-miner"
            className="block"
          >
            <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl p-12 text-center cursor-pointer hover:from-orange-700 hover:to-red-700 transition-all shadow-lg hover:shadow-xl h-full flex items-center justify-center min-h-[200px]">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <ShoppingBag className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">去淘宝挖掘</h3>
                  <p className="text-orange-100">
                    通过种子词挖掘淘宝长尾需求
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* 项目列表 */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-800">我的项目</h2>
            
            {/* 批量操作工具栏 - 只在选择模式下显示 */}
            {selectionMode && projects.length > 0 && (
              <div className="flex items-center gap-4">
                {selectedProjects.size > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">
                      已选中 {selectedProjects.size} 个项目
                    </span>
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      disabled={deleting}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>删除中...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>批量删除</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2 text-sm"
                >
                  {selectedProjects.size === projects.length ? (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      <span>取消全选</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" />
                      <span>全选</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={exitSelectionMode}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2 text-sm"
                  title="退出选择模式"
                >
                  <X className="w-4 h-4" />
                  <span>取消</span>
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-slate-500">加载中...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center">
              <FolderOpen className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 text-lg mb-2">还没有项目</p>
              <p className="text-slate-400">点击上方按钮上传文件创建第一个项目</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => {
                const isSelected = selectedProjects.has(project.id)
                return (
                  <div
                    key={project.id}
                    className={`relative bg-white rounded-xl border p-6 hover:shadow-lg transition-all group ${
                      isSelected 
                        ? 'border-blue-500 shadow-md ring-2 ring-blue-200' 
                        : 'border-slate-200 hover:border-blue-300'
                    }`}
                    onMouseDown={() => handleLongPressStart(project.id)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    onTouchStart={() => handleLongPressStart(project.id)}
                    onTouchEnd={handleLongPressEnd}
                    onTouchCancel={handleLongPressEnd}
                  >
                    {/* 复选框 - 左上角，只在选择模式下显示 */}
                    {selectionMode && (
                      <button
                        type="button"
                        onClick={(e) => toggleProjectSelection(project.id, e)}
                        className="absolute top-4 left-4 z-20 p-1 rounded hover:bg-slate-100 transition-colors"
                        title={isSelected ? '取消选择' : '选择项目'}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                    )}

                    {/* 删除按钮 - 使用绝对定位，脱离链接区域，只在非选择模式下显示 */}
                    {!selectionMode && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 z-10"
                        title="删除项目"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    
                    {/* 卡片内容区域 */}
                    <div className={`mb-4 ${selectionMode ? 'pl-10' : ''} pr-8`}>
                      <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(project.created_at).toLocaleDateString('zh-CN')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span>{project.keywords_count || 0} 个关键词</span>
                        </div>
                      </div>
                      
                      {/* 工作流进度 */}
                      {project.keywords_count !== undefined && project.keywords_count > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-slate-600">工作流进度:</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              project.current_step === 0 ? 'bg-blue-100 text-blue-700' :
                              project.current_step === 1 ? 'bg-yellow-100 text-yellow-700' :
                              project.current_step === 2 ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {project.workflow_status || '未开始'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {[0, 1, 2, 3].map((step) => {
                              const isCompleted = project.current_step !== undefined && step < project.current_step
                              const isCurrent = project.current_step === step
                              
                              return (
                                <div key={step} className="flex items-center gap-1">
                                  {isCompleted ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  ) : isCurrent ? (
                                    <Circle className="w-4 h-4 text-blue-500 fill-blue-500" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-gray-300" />
                                  )}
                                  {step < 3 && <div className={`w-2 h-0.5 ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} />}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* 统计信息 */}
                      {project.pending_count !== undefined && project.valid_count !== undefined && (
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          {project.pending_count > 0 && (
                            <span>待清洗: {project.pending_count}</span>
                          )}
                          {project.valid_count > 0 && (
                            <span className="text-green-600">有效: {project.valid_count}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* 底部链接/选择提示 */}
                    {selectionMode ? (
                      <div 
                        onClick={(e) => {
                          e.preventDefault()
                          toggleProjectSelection(project.id, e as any)
                        }}
                        className="flex items-center text-blue-600 font-medium cursor-pointer"
                      >
                        <span>点击选择</span>
                      </div>
                    ) : (
                      <Link
                        href={`/project/${project.id}/workflow`}
                        className="block"
                        onClick={(e) => {
                          // 如果正在长按，阻止跳转
                          if (longPressTimer) {
                            e.preventDefault()
                          }
                        }}
                      >
                        <div className="flex items-center text-blue-600 font-medium group-hover:gap-2 transition-all">
                          <span>进入工作流</span>
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}







