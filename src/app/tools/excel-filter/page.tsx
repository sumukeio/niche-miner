'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertCircle, CheckCircle, ArrowRight, Home, ArrowLeft } from 'lucide-react'
import FileUploader from '@/app/components/excel-filter/FileUploader'
import DataPreview from '@/app/components/excel-filter/DataPreview'
import HeaderSelector from '@/app/components/excel-filter/HeaderSelector'
import FilterConfig from '@/app/components/excel-filter/FilterConfig'
import FilterResultView from '@/app/components/excel-filter/FilterResultView'
import {
  parseExcelFileWithHeader,
  generateDataPreview,
  detectHeaderRow,
  executeFilter,
  FilterRule,
  FilterStats,
  ExcelParseResult,
  HeaderDetectionResult
} from '@/lib/excelFilterUtils'

type Step = 'upload' | 'preview' | 'config' | 'result'

export default function ExcelFilterPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('upload')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // 文件相关状态
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ExcelParseResult | null>(null)
  const [detection, setDetection] = useState<HeaderDetectionResult | null>(null)
  const [preview, setPreview] = useState<any>(null)
  
  // 筛选相关状态
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [filterStats, setFilterStats] = useState<FilterStats | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [filterProgress, setFilterProgress] = useState({ current: 0, total: 0, message: '' })

  // 处理文件上传
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)
    setError(null)
    setLoading(true)

    try {
      // 解析文件
      const result = await parseExcelFileWithHeader(selectedFile)
      setParseResult(result)

      // 检测表头
      const detected = detectHeaderRow(result.rawRows)
      setDetection(detected)

      // 生成预览
      const previewData = generateDataPreview(result.headers, result.dataRows, 10)
      setPreview(previewData)

      setStep('preview')
    } catch (err: any) {
      setError(err.message || '文件解析失败')
      console.error('文件解析失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 处理表头行调整
  const handleHeaderRowChange = async (rowIndex: number) => {
    if (!file) return

    setLoading(true)
    try {
      const result = await parseExcelFileWithHeader(file, rowIndex)
      setParseResult(result)

      const detected = {
        headerRowIndex: rowIndex,
        headers: result.headers,
        confidence: 'high' as const
      }
      setDetection(detected)

      const previewData = generateDataPreview(result.headers, result.dataRows, 10)
      setPreview(previewData)
    } catch (err: any) {
      setError(err.message || '重新解析失败')
    } finally {
      setLoading(false)
    }
  }

  // 处理筛选
  const handleFilter = async (keyword: string, rule: FilterRule) => {
    if (!parseResult || selectedColumns.length === 0) {
      alert('请先选择要处理的列')
      return
    }

    setLoading(true)
    setError(null)
    setFilterProgress({ current: 0, total: parseResult.dataRows.length, message: '正在筛选...' })

    try {
      // 使用 Web Worker 或分块处理大文件
      const stats = await processFilterWithProgress(
        parseResult,
        selectedColumns,
        keyword,
        rule,
        (progress) => {
          setFilterProgress(progress)
        }
      )

      setFilterStats(stats)

      // 尝试保存到数据库
      try {
        const response = await fetch('/api/excel-filter/filter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileData: {
              rawRows: parseResult.rawRows,
              headers: parseResult.headers,
              dataRows: parseResult.dataRows
            },
            selectedColumns,
            keyword,
            filterRule: rule,
            fileName: file?.name,
            fileSize: file?.size,
            headerRowIndex: parseResult.headerRowIndex
          })
        })

        const data = await response.json()
        if (data.success && data.data.taskId) {
          setTaskId(data.data.taskId)
        }
      } catch (saveError) {
        console.warn('保存到数据库失败（可能未登录）:', saveError)
        // 不影响使用，继续显示结果
      }

      setStep('result')
    } catch (err: any) {
      setError(err.message || '筛选失败')
      console.error('筛选失败:', err)
    } finally {
      setLoading(false)
      setFilterProgress({ current: 0, total: 0, message: '' })
    }
  }

  // 带进度的筛选处理
  const processFilterWithProgress = async (
    parseResult: ExcelParseResult,
    selectedColumns: string[],
    keyword: string,
    rule: FilterRule,
    onProgress: (progress: { current: number; total: number; message: string }) => void
  ): Promise<FilterStats> => {
    // 对于大文件，分块处理
    const CHUNK_SIZE = 1000
    const totalRows = parseResult.dataRows.length

    if (totalRows <= CHUNK_SIZE) {
      // 小文件直接处理
      return executeFilter(
        parseResult.dataRows,
        parseResult.headers,
        selectedColumns,
        keyword,
        rule
      )
    }

    // 大文件分块处理
    const allResults: FilterStats['results'] = []
    const seen = new Set<string>()
    let filteredCount = 0

    for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
      const chunk = parseResult.dataRows.slice(i, i + CHUNK_SIZE)
      const chunkStats = executeFilter(
        chunk,
        parseResult.headers,
        selectedColumns,
        keyword,
        rule
      )

      // 合并结果并去重
      chunkStats.results.forEach(result => {
        const key = result.keyword.toLowerCase().trim()
        if (!seen.has(key)) {
          seen.add(key)
          allResults.push(result)
        }
      })

      filteredCount += chunkStats.filteredCount

      onProgress({
        current: Math.min(i + CHUNK_SIZE, totalRows),
        total: totalRows,
        message: `正在处理 ${Math.min(i + CHUNK_SIZE, totalRows)}/${totalRows} 行...`
      })

      // 让出主线程，避免阻塞 UI
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    return {
      totalRows,
      filteredCount,
      deduplicatedCount: allResults.length,
      results: allResults
    }
  }

  // 导入到手动筛选
  const handleImportToManual = () => {
    if (taskId) {
      router.push(`/tools/excel-filter/manual?taskId=${taskId}`)
    } else {
      alert('任务未保存，无法导入到手动筛选页面。请先登录后再试。')
    }
  }

  // 重置
  const handleReset = () => {
    setStep('upload')
    setFile(null)
    setParseResult(null)
    setDetection(null)
    setPreview(null)
    setSelectedColumns([])
    setFilterStats(null)
    setTaskId(null)
    setError(null)
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
            <span className="text-slate-600">Excel 智能筛选工具</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回工作台
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
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Excel 智能筛选工具</h1>
            <p className="text-slate-600">
              上传 Excel 文件，自动识别字段，按规则筛选提取关键词
            </p>
          </div>

        {/* 步骤指示器 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[
              { key: 'upload', label: '上传文件' },
              { key: 'preview', label: '预览数据' },
              { key: 'config', label: '配置筛选' },
              { key: 'result', label: '查看结果' }
            ].map((s, index) => (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                      step === s.key
                        ? 'bg-blue-600 text-white'
                        : ['upload', 'preview', 'config', 'result'].indexOf(step) > index
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {['upload', 'preview', 'config', 'result'].indexOf(step) > index ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className="mt-2 text-sm text-slate-600">{s.label}</span>
                </div>
                {index < 3 && (
                  <ArrowRight className="w-5 h-5 text-slate-400 mx-2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-sm text-red-600 hover:text-red-700"
            >
              关闭
            </button>
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="mb-6 p-6 bg-white border border-slate-300 rounded-lg">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <div className="flex-1">
                <div className="text-slate-800 font-medium">
                  {filterProgress.message || '处理中...'}
                </div>
                {filterProgress.total > 0 && (
                  <div className="mt-2">
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${(filterProgress.current / filterProgress.total) * 100}%`
                        }}
                      />
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {filterProgress.current} / {filterProgress.total}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 步骤内容 */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          {step === 'upload' && (
            <div>
              <FileUploader
                onFileSelect={handleFileSelect}
                disabled={loading}
              />
            </div>
          )}

          {step === 'preview' && parseResult && detection && preview && (
            <div className="space-y-6">
              <HeaderSelector
                detection={detection}
                totalRows={parseResult.rawRows.length}
                onHeaderRowChange={handleHeaderRowChange}
                onColumnsSelect={setSelectedColumns}
              />
              
              <DataPreview preview={preview} />
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                >
                  重新上传
                </button>
                <button
                  onClick={() => {
                    if (selectedColumns.length > 0) {
                      setStep('config')
                    } else {
                      alert('请至少选择一个列')
                    }
                  }}
                  disabled={selectedColumns.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一步：配置筛选
                </button>
              </div>
            </div>
          )}

          {step === 'config' && parseResult && (
            <div className="space-y-6">
              <FilterConfig
                availableColumns={parseResult.headers}
                selectedColumns={selectedColumns}
                onColumnsChange={setSelectedColumns}
                onFilter={handleFilter}
                disabled={loading}
              />
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep('preview')}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                >
                  上一步
                </button>
              </div>
            </div>
          )}

          {step === 'result' && filterStats && (
            <div className="space-y-6">
              <FilterResultView
                stats={filterStats}
                onImportToManual={taskId ? handleImportToManual : undefined}
              />
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                >
                  重新开始
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
