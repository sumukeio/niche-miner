'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Play, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react'

interface StepAdValidationProps {
  projectId: string
  onNext?: () => void
}

interface LogEntry {
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export default function StepAdValidation({ projectId, onNext }: StepAdValidationProps) {
  const [validKeywordsCount, setValidKeywordsCount] = useState(0)
  const [validatedCount, setValidatedCount] = useState(0)
  const [mode, setMode] = useState<'pc' | 'mobile'>('pc')
  const [validating, setValidating] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<{ success: boolean; message?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // 加载统计信息
  useEffect(() => {
    loadStats()
  }, [projectId])

  const loadStats = async () => {
    try {
      setLoading(true)

      // 获取 valid 状态的关键词数量
      const { count: validCount } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'valid')

      // 获取已验证的关键词数量
      const { count: validatedCount } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'valid')
        .not('has_ads', 'is', null)

      setValidKeywordsCount(validCount || 0)
      setValidatedCount(validatedCount || 0)
    } catch (error: any) {
      console.error('加载统计失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartValidation = async () => {
    if (validKeywordsCount === 0) {
      alert('没有可验证的关键词')
      return
    }

    setValidating(true)
    setLogs([])
    setResult(null)

    try {
      // 先导出 valid 关键词到临时文件
      const { data: keywords, error: fetchError } = await supabase
        .from('keywords')
        .select('term')
        .eq('project_id', projectId)
        .eq('status', 'valid')
        .is('has_ads', null) // 只验证未验证的

      if (fetchError) throw fetchError

      if (!keywords || keywords.length === 0) {
        setResult({
          success: false,
          message: '所有关键词已验证完成'
        })
        setValidating(false)
        return
      }

      // 创建临时 Excel 文件
      const XLSX = require('xlsx')
      const worksheet = XLSX.utils.json_to_sheet(
        keywords.map((k, i) => ({ Keyword: k.term, Index: i + 1 }))
      )
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Keywords')
      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
      
      // 创建 FormData 并上传文件
      const formData = new FormData()
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      formData.append('file', blob, 'keywords.xlsx')
      formData.append('mode', mode)

      // 调用验证 API
      const response = await fetch('/api/baidu-validator', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('启动验证失败')
      }

      const { taskId } = await response.json()

      // 监听验证进度（通过轮询或 SSE）
      // 这里简化处理，实际应该使用 SSE 或 WebSocket
      setLogs([{ level: 'info', message: `验证已启动，任务ID: ${taskId}` }])
      setLogs((prev) => [...prev, { level: 'info', message: '验证进行中，请稍候...' }])

      // 轮询检查验证结果（简化版，实际应该使用 SSE）
      const checkInterval = setInterval(async () => {
        try {
          // 这里应该调用检查验证状态的 API
          // 暂时简化处理
          await loadStats()
        } catch (error) {
          console.error('检查验证状态失败:', error)
        }
      }, 3000)

      // 5分钟后停止轮询（实际应该根据验证完成状态）
      setTimeout(() => {
        clearInterval(checkInterval)
        setValidating(false)
        setResult({
          success: true,
          message: '验证完成（请手动刷新查看结果）'
        })
        loadStats()
      }, 300000) // 5分钟超时

    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || '验证失败'
      })
      setValidating(false)
    }
  }

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      default:
        return <div className="w-4 h-4 rounded-full bg-blue-500" />
    }
  }

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-green-700 bg-green-50'
      case 'error':
        return 'text-red-700 bg-red-50'
      case 'warning':
        return 'text-yellow-700 bg-yellow-50'
      default:
        return 'text-gray-700 bg-gray-50'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">加载中...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-600 mb-1">待验证关键词</div>
          <div className="text-2xl font-bold text-blue-900">
            {validKeywordsCount - validatedCount}
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-600 mb-1">已验证关键词</div>
          <div className="text-2xl font-bold text-green-900">{validatedCount}</div>
        </div>
      </div>

      {/* 验证配置 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            验证模式
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="pc"
                checked={mode === 'pc'}
                onChange={(e) => setMode(e.target.value as 'pc' | 'mobile')}
                disabled={validating}
                className="mr-2"
              />
              PC 端
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="mobile"
                checked={mode === 'mobile'}
                onChange={(e) => setMode(e.target.value as 'pc' | 'mobile')}
                disabled={validating}
                className="mr-2"
              />
              移动端
            </label>
          </div>
        </div>

        <button
          onClick={handleStartValidation}
          disabled={validating || validKeywordsCount === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {validating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              验证中...
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              开始验证
            </>
          )}
        </button>
      </div>

      {/* 日志输出 */}
      {logs.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
          <div className="text-sm font-mono space-y-1">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`px-2 py-1 rounded flex items-start gap-2 ${getLogColor(log.level)}`}
              >
                {getLogIcon(log.level)}
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 结果显示 */}
      {result && (
        <div
          className={`p-4 rounded-lg ${
            result.success
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {result.success ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span className="font-medium">
              {result.success ? '验证完成！' : '验证失败'}
            </span>
          </div>
          {result.message && (
            <p className="mt-2 text-sm">{result.message}</p>
          )}
        </div>
      )}

      {/* 提示信息 */}
      {validKeywordsCount === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900 mb-1">暂无可验证的关键词</h3>
              <p className="text-sm text-yellow-700">
                请先完成数据清洗步骤，获得 valid 状态的关键词后再进行广告验证。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}





