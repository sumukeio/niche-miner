'use client'
import { useState } from 'react'
import { Upload, Loader2, CheckCircle } from 'lucide-react'
import { importFileToProject } from '@/lib/fileImportUtils'

interface StepImportProps {
  onNext: (projectId?: string) => void
  projectId?: string  // 如果提供，使用现有项目ID，否则创建新项目
}

export default function StepImport({ onNext, projectId }: StepImportProps) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setProgress(0)
    setStatusText('')

    try {
      // 使用共享的导入函数
      const { projectId: finalProjectId } = await importFileToProject(
        file,
        projectId, // 如果提供了projectId则使用，否则会创建新项目
        (importProgress) => {
          setProgress(importProgress.progress)
          setStatusText(importProgress.statusText)
        }
      )

      setLoading(false)
      setProgress(100)
      setStatusText('导入完成！')
      onNext(finalProjectId)
    } catch (err: any) {
      alert('系统错误：' + err.message)
      setLoading(false)
      setProgress(0)
      setStatusText('')
    } finally {
      // 重置文件输入
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
      
      {!loading ? (
        <>
          <div className="bg-blue-100 p-4 rounded-full mb-4">
            <Upload className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">上传长尾词文件</h3>
          <p className="text-slate-500 mb-6 text-center max-w-sm">
            支持 CSV、XLSX、XLS 格式<br/>
            自动识别 5118 表头偏移格式<br/>
            一次可处理 10 万行数据
          </p>
          
          <label className="relative cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-3 px-8 rounded-lg font-medium shadow-lg transition-transform active:scale-95">
            <span>选择文件</span>
            <input 
              type="file" 
              accept=".csv,.xlsx,.xls" 
              className="hidden" 
              onChange={handleFileUpload}
            />
          </label>
        </>
      ) : (
        <div className="w-full max-w-md text-center">
          {progress < 100 ? (
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
          ) : (
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-4" />
          )}
          
          <h3 className="text-lg font-medium text-slate-800 mb-2">
            {progress < 100 ? `正在入库 (${progress}%)` : '导入成功！'}
          </h3>
          <p className="text-slate-500 text-sm mb-6">{statusText}</p>
          
          <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
            <div 
              className="bg-blue-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  )
}
