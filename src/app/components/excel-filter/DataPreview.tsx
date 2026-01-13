'use client'

import { DataPreviewResult } from '@/lib/excelFilterUtils'

interface DataPreviewProps {
  preview: DataPreviewResult
  maxPreviewRows?: number
}

export default function DataPreview({ 
  preview, 
  maxPreviewRows = 10 
}: DataPreviewProps) {
  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">
          数据预览（每列前 {maxPreviewRows} 条）
        </h3>
        <span className="text-sm text-slate-500">
          共 {preview.totalRows} 行数据
        </span>
      </div>

      <div className="border border-slate-300 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-slate-100">
              <tr>
                {preview.columns.map((col, index) => (
                  <th
                    key={index}
                    className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-300 whitespace-nowrap min-w-[150px]"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{col.name || `列 ${index + 1}`}</span>
                      <span className="text-xs font-normal text-slate-500 mt-1">
                        {index + 1}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxPreviewRows }).map((_, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  {preview.columns.map((col, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-4 py-2 text-sm text-slate-700 whitespace-nowrap"
                    >
                      {col.preview[rowIndex] || '（空）'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {preview.totalRows > maxPreviewRows && (
        <p className="mt-2 text-sm text-slate-500 text-center">
          仅显示前 {maxPreviewRows} 行，完整数据共 {preview.totalRows} 行
        </p>
      )}
    </div>
  )
}

