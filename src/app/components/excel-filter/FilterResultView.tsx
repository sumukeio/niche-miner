'use client'

import { useState } from 'react'
import { CheckCircle, Copy, Download, Search, X, FileSpreadsheet } from 'lucide-react'
import { FilterStats } from '@/lib/excelFilterUtils'
import { exportFilterResults } from '@/lib/exportUtils'

interface FilterResultViewProps {
  stats: FilterStats
  onExport?: () => void
  onImportToManual?: () => void
}

export default function FilterResultView({
  stats,
  onExport,
  onImportToManual
}: FilterResultViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // 过滤结果
  const filteredResults = stats.results.filter(result =>
    result.keyword.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleExportCSV = () => {
    exportFilterResults(filteredResults, 'csv')
  }

  const handleExportExcel = () => {
    exportFilterResults(filteredResults, 'excel')
  }

  return (
    <div className="w-full space-y-4">
      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-300 rounded-lg p-4 bg-white">
          <div className="text-sm text-slate-500 mb-1">原始数据</div>
          <div className="text-2xl font-bold text-slate-800">
            {stats.totalRows.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">行</div>
        </div>
        
        <div className="border border-slate-300 rounded-lg p-4 bg-white">
          <div className="text-sm text-slate-500 mb-1">筛选后</div>
          <div className="text-2xl font-bold text-blue-600">
            {stats.filteredCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">条</div>
        </div>
        
        <div className="border border-slate-300 rounded-lg p-4 bg-white">
          <div className="text-sm text-slate-500 mb-1">去重后</div>
          <div className="text-2xl font-bold text-green-600">
            {stats.deduplicatedCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">个关键词</div>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
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
        
        <div className="flex gap-2">
          <div className="relative group">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              导出 CSV
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={handleExportCSV}
                className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-t-lg text-sm"
              >
                导出为 CSV
              </button>
              <button
                onClick={handleExportExcel}
                className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-b-lg text-sm flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                导出为 Excel
              </button>
            </div>
          </div>
          
          {onImportToManual && (
            <button
              onClick={onImportToManual}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              导入到手动筛选
            </button>
          )}
        </div>
      </div>

      {/* 结果列表 */}
      <div className="border border-slate-300 rounded-lg bg-white overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">
            筛选结果
            {searchQuery && (
              <span className="text-sm font-normal text-slate-500 ml-2">
                （搜索到 {filteredResults.length} 条）
              </span>
            )}
          </h3>
        </div>
        
        <div className="max-h-[600px] overflow-y-auto">
          {filteredResults.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              {searchQuery ? '没有找到匹配的关键词' : '暂无筛选结果'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
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
                    来源行号
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result, index) => (
                  <tr
                    key={index}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800 font-medium">
                      {result.keyword}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {result.sourceColumn}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {result.sourceRowIndex}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleCopy(result.keyword, index)}
                        className="p-1 hover:bg-slate-100 rounded transition-colors"
                        title="复制关键词"
                      >
                        {copiedIndex === index ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-400" />
                        )}
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

