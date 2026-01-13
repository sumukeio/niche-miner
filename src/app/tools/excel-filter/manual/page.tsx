'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, AlertCircle, Home } from 'lucide-react'
import ManualFilterView from '@/app/components/excel-filter/ManualFilterView'

export default function ManualFilterPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const taskId = searchParams.get('taskId')
  const [loading, setLoading] = useState(true)
  const [taskInfo, setTaskInfo] = useState<any>(null)

  useEffect(() => {
    if (taskId) {
      loadTaskInfo()
    } else {
      setLoading(false)
    }
  }, [taskId])

  const loadTaskInfo = async () => {
    try {
      const response = await fetch(`/api/excel-filter/tasks/${taskId}`)
      const data = await response.json()

      if (data.success) {
        setTaskInfo(data.data)
      } else {
        throw new Error(data.error || '加载任务信息失败')
      }
    } catch (error: any) {
      console.error('加载任务信息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!taskId) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <span>缺少任务ID参数</span>
            </div>
            <button
              onClick={() => router.push('/tools/excel-filter')}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              返回
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-slate-600">加载中...</span>
          </div>
        </div>
      </div>
    )
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
            <span className="text-slate-400">/</span>
            <Link href="/tools/excel-filter" className="text-slate-600 hover:text-slate-800">
              Excel 智能筛选
            </Link>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600">手动筛选</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/tools/excel-filter')}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回筛选工具
            </button>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              工作台
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Home className="w-4 h-4" />
              首页
            </Link>
          </div>
        </div>
      </header>

      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* 头部说明 */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-800">手动筛选与验证</h1>
            {taskInfo && (
              <div className="mt-2 text-sm text-slate-500">
                任务：{taskInfo.file_name} | 关键词：{taskInfo.keyword} | 规则：{
                  taskInfo.filter_rule === 'contains' ? '包含' :
                  taskInfo.filter_rule === 'suffix' ? '后缀' : '前缀'
                }
              </div>
            )}
          </div>

          {/* 手动筛选视图 */}
          <ManualFilterView taskId={taskId} />
        </div>
      </div>
    </div>
  )
}

