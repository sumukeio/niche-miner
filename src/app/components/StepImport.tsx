'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Upload, Loader2, CheckCircle } from 'lucide-react'

interface StepImportProps {
  onNext: (projectId?: string) => void
  projectId?: string  // 如果提供，使用现有项目ID，否则创建新项目
}

export default function StepImport({ onNext, projectId }: StepImportProps) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')

  const parseExcelFile = async (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })
          resolve(jsonData as string[][])
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  const parseCSVFile = async (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      Papa.parse<string[]>(file, {
        header: false,
        skipEmptyLines: true,
        encoding: 'GB18030',
        complete: (results) => {
          resolve(results.data as string[][])
        },
        error: reject
      })
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 检查文件类型
    const validExtensions = ['.csv', '.xlsx', '.xls']
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!validExtensions.includes(fileExtension)) {
      alert('不支持的文件格式，请上传 CSV、XLSX 或 XLS 文件')
      return
    }

    setLoading(true)
    
    let currentProjectId = projectId

    try {
      // 如果没有提供projectId，创建新项目
      if (!currentProjectId) {
        setStatusText('正在创建项目...')
        const projectName = file.name.replace(/\.(csv|xlsx|xls)$/i, '') + '_' + new Date().toLocaleDateString('zh-CN')
        const { data: projectData, error: projError } = await supabase
          .from('projects')
          .insert({ name: projectName })
          .select()
          .single()

        if (projError) throw projError
        currentProjectId = projectData.id
      }

      // 2. 解析文件
      setStatusText('正在解析文件...')
      let rawRows: string[][]

      if (fileExtension === '.csv') {
        rawRows = await parseCSVFile(file)
      } else {
        rawRows = await parseExcelFile(file)
      }

      // === 智能查找表头行 ===
      // 5118 的文件第一行通常是标题，第二行才是列名。我们遍历前 5 行找 "关键词"
      let headerRowIndex = -1
      for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        if (rawRows[i] && rawRows[i].some(cell => String(cell).includes('关键词'))) {
          headerRowIndex = i
          break
        }
      }

      if (headerRowIndex === -1) {
        alert('错误：找不到"关键词"列。请确认这是正确的文件格式。')
        setLoading(false)
        return
      }

      // 建立列索引映射
      const headers = rawRows[headerRowIndex].map(h => String(h).trim())
      const colMap: Record<string, number> = {}
      headers.forEach((h, idx) => { colMap[h] = idx })

      console.log(`定位到表头在第 ${headerRowIndex + 1} 行:`, headers)

      // 截取真正的数据行 (从表头下一行开始)
      const dataRows = rawRows.slice(headerRowIndex + 1).filter(row => row && row.length > 0)
      const totalRows = dataRows.length
      
      setStatusText(`解析成功！表头在第${headerRowIndex + 1}行。准备导入 ${totalRows} 条数据...`)

      // 3. 批量上传
      const BATCH_SIZE = 500
      let uploadedCount = 0

      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        const batch = dataRows.slice(i, i + BATCH_SIZE)
        
        const dbRows = batch.map(row => {
          // 辅助函数：按列名取值
          const getVal = (colName: string) => {
             const idx = colMap[colName]
             return idx !== undefined ? String(row[idx] || '').trim() : null
          }

          // 核心列必须有值
          const term = getVal('关键词')
          if (!term) return null

          // 数字清洗
          const parseNum = (val: string | null) => {
            if (!val || val === '-' || val === '未收录') return 0
            return Number(val) || 0
          }

          const pcVol = parseNum(getVal('PC日检索量(VIP特权数据)'))
          const mobVol = parseNum(getVal('移动日检索量(VIP特权数据)'))
          
          return {
            project_id: currentProjectId,
            term: term.trim(),
            pc_volume: pcVol,
            mobile_volume: mobVol,
            search_volume: pcVol + mobVol,
            competition: parseNum(getVal('竞价竞争激烈程度(VIP特权数据)')),
            status: 'pending'
          }
        }).filter(Boolean)

        if (dbRows.length > 0) {
          const { error: insertError } = await supabase
            .from('keywords')
            .insert(dbRows)
          
          if (insertError) {
            console.error('Supabase Insert Error:', insertError)
            throw insertError
          }
        }

        uploadedCount += batch.length
        const percent = Math.min(100, Math.round((uploadedCount / totalRows) * 100))
        setProgress(percent)
        setStatusText(`正在导入... ${uploadedCount}/${totalRows} (${percent}%)`)
      }

      setLoading(false)
      setProgress(100)
      setStatusText('导入完成！')
      onNext(currentProjectId)
    } catch (err: any) {
      alert('系统错误：' + err.message)
      setLoading(false)
      setProgress(0)
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
