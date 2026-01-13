'use client'

import { useState } from 'react'
import { Search, Play, AlertCircle } from 'lucide-react'
import { FilterRule } from '@/lib/excelFilterUtils'

interface FilterConfigProps {
  availableColumns: string[]
  selectedColumns: string[]
  onColumnsChange: (columns: string[]) => void
  onFilter: (keyword: string, rule: FilterRule) => void
  disabled?: boolean
}

export default function FilterConfig({
  availableColumns,
  selectedColumns,
  onColumnsChange,
  onFilter,
  disabled = false
}: FilterConfigProps) {
  const [keyword, setKeyword] = useState('')
  const [rule, setRule] = useState<FilterRule>('suffix')

  const handleColumnToggle = (columnName: string) => {
    if (disabled) return
    
    const newSelected = selectedColumns.includes(columnName)
      ? selectedColumns.filter(col => col !== columnName)
      : [...selectedColumns, columnName]
    
    onColumnsChange(newSelected)
  }

  const handleFilter = () => {
    if (!keyword.trim()) {
      alert('请输入关键词')
      return
    }
    
    if (selectedColumns.length === 0) {
      alert('请至少选择一个列')
      return
    }
    
    onFilter(keyword.trim(), rule)
  }

  return (
    <div className="w-full space-y-6">
      {/* 列选择 */}
      <div className="border border-slate-300 rounded-lg p-4 bg-white">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          选择要处理的列
        </h3>
        
        {availableColumns.length === 0 ? (
          <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <p className="text-sm text-yellow-700">
              没有可用的列，请先上传文件并识别字段
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {availableColumns.map((columnName, index) => {
              const isSelected = selectedColumns.includes(columnName)
              
              return (
                <label
                  key={index}
                  className={`
                    flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all
                    ${isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleColumnToggle(columnName)}
                    disabled={disabled}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-slate-700 flex-1 truncate">
                    {columnName || `（空列 ${index + 1}）`}
                  </span>
                </label>
              )
            })}
          </div>
        )}
        
        {selectedColumns.length > 0 && (
          <p className="mt-4 text-sm text-slate-500">
            已选择 <strong>{selectedColumns.length}</strong> 个列
          </p>
        )}
      </div>

      {/* 关键词和规则配置 */}
      <div className="border border-slate-300 rounded-lg p-4 bg-white">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          配置筛选规则
        </h3>
        
        <div className="space-y-4">
          {/* 关键词输入 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              输入关键词
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="例如：手串、沉香手串"
                disabled={disabled}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !disabled) {
                    handleFilter()
                  }
                }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              示例：输入"手串"，将筛选出包含"手串"或以"手串"为后缀/前缀的内容
            </p>
          </div>

          {/* 筛选规则选择 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              选择筛选规则
            </label>
            <div className="space-y-2">
              <label className={`
                flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all
                ${rule === 'contains' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-slate-200 hover:border-slate-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}>
                <input
                  type="radio"
                  name="filterRule"
                  value="contains"
                  checked={rule === 'contains'}
                  onChange={(e) => setRule(e.target.value as FilterRule)}
                  disabled={disabled}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-800">包含该关键词</div>
                  <div className="text-sm text-slate-500">
                    提取包含关键词的整个单元格内容
                  </div>
                </div>
              </label>

              <label className={`
                flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all
                ${rule === 'suffix' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-slate-200 hover:border-slate-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}>
                <input
                  type="radio"
                  name="filterRule"
                  value="suffix"
                  checked={rule === 'suffix'}
                  onChange={(e) => setRule(e.target.value as FilterRule)}
                  disabled={disabled}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-800">以该关键词为后缀</div>
                  <div className="text-sm text-slate-500">
                    提取以关键词结尾的片段（如："黄花梨手串价格" + "手串" → "黄花梨手串"）
                  </div>
                </div>
              </label>

              <label className={`
                flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all
                ${rule === 'prefix' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-slate-200 hover:border-slate-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}>
                <input
                  type="radio"
                  name="filterRule"
                  value="prefix"
                  checked={rule === 'prefix'}
                  onChange={(e) => setRule(e.target.value as FilterRule)}
                  disabled={disabled}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-800">以该关键词为前缀</div>
                  <div className="text-sm text-slate-500">
                    提取以关键词开头的片段
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 开始筛选按钮 */}
          <button
            onClick={handleFilter}
            disabled={disabled || !keyword.trim() || selectedColumns.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-medium shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
          >
            <Play className="w-5 h-5" />
            开始筛选
          </button>
        </div>
      </div>
    </div>
  )
}

