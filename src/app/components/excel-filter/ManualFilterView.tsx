'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, X, Search, ArrowUpDown, Download, Loader2, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { exportVerifiedKeywords } from '@/lib/exportUtils'

interface FilterResult {
  id: string
  keyword_text: string
  source_column: string | null
  source_row_index: number | null
  is_verified: boolean
  verified_at: string | null
  created_at: string
}

interface ManualFilterViewProps {
  taskId: string
}

type FilterStatus = 'all' | 'verified' | 'unverified'
type SortOption = 'alphabetical' | 'created_at' | 'verified_at'

export default function ManualFilterView({ taskId }: ManualFilterViewProps) {
  const [results, setResults] = useState<FilterResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [sortOption, setSortOption] = useState<SortOption>('alphabetical')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isVerifying, setIsVerifying] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    unverified: 0
  })

  // 加载数据
  useEffect(() => {
    loadResults()
  }, [taskId, filterStatus])

  const loadResults = async () => {
    try {
      setLoading(true)
      setError(null)

      const isVerified = filterStatus === 'verified' ? 'true' : filterStatus === 'unverified' ? 'false' : null
      const url = `/api/excel-filter/tasks/${taskId}/results${isVerified ? `?is_verified=${isVerified}` : ''}`
      
      const response = await fetch(url)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || '加载失败')
      }

      setResults(data.data.results || [])
      updateStats(data.data.results || [])
    } catch (err: any) {
      setError(err.message || '加载数据失败')
      console.error('加载结果失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateStats = (results: FilterResult[]) => {
    const verified = results.filter(r => r.is_verified).length
    setStats({
      total: results.length,
      verified,
      unverified: results.length - verified
    })
  }

  // 单个标记
  const handleVerify = async (resultId: string, isVerified: boolean) => {
    try {
      setIsVerifying(true)
      const response = await fetch(`/api/excel-filter/results/${resultId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isVerified })
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || '标记失败')
      }

      // 更新本地状态
      setResults(prev => prev.map(r => 
        r.id === resultId 
          ? { ...r, is_verified: isVerified, verified_at: isVerified ? new Date().toISOString() : null }
          : r
      ))

      // 更新统计
      loadResults()
    } catch (err: any) {
      alert('标记失败: ' + err.message)
      console.error('标记失败:', err)
    } finally {
      setIsVerifying(false)
    }
  }

  // 批量标记
  const handleBatchVerify = async (isVerified: boolean) => {
    if (selectedIds.size === 0) {
      alert('请先选择要标记的关键词')
      return
    }

    try {
      setIsVerifying(true)
      const response = await fetch('/api/excel-filter/results/batch-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          resultIds: Array.from(selectedIds),
          isVerified,
          taskId
        })
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || '批量标记失败')
      }

      // 更新本地状态
      setResults(prev => prev.map(r => 
        selectedIds.has(r.id)
          ? { ...r, is_verified: isVerified, verified_at: isVerified ? new Date().toISOString() : null }
          : r
      ))

      setSelectedIds(new Set())
      loadResults()
    } catch (err: any) {
      alert('批量标记失败: ' + err.message)
      console.error('批量标记失败:', err)
    } finally {
      setIsVerifying(false)
    }
  }

  // 切换选择
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedResults.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAndSortedResults.map(r => r.id)))
    }
  }

  // 过滤和排序
  const filteredAndSortedResults = results
    .filter(result => {
      if (searchQuery) {
        return result.keyword_text.toLowerCase().includes(searchQuery.toLowerCase())
      }
      return true
    })
    .sort((a, b) => {
      switch (sortOption) {
        case 'alphabetical':
          return a.keyword_text.localeCompare(b.keyword_text, 'zh-CN')
        case 'created_at':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'verified_at':
          const aTime = a.verified_at ? new Date(a.verified_at).getTime() : 0
          const bTime = b.verified_at ? new Date(b.verified_at).getTime() : 0
          return bTime - aTime
        default:
          return 0
      }
    })

  // 导出已验证的关键词
  const handleExport = (format: 'csv' | 'excel' = 'csv') => {
    const verifiedResults = results.filter(r => r.is_verified)
    exportVerifiedKeywords(verifiedResults, format)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-slate-600">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
        <button
          onClick={loadResults}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-300 rounded-lg p-4 bg-white">
          <div className="text-sm text-slate-500 mb-1">全部</div>
          <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
        </div>
        <div className="border border-slate-300 rounded-lg p-4 bg-white">
          <div className="text-sm text-slate-500 mb-1">已验证</div>
          <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
        </div>
        <div className="border border-slate-300 rounded-lg p-4 bg-white">
          <div className="text-sm text-slate-500 mb-1">未验证</div>
          <div className="text-2xl font-bold text-orange-600">{stats.unverified}</div>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* 搜索 */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索关键词..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 筛选和排序 */}
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部</option>
            <option value="verified">已验证</option>
            <option value="unverified">未验证</option>
          </select>

          <div className="relative">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="alphabetical">按字母顺序</option>
              <option value="created_at">按创建时间</option>
              <option value="verified_at">按验证时间</option>
            </select>
            <ArrowUpDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-700">
            已选择 <strong>{selectedIds.size}</strong> 个关键词
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBatchVerify(true)}
              disabled={isVerifying}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              批量标记为已验证
            </button>
            <button
              onClick={() => handleBatchVerify(false)}
              disabled={isVerifying}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              批量取消验证
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2">
        <div className="relative group">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出已验证
          </button>
          <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <button
              onClick={() => handleExport('csv')}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-t-lg text-sm"
            >
              导出为 CSV
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-b-lg text-sm flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              导出为 Excel
            </button>
          </div>
        </div>
      </div>

      {/* 结果列表 */}
      <div className="border border-slate-300 rounded-lg bg-white overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">
              关键词列表
              {searchQuery && (
                <span className="text-sm font-normal text-slate-500 ml-2">
                  （搜索到 {filteredAndSortedResults.length} 条）
                </span>
              )}
            </h3>
            {filteredAndSortedResults.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredAndSortedResults.length && filteredAndSortedResults.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                全选
              </label>
            )}
          </div>
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {filteredAndSortedResults.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              {searchQuery ? '没有找到匹配的关键词' : '暂无数据'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200 w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredAndSortedResults.length && filteredAndSortedResults.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">
                    序号
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">
                    关键词
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">
                    来源列
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">
                    状态
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedResults.map((result, index) => (
                  <tr
                    key={result.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      selectedIds.has(result.id) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(result.id)}
                        onChange={() => toggleSelect(result.id)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800 font-medium">
                      {result.keyword_text}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {result.source_column || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {result.is_verified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                          <CheckCircle className="w-3 h-3" />
                          已验证
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                          未验证
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleVerify(result.id, !result.is_verified)}
                        disabled={isVerifying}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                          result.is_verified
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                      >
                        {result.is_verified ? '取消验证' : '标记为已验证'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

