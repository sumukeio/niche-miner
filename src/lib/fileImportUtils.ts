import { supabase } from '@/lib/supabaseClient'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ImportProgress {
  progress: number
  statusText: string
}

export type ProgressCallback = (progress: ImportProgress) => void

/**
 * 解析Excel文件
 */
export async function parseExcelFile(file: File): Promise<string[][]> {
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

/**
 * 解析CSV文件
 */
export async function parseCSVFile(file: File): Promise<string[][]> {
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

/**
 * 导入文件数据到项目
 * @param file 要导入的文件
 * @param projectId 项目ID（如果提供则使用，否则会创建新项目）
 * @param onProgress 进度回调函数
 * @returns 返回项目ID和导入的关键词数量
 */
export async function importFileToProject(
  file: File,
  projectId?: string,
  onProgress?: ProgressCallback
): Promise<{ projectId: string; importedCount: number }> {
  // 检查文件类型
  const validExtensions = ['.csv', '.xlsx', '.xls']
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!validExtensions.includes(fileExtension)) {
    throw new Error('不支持的文件格式，请上传 CSV、XLSX 或 XLS 文件')
  }

  let currentProjectId = projectId

  try {
    // 如果没有提供projectId，创建新项目
    if (!currentProjectId) {
      onProgress?.({
        progress: 0,
        statusText: '正在创建项目...'
      })
      const projectName = file.name.replace(/\.(csv|xlsx|xls)$/i, '') + '_' + new Date().toLocaleDateString('zh-CN')
      const { data: projectData, error: projError } = await supabase
        .from('projects')
        .insert({ name: projectName })
        .select()
        .single()

      if (projError) throw projError
      currentProjectId = projectData.id
    }

    // 解析文件
    onProgress?.({
      progress: 5,
      statusText: '正在解析文件...'
    })
    
    let rawRows: string[][]
    if (fileExtension === '.csv') {
      rawRows = await parseCSVFile(file)
    } else {
      rawRows = await parseExcelFile(file)
    }

    // 智能查找表头行
    let headerRowIndex = -1
    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
      if (rawRows[i] && rawRows[i].some(cell => String(cell).includes('关键词'))) {
        headerRowIndex = i
        break
      }
    }

    if (headerRowIndex === -1) {
      throw new Error('错误：找不到"关键词"列。请确认这是正确的文件格式。')
    }

    // 建立列索引映射
    const headers = rawRows[headerRowIndex].map(h => String(h).trim())
    const colMap: Record<string, number> = {}
    headers.forEach((h, idx) => { colMap[h] = idx })

    // 截取真正的数据行 (从表头下一行开始)
    const dataRows = rawRows.slice(headerRowIndex + 1).filter(row => row && row.length > 0)
    const totalRows = dataRows.length
    
    onProgress?.({
      progress: 10,
      statusText: `解析成功！表头在第${headerRowIndex + 1}行。准备导入 ${totalRows} 条数据...`
    })

    // 批量上传
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
      const percent = Math.min(100, 10 + Math.round((uploadedCount / totalRows) * 90))
      onProgress?.({
        progress: percent,
        statusText: `正在导入... ${uploadedCount}/${totalRows} (${percent}%)`
      })
    }

    onProgress?.({
      progress: 100,
      statusText: '导入完成！'
    })

    return {
      projectId: currentProjectId,
      importedCount: uploadedCount
    }
  } catch (err: any) {
    throw new Error(err.message || '导入失败')
  }
}

