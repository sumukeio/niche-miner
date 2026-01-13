'use client'

import { useState } from 'react'
import { CheckCircle, AlertCircle, Edit2 } from 'lucide-react'
import { HeaderDetectionResult } from '@/lib/excelFilterUtils'

interface HeaderSelectorProps {
  detection: HeaderDetectionResult
  totalRows: number
  onHeaderRowChange: (rowIndex: number) => void
  onColumnsSelect: (selectedColumns: string[]) => void
}

export default function HeaderSelector({
  detection,
  totalRows,
  onHeaderRowChange,
  onColumnsSelect
}: HeaderSelectorProps) {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set())
  const [customRowIndex, setCustomRowIndex] = useState<string>(
    (detection.headerRowIndex + 1).toString()
  )
  const [isEditing, setIsEditing] = useState(false)

  const handleColumnToggle = (columnName: string) => {
    const newSelected = new Set(selectedColumns)
    if (newSelected.has(columnName)) {
      newSelected.delete(columnName)
    } else {
      newSelected.add(columnName)
    }
    setSelectedColumns(newSelected)
    onColumnsSelect(Array.from(newSelected))
  }

  const handleCustomRowSubmit = () => {
    const rowIndex = parseInt(customRowIndex) - 1 // 转换为0-based索引
    if (rowIndex >= 0 && rowIndex < totalRows) {
      onHeaderRowChange(rowIndex)
      setIsEditing(false)
    }
  }

  const getConfidenceColor = () => {
    switch (detection.confidence) {
      case 'high':
        return 'text-green-600 bg-green-50'
      case 'medium':
        return 'text-yellow-600 bg-yellow-50'
      case 'low':
        return 'text-red-600 bg-red-50'
    }
  }

  const getConfidenceText = () => {
    switch (detection.confidence) {
      case 'high':
        return '高'
      case 'medium':
        return '中'
      case 'low':
        return '低'
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* 表头识别结果 */}
      <div className="border border-slate-300 rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">字段识别结果</h3>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor()}`}>
            识别置信度：{getConfidenceText()}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm text-slate-700">
              识别到表头在第 <strong>{detection.headerRowIndex + 1}</strong> 行
            </span>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <Edit2 className="w-4 h-4" />
            手动调整
          </button>
        </div>

        {isEditing && (
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <label className="text-sm text-slate-700">表头行号：</label>
            <input
              type="number"
              min="1"
              max={totalRows}
              value={customRowIndex}
              onChange={(e) => setCustomRowIndex(e.target.value)}
              className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
            />
            <span className="text-sm text-slate-500">（1-{totalRows}）</span>
            <button
              onClick={handleCustomRowSubmit}
              className="px-4 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              确认
            </button>
            <button
              onClick={() => {
                setIsEditing(false)
                setCustomRowIndex((detection.headerRowIndex + 1).toString())
              }}
              className="px-4 py-1 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* 字段列表 */}
      <div className="border border-slate-300 rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">选择要处理的列</h3>
          <div className="text-sm text-slate-500">
            已选择 {selectedColumns.size} 个列
          </div>
        </div>

        {detection.headers.length === 0 ? (
          <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <p className="text-sm text-yellow-700">
              未识别到字段，请手动调整表头行号
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {detection.headers.map((header, index) => {
              const isEmpty = !header || header.trim().length === 0
              const isSelected = selectedColumns.has(header)

              return (
                <label
                  key={index}
                  className={`
                    flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all
                    ${isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                    }
                    ${isEmpty ? 'opacity-50' : ''}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleColumnToggle(header)}
                    disabled={isEmpty}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-slate-700 flex-1 truncate">
                    {header || `（空列 ${index + 1}）`}
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {selectedColumns.size === 0 && (
          <p className="mt-4 text-sm text-slate-500 text-center">
            请至少选择一个列进行处理
          </p>
        )}
      </div>
    </div>
  )
}

