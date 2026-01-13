'use client'

import { useState, useRef } from 'react'
import { Upload, X, FileSpreadsheet, Loader2 } from 'lucide-react'
import { validateFileType, validateFileSize } from '@/lib/excelFilterUtils'

interface FileUploaderProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSizeMB?: number
  disabled?: boolean
}

export default function FileUploader({
  onFileSelect,
  accept = '.csv,.xlsx,.xls',
  maxSizeMB = 50,
  disabled = false
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    setError(null)

    // 验证文件类型
    if (!validateFileType(file)) {
      setError('不支持的文件格式，请上传 CSV、XLSX 或 XLS 文件')
      return
    }

    // 验证文件大小
    if (!validateFileSize(file, maxSizeMB)) {
      setError(`文件大小超过限制（最大 ${maxSizeMB}MB）`)
      return
    }

    setSelectedFile(file)
    onFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (disabled) return

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <div className="w-full">
      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            flex flex-col items-center justify-center p-12 
            border-2 border-dashed rounded-xl 
            transition-colors cursor-pointer
            ${isDragging 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <div className="bg-blue-100 p-4 rounded-full mb-4">
            <Upload className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">
            上传 Excel 文件
          </h3>
          <p className="text-slate-500 mb-6 text-center max-w-sm">
            支持 CSV、XLSX、XLS 格式<br/>
            拖拽文件到此处或点击选择文件<br/>
            最大文件大小：{maxSizeMB}MB
          </p>
          
          <label className="relative cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-3 px-8 rounded-lg font-medium shadow-lg transition-transform active:scale-95">
            <span>选择文件</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={handleFileInputChange}
              disabled={disabled}
            />
          </label>
        </div>
      ) : (
        <div className="border-2 border-slate-300 rounded-xl bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-3 rounded-lg">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-slate-800">{selectedFile.name}</p>
                <p className="text-sm text-slate-500">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <button
              onClick={handleRemoveFile}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              disabled={disabled}
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  )
}

