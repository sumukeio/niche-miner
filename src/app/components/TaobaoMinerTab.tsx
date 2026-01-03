'use client'
import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Loader2, Play, LogIn, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface TaobaoMinerTabProps {
  projectId?: string
  onDataLoaded?: () => void
}

interface LogEntry {
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export default function TaobaoMinerTab({ projectId, onDataLoaded }: TaobaoMinerTabProps) {
  const [seedWords, setSeedWords] = useState('')
  const [seedWordsInput, setSeedWordsInput] = useState('')
  const [minSales, setMinSales] = useState(50)
  const [maxSales, setMaxSales] = useState(5000)
  const [maxPages, setMaxPages] = useState(5)
  // 筛选条件
  const [minPrice, setMinPrice] = useState<number | ''>('')
  const [maxPrice, setMaxPrice] = useState<number | ''>('')
  const [mustContain, setMustContain] = useState('')
  const [mustNotContain, setMustNotContain] = useState('')
  const [shopType, setShopType] = useState<'all' | 'tmall' | 'c_shop'>('all')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [checkingLogin, setCheckingLogin] = useState(true)
  const [settingUpLogin, setSettingUpLogin] = useState(false)
  const [mining, setMining] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<{ success: boolean; message?: string; project_id?: string } | null>(null)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)

  // 添加日志的辅助函数
  const addLog = (level: LogEntry['level'], message: string) => {
    setLogs((prev) => [...prev, { level, message }])
  }

  // 检查登录状态
  useEffect(() => {
    checkLoginStatus()
  }, [])

  const checkLoginStatus = async () => {
    try {
      setCheckingLogin(true)
      const response = await fetch('/api/taobao-miner/check-login')
      const data = await response.json()
      
      if (data.success !== false) {
        setIsLoggedIn(data.is_logged_in || false)
        if (data.is_logged_in) {
          addLog('success', '✅ 已登录，Cookies 有效')
        } else {
          addLog('warning', `⚠️ 未登录: ${data.message || '请先设置登录'}`)
        }
      } else {
        setIsLoggedIn(false)
        addLog('error', `❌ 检查登录状态失败: ${data.message || '未知错误'}`)
      }
    } catch (error: any) {
      console.error('检查登录状态失败:', error)
      setIsLoggedIn(false)
      addLog('error', `❌ 检查登录状态失败: ${error.message || '网络错误'}`)
    } finally {
      setCheckingLogin(false)
    }
  }

  const handleSetupLogin = async () => {
    setSettingUpLogin(true)
    setLogs([])
    setResult(null)

    try {
      const response = await fetch('/api/taobao-miner/setup-login', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('启动登录失败')
      }

      // 处理 SSE 流（使用 UTF-8 解码）
      const reader = response.body?.getReader()
      const decoder = new TextDecoder('utf-8')

      if (!reader) {
        throw new Error('无法读取响应流')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.type === 'log') {
                setLogs((prev) => [...prev, {
                  level: data.level || 'info',
                  message: data.message || ''
                }])
                
                // 检测登录成功的日志消息
                const message = (data.message || '').toLowerCase()
                if (message.includes('登录验证成功') || 
                    message.includes('登录信息已保存') || 
                    message.includes('登录成功') ||
                    message.includes('✅')) {
                  // 延迟更新状态，确保日志先显示
                  setTimeout(() => {
                    setIsLoggedIn(true)
                    setSettingUpLogin(false)
                    setResult({
                      success: true,
                      message: '登录成功！'
                    })
                  }, 500)
                }
              } else if (data.type === 'result') {
                setResult(data)
                if (data.success) {
                  setIsLoggedIn(true)
                  setSettingUpLogin(false)
                  // 刷新登录状态检查
                  setTimeout(() => {
                    checkLoginStatus()
                  }, 1000)
                } else {
                  setSettingUpLogin(false)
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || '登录设置失败'
      })
    } finally {
      setSettingUpLogin(false)
    }
  }

  const handleStartMining = async () => {
    if (!seedWords.trim()) {
      alert('请输入种子词')
      return
    }

    setMining(true)
    setLogs([])
    setResult(null)

    try {
      const seedWordsArray = seedWords.split(',').map(w => w.trim()).filter(Boolean)

      const requestBody: any = {
        seed_words: seedWordsArray,
        min_sales: minSales,
        max_sales: maxSales,
        max_pages: maxPages,
      }

      // 只有当提供了 projectId 时才添加到请求体
      if (projectId) {
        requestBody.project_id = projectId
      }

      // 添加筛选条件（如果有值）
      if (minPrice !== '') requestBody.min_price = minPrice
      if (maxPrice !== '') requestBody.max_price = maxPrice
      if (mustContain.trim()) {
        requestBody.must_contain = mustContain.split(',').map(w => w.trim()).filter(Boolean)
      }
      if (mustNotContain.trim()) {
        requestBody.must_not_contain = mustNotContain.split(',').map(w => w.trim()).filter(Boolean)
      }
      if (shopType !== 'all') requestBody.shop_type = shopType

      const response = await fetch('/api/taobao-miner/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error('启动挖掘失败')
      }

      // 处理 SSE 流（使用 UTF-8 解码）
      const reader = response.body?.getReader()
      const decoder = new TextDecoder('utf-8')

      if (!reader) {
        throw new Error('无法读取响应流')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.type === 'log') {
                setLogs((prev) => [...prev, {
                  level: data.level || 'info',
                  message: data.message || ''
                }])
              } else if (data.type === 'project_created') {
                // 处理项目创建事件
                const newProjectId = data.project_id
                if (newProjectId) {
                  setCreatedProjectId(newProjectId)
                }
              } else if (data.type === 'result') {
                setResult(data)
                if (data.success) {
                  // 如果返回了 project_id，保存它
                  if (data.project_id) {
                    setCreatedProjectId(data.project_id)
                  }
                  onDataLoaded?.()
                }
              } else if (data.type === 'error') {
                setResult({
                  success: false,
                  message: data.message || '挖掘失败'
                })
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || '挖掘失败'
      })
    } finally {
      setMining(false)
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

  return (
    <div className="space-y-6">
      {/* 登录状态检查 */}
      {checkingLogin ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">检查登录状态...</span>
        </div>
      ) : !isLoggedIn ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-2">需要登录淘宝账号</h3>
              <p className="text-sm text-yellow-700 mb-4">
                首次使用需要扫码登录淘宝账号。登录信息会保存在本地，下次可直接使用。
              </p>
              <button
                onClick={handleSetupLogin}
                disabled={settingUpLogin}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {settingUpLogin ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在设置登录...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    开始登录
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 配置表单 */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                种子词 <span className="text-red-500">*</span>
                {seedWords.split(',').filter(w => w.trim()).length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({seedWords.split(',').filter(w => w.trim()).length} 个关键词)
                  </span>
                )}
              </label>
              
              {/* 输入框 - 支持多行和多种分隔符 */}
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
                placeholder="支持多种输入方式：&#10;1. 逗号分隔：野生,自制,手工&#10;2. 换行分隔：野生&#10;               自制&#10;               手工&#10;3. 空格分隔：野生 自制 手工"
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono text-sm"
                disabled={mining}
              />
              
              {/* 显示已输入的关键词标签 */}
              {seedWords.split(',').filter(w => w.trim()).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {seedWords.split(',').filter(w => w.trim()).map((word, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-sm"
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
                        className="text-blue-500 hover:text-blue-700 font-bold"
                        disabled={mining}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              
              <div className="mt-2 space-y-1">
                <p className="text-xs text-gray-500">
                  💡 支持多种输入方式：逗号、换行、空格、分号分隔，自动识别
                </p>
                <p className="text-xs text-gray-400">
                  提示：可以直接粘贴从Excel或其他文档复制的关键词列表
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  最小销量
                </label>
                <input
                  type="number"
                  value={minSales}
                  onChange={(e) => setMinSales(Number(e.target.value))}
                  min={1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  disabled={mining}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  最大销量
                </label>
                <input
                  type="number"
                  value={maxSales}
                  onChange={(e) => setMaxSales(Number(e.target.value))}
                  min={1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  disabled={mining}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  抓取页数
                </label>
                <input
                  type="number"
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                  min={1}
                  max={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  disabled={mining}
                />
              </div>
            </div>

            {/* 高级筛选条件 */}
            <div className="border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                {showAdvancedFilters ? '收起' : '展开'}高级筛选
                <span className="text-xs">{showAdvancedFilters ? '▲' : '▼'}</span>
              </button>

              {showAdvancedFilters && (
                <div className="mt-4 space-y-4">
                  {/* 价格筛选 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        最小价格（元）
                      </label>
                      <input
                        type="number"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        min={0}
                        step={0.01}
                        placeholder="可选"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={mining}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        最大价格（元）
                      </label>
                      <input
                        type="number"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        min={0}
                        step={0.01}
                        placeholder="可选"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={mining}
                      />
                    </div>
                  </div>

                  {/* 关键词筛选 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      必须包含的关键词
                    </label>
                    <input
                      type="text"
                      value={mustContain}
                      onChange={(e) => setMustContain(e.target.value)}
                      placeholder="用逗号分隔，例如：手工,原创（所有关键词都要包含）"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      disabled={mining}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      商品标题必须包含所有指定的关键词（AND 关系）
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      不能包含的关键词
                    </label>
                    <input
                      type="text"
                      value={mustNotContain}
                      onChange={(e) => setMustNotContain(e.target.value)}
                      placeholder="用逗号分隔，例如：广告,推广（包含任意一个就排除）"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      disabled={mining}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      商品标题不能包含任何指定的关键词（OR 关系）
                    </p>
                  </div>

                  {/* 店铺类型筛选 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      店铺类型
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="all"
                          checked={shopType === 'all'}
                          onChange={(e) => setShopType(e.target.value as 'all' | 'tmall' | 'c_shop')}
                          className="mr-2"
                          disabled={mining}
                        />
                        <span className="text-sm">不限</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="tmall"
                          checked={shopType === 'tmall'}
                          onChange={(e) => setShopType(e.target.value as 'all' | 'tmall' | 'c_shop')}
                          className="mr-2"
                          disabled={mining}
                        />
                        <span className="text-sm">天猫</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="c_shop"
                          checked={shopType === 'c_shop'}
                          onChange={(e) => setShopType(e.target.value as 'all' | 'tmall' | 'c_shop')}
                          className="mr-2"
                          disabled={mining}
                        />
                        <span className="text-sm">C店</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleStartMining}
              disabled={mining || seedWordsInput.trim().split(/[,;\n\r]+|[\s]+/).filter(w => w.trim()).length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mining ? (
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
        </>
      )}

      {/* 日志输出 */}
      {(logs.length > 0 || settingUpLogin) && (
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
            {settingUpLogin && logs.length === 0 && (
              <div className="text-gray-400">等待日志输出...</div>
            )}
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
              {result.success ? '挖掘完成！' : '挖掘失败'}
            </span>
          </div>
          {result.message && (
            <p className="mt-2 text-sm">{result.message}</p>
          )}
          {result.success && (createdProjectId || projectId) && (
            <div className="mt-3">
              <Link
                href={`/project/${createdProjectId || projectId}/workflow`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                查看项目
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

