import * as XLSX from 'xlsx'

/**
 * 导出为 CSV 文件
 */
export function exportToCSV(
  data: any[],
  headers: string[],
  filename: string = 'export.csv'
) {
  if (data.length === 0) {
    alert('没有数据可导出')
    return
  }

  // 构建 CSV 内容
  const csvRows: string[] = []
  
  // 添加表头
  csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','))
  
  // 添加数据行
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header] ?? ''
      return `"${String(value).replace(/"/g, '""')}"`
    })
    csvRows.push(values.join(','))
  })

  // 添加 UTF-8 BOM 以支持中文
  const csvContent = '\ufeff' + csvRows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  
  // 下载文件
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  
  // 清理
  URL.revokeObjectURL(link.href)
}

/**
 * 导出为 Excel 文件
 */
export function exportToExcel(
  data: any[],
  headers: string[],
  filename: string = 'export.xlsx',
  sheetName: string = 'Sheet1'
) {
  if (data.length === 0) {
    alert('没有数据可导出')
    return
  }

  try {
    // 创建工作簿
    const workbook = XLSX.utils.book_new()
    
    // 准备数据：表头 + 数据行
    const worksheetData: any[][] = [headers]
    
    data.forEach(row => {
      const values = headers.map(header => row[header] ?? '')
      worksheetData.push(values)
    })
    
    // 创建工作表
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    
    // 设置列宽（自动调整）
    const colWidths = headers.map((header, index) => {
      const maxLength = Math.max(
        header.length,
        ...data.map(row => String(row[headers[index]] ?? '').length)
      )
      return { wch: Math.min(maxLength + 2, 50) }
    })
    worksheet['!cols'] = colWidths
    
    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    
    // 生成文件并下载
    XLSX.writeFile(workbook, filename)
  } catch (error) {
    console.error('导出 Excel 失败:', error)
    alert('导出 Excel 失败，请尝试导出 CSV 格式')
  }
}

/**
 * 导出筛选结果
 */
export function exportFilterResults(
  results: Array<{
    keyword: string
    sourceColumn?: string | null
    sourceRowIndex?: number | null
  }>,
  format: 'csv' | 'excel' = 'csv',
  filename?: string
) {
  if (results.length === 0) {
    alert('没有数据可导出')
    return
  }

  const headers = ['关键词', '来源列', '来源行号']
  const data = results.map(r => ({
    '关键词': r.keyword,
    '来源列': r.sourceColumn || '',
    '来源行号': r.sourceRowIndex || ''
  }))

  const defaultFilename = `筛选结果_${new Date().toISOString().split('T')[0]}`

  if (format === 'excel') {
    exportToExcel(data, headers, `${filename || defaultFilename}.xlsx`)
  } else {
    exportToCSV(data, headers, `${filename || defaultFilename}.csv`)
  }
}

/**
 * 导出已验证的关键词
 */
export function exportVerifiedKeywords(
  results: Array<{
    keyword_text: string
    source_column?: string | null
    source_row_index?: number | null
    verified_at?: string | null
  }>,
  format: 'csv' | 'excel' = 'csv',
  filename?: string
) {
  if (results.length === 0) {
    alert('没有已验证的关键词可导出')
    return
  }

  const headers = ['关键词', '来源列', '来源行号', '验证时间']
  const data = results.map(r => ({
    '关键词': r.keyword_text,
    '来源列': r.source_column || '',
    '来源行号': r.source_row_index || '',
    '验证时间': r.verified_at ? new Date(r.verified_at).toLocaleString('zh-CN') : ''
  }))

  const defaultFilename = `已验证关键词_${new Date().toISOString().split('T')[0]}`

  if (format === 'excel') {
    exportToExcel(data, headers, `${filename || defaultFilename}.xlsx`)
  } else {
    exportToCSV(data, headers, `${filename || defaultFilename}.csv`)
  }
}

