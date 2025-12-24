'use client'
import { useState, useRef, useEffect } from 'react'
import { Monitor, Smartphone, Loader2, Download, X, CheckCircle, AlertCircle, Server } from 'lucide-react'
import Link from 'next/link'

interface LogEntry {
  id: string
  time: string
  level: 'info' | 'success' | 'error' | 'warning'
  message: string
}

interface AdResult {
  keyword: string
  ad_titles: string[]
  ad_links: string[]
}

interface ValidatorResult {
  mode: 'pc' | 'mobile'
  total_keywords: number
  keywords_with_ads: number
  unique_ads: AdResult[]
}

export default function AdValidatorPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [currentMode, setCurrentMode] = useState<'pc' | 'mobile' | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [pcResults, setPcResults] = useState<ValidatorResult | null>(null)
  const [mobileResults, setMobileResults] = useState<ValidatorResult | null>(null)
  const [currentProxyIndex, setCurrentProxyIndex] = useState(0)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // 添加日志
  const addLog = (level: LogEntry['level'], message: string) => {
    const entry: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString('zh-CN'),
      level,
      message
    }
    setLogs(prev => [...prev, entry])
  }

  // 清理日志
  const clearLogs = () => {
    setLogs([])
  }

  // 开始验证
  const startValidation = async (mode: 'pc' | 'mobile') => {
    if (!selectedFile) {
      alert('请先选择关键词文件')
      return
    }

    setIsRunning(true)
    setCurrentMode(mode)
    setCurrentProxyIndex(0)
    
    // 清空之前的结果
    if (mode === 'pc') {
      setPcResults(null)
    } else {
      setMobileResults(null)
    }

    // 创建FormData
    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('mode', mode)

    try {
      addLog('info', `开始${mode === 'pc' ? 'PC端' : '移动端'}验证...`)
      
      // 发送文件（使用POST）
      const uploadResponse = await fetch('/api/baidu-validator', {
        method: 'POST',
        body: formData
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json()
        throw new Error(errorData.error || '启动验证失败')
      }

      const { taskId } = await uploadResponse.json()
      addLog('info', `任务ID: ${taskId}`)

      // 创建EventSource用于接收实时日志
      const eventSource = new EventSource(`/api/baidu-validator?taskId=${taskId}`)
      eventSourceRef.current = eventSource

      // 监听日志流
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'log') {
            addLog(data.level, data.message)
          } else if (data.type === 'proxy_change') {
            setCurrentProxyIndex(data.index)
            addLog('info', `切换到代理 ${data.index + 1}/5: ${data.proxy}`)
          } else if (data.type === 'progress') {
            addLog('info', `进度: ${data.current}/${data.total} - ${data.keyword}`)
          } else if (data.type === 'result') {
            addLog('success', '验证完成！')
            
            const result: ValidatorResult = {
              mode: data.result.mode,
              total_keywords: data.result.total_keywords,
              keywords_with_ads: data.result.keywords_with_ads,
              unique_ads: data.result.unique_ads
            }

            if (mode === 'pc') {
              setPcResults(result)
            } else {
              setMobileResults(result)
            }
            
            setIsRunning(false)
            eventSource.close()
          } else if (data.type === 'error') {
            addLog('error', data.message)
            setIsRunning(false)
            eventSource.close()
          }
        } catch (e) {
          console.error('解析事件数据失败:', e)
        }
      }

      eventSource.onerror = (error) => {
        console.error('EventSource错误:', error)
        addLog('error', '连接中断，请检查网络')
        setIsRunning(false)
        eventSource.close()
      }

    } catch (error: any) {
      addLog('error', `启动失败: ${error.message}`)
      setIsRunning(false)
    }
  }

  // 停止验证
  const stopValidation = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    
    fetch('/api/baidu-validator/stop', { method: 'POST' })
      .catch(console.error)
    
    setIsRunning(false)
    addLog('warning', '验证已停止')
  }

  // 导出结果
  const exportResults = (results: ValidatorResult) => {
    const csvRows: string[] = []
    
    // CSV头部
    csvRows.push('关键词,广告标题1,广告链接1,广告标题2,广告链接2,广告标题3,广告链接3')
    
    // 数据行
    results.unique_ads.forEach(ad => {
      const titles = [...ad.ad_titles, '', '', ''].slice(0, 3)
      const links = [...ad.ad_links, '', '', ''].slice(0, 3)
      
      const row = [
        ad.keyword,
        ...titles.flatMap((title, i) => [title, links[i]])
      ].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
      
      csvRows.push(row)
    })
    
    const csv = '\uFEFF' + csvRows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `百度广告验证_${results.mode === 'pc' ? 'PC端' : '移动端'}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  // 清理资源
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
              <X className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              百度广告验证工具
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* 文件选择和操作区域 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">1. 选择关键词文件</h2>
          
          <div className="flex items-center gap-4 mb-6">
            <label className="flex-1">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                disabled={isRunning}
                className="hidden"
                id="file-input"
              />
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-slate-700 font-medium">{selectedFile.name}</span>
                  </div>
                ) : (
                  <div>
                    <p className="text-slate-500">点击选择Excel文件（包含Keyword列）</p>
                    <p className="text-xs text-slate-400 mt-2">支持 .xlsx, .xls, .csv 格式</p>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* PC端按钮 */}
            <button
              onClick={() => startValidation('pc')}
              disabled={!selectedFile || isRunning}
              className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 transition-all ${
                isRunning && currentMode === 'pc'
                  ? 'bg-blue-100 border-blue-500 text-blue-700'
                  : !selectedFile || isRunning
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50 hover:shadow-lg'
              }`}
            >
              <Monitor className={`w-12 h-12 ${isRunning && currentMode === 'pc' ? 'animate-pulse' : ''}`} />
              <span className="text-lg font-bold">模拟PC端抓取</span>
              <span className="text-xs text-slate-500">使用5个IP轮换验证</span>
            </button>

            {/* 移动端按钮 */}
            <button
              onClick={() => startValidation('mobile')}
              disabled={!selectedFile || isRunning}
              className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 transition-all ${
                isRunning && currentMode === 'mobile'
                  ? 'bg-purple-100 border-purple-500 text-purple-700'
                  : !selectedFile || isRunning
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white border-purple-300 text-purple-600 hover:border-purple-500 hover:bg-purple-50 hover:shadow-lg'
              }`}
            >
              <Smartphone className={`w-12 h-12 ${isRunning && currentMode === 'mobile' ? 'animate-pulse' : ''}`} />
              <span className="text-lg font-bold">模拟移动端抓取</span>
              <span className="text-xs text-slate-500">使用5个IP轮换验证</span>
            </button>
          </div>

          {isRunning && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-blue-600 font-medium">
                正在{currentMode === 'pc' ? 'PC端' : '移动端'}验证中... (代理 {currentProxyIndex + 1}/5)
              </span>
              <button
                onClick={stopValidation}
                className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors text-sm"
              >
                停止
              </button>
            </div>
          )}
        </div>

        {/* 日志区域 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Server className="w-5 h-5" />
              运行日志
            </h2>
            <button
              onClick={clearLogs}
              className="px-3 py-1 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              清空日志
            </button>
          </div>
          
          <div
            ref={logContainerRef}
            className="bg-slate-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm"
          >
            {logs.length === 0 ? (
              <div className="text-slate-500 text-center py-8">暂无日志</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="mb-1">
                  <span className="text-slate-500">[{log.time}]</span>{' '}
                  <span
                    className={
                      log.level === 'error'
                        ? 'text-red-400'
                        : log.level === 'success'
                        ? 'text-green-400'
                        : log.level === 'warning'
                        ? 'text-yellow-400'
                        : 'text-slate-300'
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 结果展示区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PC端结果 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Monitor className="w-5 h-5 text-blue-600" />
                PC端结果
              </h2>
              {pcResults && (
                <button
                  onClick={() => exportResults(pcResults)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  导出CSV
                </button>
              )}
            </div>

            {pcResults ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-sm text-blue-600 mb-1">总关键词数</div>
                    <div className="text-2xl font-bold text-blue-700">{pcResults.total_keywords}</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-sm text-green-600 mb-1">有广告的关键词</div>
                    <div className="text-2xl font-bold text-green-700">{pcResults.keywords_with_ads}</div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <div className="text-sm text-slate-600 mb-2">去重后的广告URL ({pcResults.unique_ads.length}个)</div>
                  <div className="space-y-2">
                    {pcResults.unique_ads.map((ad, idx) => (
                      <div key={idx} className="bg-white p-3 rounded border border-slate-200">
                        <div className="font-medium text-slate-800 mb-1">{ad.keyword}</div>
                        <div className="space-y-1">
                          {ad.ad_links.map((link, linkIdx) => (
                            <a
                              key={linkIdx}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-blue-600 hover:underline truncate"
                            >
                              {ad.ad_titles[linkIdx] || link}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Monitor className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>等待PC端验证结果</p>
              </div>
            )}
          </div>

          {/* 移动端结果 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-purple-600" />
                移动端结果
              </h2>
              {mobileResults && (
                <button
                  onClick={() => exportResults(mobileResults)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  导出CSV
                </button>
              )}
            </div>

            {mobileResults ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="text-sm text-purple-600 mb-1">总关键词数</div>
                    <div className="text-2xl font-bold text-purple-700">{mobileResults.total_keywords}</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-sm text-green-600 mb-1">有广告的关键词</div>
                    <div className="text-2xl font-bold text-green-700">{mobileResults.keywords_with_ads}</div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <div className="text-sm text-slate-600 mb-2">去重后的广告URL ({mobileResults.unique_ads.length}个)</div>
                  <div className="space-y-2">
                    {mobileResults.unique_ads.map((ad, idx) => (
                      <div key={idx} className="bg-white p-3 rounded border border-slate-200">
                        <div className="font-medium text-slate-800 mb-1">{ad.keyword}</div>
                        <div className="space-y-1">
                          {ad.ad_links.map((link, linkIdx) => (
                            <a
                              key={linkIdx}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-purple-600 hover:underline truncate"
                            >
                              {ad.ad_titles[linkIdx] || link}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>等待移动端验证结果</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

