'use client'
import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, ShoppingBag, Loader2, Play, LogIn, Settings, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'

interface LogEntry {
  id: string
  time: string
  level: 'info' | 'success' | 'error' | 'warning'
  message: string
}

export default function TaobaoMinerPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [isCheckingLogin, setIsCheckingLogin] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [seedWords, setSeedWords] = useState('野生,自制,手工')
  const [seedWordsInput, setSeedWordsInput] = useState('野生\n自制\n手工')
  const [minSales, setMinSales] = useState(50)
  const [maxSales, setMaxSales] = useState(5000)
  const [maxPages, setMaxPages] = useState(5)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

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

  // 检查登录状态
  const checkLoginStatus = async () => {
    setIsCheckingLogin(true)
    addLog('info', '正在检查登录状态...')

    try {
      const response = await fetch('/api/taobao-miner/check-login', {
        method: 'GET'
      })

      const data = await response.json()

      if (data.success) {
        setIsLoggedIn(data.is_logged_in)
        if (data.is_logged_in) {
          addLog('success', '✅ 已登录，可以直接开始挖掘')
        } else {
          addLog('warning', '⚠️ 未登录，请先设置登录')
        }
      } else {
        addLog('error', '检查登录状态失败: ' + data.message)
        setIsLoggedIn(false)
      }
    } catch (error: any) {
      addLog('error', '检查登录状态失败: ' + error.message)
      setIsLoggedIn(false)
    } finally {
      setIsCheckingLogin(false)
    }
  }

  // 设置登录
  const setupLogin = async () => {
    setIsCheckingLogin(true)
    addLog('info', '正在启动登录流程...')
    addLog('info', '请在弹出的浏览器窗口中完成登录')

    try {
      const response = await fetch('/api/taobao-miner/setup-login', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('登录设置失败')
      }

      // 使用 SSE 接收实时日志
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('无法读取响应流')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'log') {
                addLog(data.level, data.message)
              } else if (data.type === 'result') {
                if (data.success) {
                  setIsLoggedIn(true)
                  addLog('success', '✅ 登录设置成功！')
                } else {
                  setIsLoggedIn(false)
                  addLog('error', '❌ 登录设置失败')
                }
                setIsCheckingLogin(false)
                return
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      addLog('error', '登录设置出错: ' + error.message)
      setIsCheckingLogin(false)
    }
  }

  // 开始挖掘
  const startMining = async () => {
    // 从输入框重新解析
    const finalSeedWords = seedWordsInput
      .split(/[,;\n\r]+|[\s]+/)
      .map(w => w.trim())
      .filter(w => w)
    
    if (finalSeedWords.length === 0) {
      addLog('error', '请输入至少一个种子词')
      return
    }

    setIsRunning(true)
    setLogs([])
    setCreatedProjectId(null)
    addLog('info', '开始淘宝挖掘任务...')

    try {
      const response = await fetch('/api/taobao-miner/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          seed_words: finalSeedWords,
          min_sales: minSales,
          max_sales: maxSales,
          max_pages: maxPages
        })
      })

      if (!response.ok) {
        throw new Error('启动挖掘任务失败')
      }

      // 使用 SSE 接收实时日志
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('无法读取响应流')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'log') {
                addLog(data.level, data.message)
              } else if (data.type === 'project_created') {
                // 处理项目创建事件
                const newProjectId = data.project_id
                if (newProjectId) {
                  setCreatedProjectId(newProjectId)
                  addLog('info', `项目已创建: ${data.project_name || newProjectId}`)
                }
              } else if (data.type === 'progress') {
                addLog('info', `进度: ${data.current}/${data.total} - ${data.keyword}`)
              } else if (data.type === 'result') {
                addLog('success', `✅ 挖掘完成！${data.total_keywords ? `共抓取 ${data.total_keywords} 个关键词` : ''}`)
                // 如果返回了 project_id，保存它
                if (data.project_id) {
                  setCreatedProjectId(data.project_id)
                }
                setIsRunning(false)
                return
              } else if (data.type === 'error') {
                addLog('error', data.message)
                setIsRunning(false)
                return
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      addLog('error', '挖掘任务出错: ' + error.message)
      setIsRunning(false)
    }
  }

  useEffect(() => {
    // 页面加载时自动检查登录状态
    checkLoginStatus()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-orange-600" />
              <h1 className="text-2xl font-bold text-slate-800">淘宝挖掘器</h1>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            返回工作台
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* 左侧：配置面板 */}
          <div className="lg:col-span-1 space-y-6">
            {/* 登录状态 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <LogIn className="w-5 h-5" />
                登录状态
              </h2>
              <div className="space-y-3">
                {isLoggedIn === null ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>检查中...</span>
                  </div>
                ) : isLoggedIn ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span>已登录</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-orange-600">
                    <AlertCircle className="w-5 h-5" />
                    <span>未登录</span>
                  </div>
                )}
                <button
                  onClick={checkLoginStatus}
                  disabled={isCheckingLogin}
                  className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCheckingLogin ? '检查中...' : '刷新状态'}
                </button>
                <button
                  onClick={setupLogin}
                  disabled={isCheckingLogin || isRunning}
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isCheckingLogin ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    <>
                      <Settings className="w-4 h-4" />
                      设置登录
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 挖掘配置 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                挖掘配置
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    种子词
                    {seedWords.split(',').filter(w => w.trim()).length > 0 && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        ({seedWords.split(',').filter(w => w.trim()).length} 个关键词)
                      </span>
                    )}
                  </label>
                  
                  {/* 多行输入框 - 支持多种分隔符 */}
                  <textarea
                    value={seedWordsInput}
                    onChange={(e) => {
                      const input = e.target.value
                      setSeedWordsInput(input)
                      // 自动解析：支持逗号、换行、空格、分号分隔
                      const parsed = input
                        .split(/[,;\n\r]+|[\s]+/)
                        .map(w => w.trim())
                        .filter(w => w)
                        .join(',')
                      setSeedWords(parsed)
                    }}
                    onPaste={(e) => {
                      // 粘贴后自动解析
                      setTimeout(() => {
                        const pastedText = e.currentTarget.value
                        const parsed = pastedText
                          .split(/[,;\n\r]+|[\s]+/)
                          .map(w => w.trim())
                          .filter(w => w)
                          .join(',')
                        setSeedWords(parsed)
                      }, 0)
                    }}
                    placeholder="支持多种输入方式：&#10;1. 换行分隔（推荐）：&#10;野生&#10;自制&#10;手工&#10;&#10;2. 逗号分隔：野生,自制,手工&#10;&#10;3. 空格分隔：野生 自制 手工"
                    rows={5}
                    disabled={isRunning}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100 resize-y font-mono text-sm"
                  />
                  
                  {/* 显示已输入的关键词标签 */}
                  {seedWords.split(',').filter(w => w.trim()).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {seedWords.split(',').filter(w => w.trim()).map((word, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-md text-sm border border-orange-200"
                        >
                          {word.trim()}
                          <button
                            type="button"
                            onClick={() => {
                              const words = seedWords.split(',').filter(w => w.trim())
                              words.splice(idx, 1)
                              const newWords = words.join(',')
                              setSeedWords(newWords)
                              // 同步更新输入框
                              setSeedWordsInput(words.join('\n'))
                            }}
                            className="text-orange-500 hover:text-orange-700 font-bold ml-1"
                            disabled={isRunning}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-slate-500">
                      💡 支持多种输入方式：逗号、换行、空格、分号分隔，自动识别
                    </p>
                    <p className="text-xs text-blue-600">
                      💡 提示：开始挖掘时将自动创建项目
                    </p>
                    <p className="text-xs text-slate-400">
                      可以直接粘贴从Excel或其他文档复制的关键词列表
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      最小销量
                    </label>
                    <input
                      type="number"
                      value={minSales}
                      onChange={(e) => setMinSales(parseInt(e.target.value) || 50)}
                      disabled={isRunning}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      最大销量
                    </label>
                    <input
                      type="number"
                      value={maxSales}
                      onChange={(e) => setMaxSales(parseInt(e.target.value) || 5000)}
                      disabled={isRunning}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    最大翻页数
                  </label>
                  <input
                    type="number"
                    value={maxPages}
                    onChange={(e) => setMaxPages(parseInt(e.target.value) || 5)}
                    disabled={isRunning}
                    min={1}
                    max={10}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100"
                  />
                </div>

                <button
                  onClick={startMining}
                  disabled={isRunning || !isLoggedIn || seedWordsInput.trim().split(/[,;\n\r]+|[\s]+/).filter(w => w.trim()).length === 0}
                  className="w-full px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      挖掘中...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      开始挖掘
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：日志面板 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 p-6 h-[calc(100vh-12rem)] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800">运行日志</h2>
                {logs.length > 0 && (
                  <button
                    onClick={() => setLogs([])}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    清空日志
                  </button>
                )}
              </div>
              <div
                ref={logContainerRef}
                className="flex-1 overflow-y-auto bg-slate-900 rounded-lg p-4 font-mono text-sm space-y-1"
              >
                {logs.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">
                    等待开始...
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex items-start gap-2 ${
                        log.level === 'error'
                          ? 'text-red-400'
                          : log.level === 'success'
                          ? 'text-green-400'
                          : log.level === 'warning'
                          ? 'text-yellow-400'
                          : 'text-slate-300'
                      }`}
                    >
                      <span className="text-slate-500 text-xs w-20 shrink-0">
                        {log.time}
                      </span>
                      <span className="flex-1">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
              {/* 显示项目链接（如果项目已创建且挖掘完成） */}
              {createdProjectId && !isRunning && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 mb-2">
                    项目已创建，您可以查看项目详情：
                  </p>
                  <Link
                    href={`/project/${createdProjectId}/workflow`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <span>查看项目</span>
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

