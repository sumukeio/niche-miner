import * as XLSX from 'xlsx'
import Papa from 'papaparse'

/**
 * Excel 文件解析结果
 */
export interface ExcelParseResult {
  rawRows: string[][]
  headerRowIndex: number
  headers: string[]
  dataRows: string[][]
}

/**
 * 字段识别结果
 */
export interface HeaderDetectionResult {
  headerRowIndex: number
  headers: string[]
  confidence: 'high' | 'medium' | 'low'
}

/**
 * 数据预览结果
 */
export interface DataPreviewResult {
  columns: Array<{
    name: string
    index: number
    preview: string[] // 前10条数据
  }>
  totalRows: number
}

/**
 * 解析 Excel 文件
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
 * 解析 CSV 文件
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
 * 解析文件（自动识别格式）
 */
export async function parseFile(file: File): Promise<string[][]> {
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
  
  if (fileExtension === '.csv') {
    return await parseCSVFile(file)
  } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
    return await parseExcelFile(file)
  } else {
    throw new Error('不支持的文件格式，请上传 CSV、XLSX 或 XLS 文件')
  }
}

/**
 * 检测表头行
 * @param rows 所有行数据
 * @param maxScanRows 最大扫描行数（默认10）
 * @returns 表头行索引和字段列表
 */
export function detectHeaderRow(
  rows: string[][],
  maxScanRows: number = 10
): HeaderDetectionResult {
  // 常见字段关键词
  const headerKeywords = [
    '关键词', '词', '名称', '标题', 'keyword', 'name', 'title',
    'PC日检索量', '移动日检索量', '检索量', '流量', 'volume',
    '竞争', '竞争度', 'competition', '竞价'
  ]

  let bestMatch: { index: number; score: number } | null = null

  // 扫描前 maxScanRows 行
  for (let i = 0; i < Math.min(maxScanRows, rows.length); i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    // 计算匹配分数
    let score = 0
    const rowText = row.map(cell => String(cell).toLowerCase()).join(' ')

    headerKeywords.forEach(keyword => {
      if (rowText.includes(keyword.toLowerCase())) {
        score += 1
      }
    })

    // 检查是否包含多个非空单元格（表头通常有多个字段）
    const nonEmptyCells = row.filter(cell => String(cell).trim().length > 0).length
    if (nonEmptyCells >= 2) {
      score += 0.5
    }

    // 如果这一行匹配度更高，更新最佳匹配
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { index: i, score }
    }
  }

  // 如果没有找到匹配，默认使用第一行
  const headerRowIndex = bestMatch?.index ?? 0
  const headers = rows[headerRowIndex]?.map(h => String(h).trim()) || []

  // 确定置信度
  let confidence: 'high' | 'medium' | 'low' = 'low'
  if (bestMatch) {
    if (bestMatch.score >= 3) {
      confidence = 'high'
    } else if (bestMatch.score >= 1) {
      confidence = 'medium'
    }
  }

  return {
    headerRowIndex,
    headers,
    confidence
  }
}

/**
 * 解析 Excel 文件并识别表头
 */
export async function parseExcelFileWithHeader(
  file: File,
  customHeaderRowIndex?: number
): Promise<ExcelParseResult> {
  const rawRows = await parseFile(file)

  let headerRowIndex: number
  let headers: string[]

  if (customHeaderRowIndex !== undefined) {
    // 使用用户指定的表头行
    headerRowIndex = customHeaderRowIndex
    headers = rawRows[headerRowIndex]?.map(h => String(h).trim()) || []
  } else {
    // 自动识别表头
    const detection = detectHeaderRow(rawRows)
    headerRowIndex = detection.headerRowIndex
    headers = detection.headers
  }

  // 提取数据行（从表头下一行开始）
  const dataRows = rawRows
    .slice(headerRowIndex + 1)
    .filter(row => row && row.length > 0 && row.some(cell => String(cell).trim().length > 0))

  return {
    rawRows,
    headerRowIndex,
    headers,
    dataRows
  }
}

/**
 * 生成数据预览（每列前10条数据）
 */
export function generateDataPreview(
  headers: string[],
  dataRows: string[][],
  previewCount: number = 10
): DataPreviewResult {
  const columns = headers.map((name, index) => {
    const preview: string[] = []
    
    for (let i = 0; i < Math.min(previewCount, dataRows.length); i++) {
      const row = dataRows[i]
      const value = row && row[index] !== undefined 
        ? String(row[index]).trim() 
        : ''
      preview.push(value || '（空）')
    }

    return {
      name,
      index,
      preview
    }
  })

  return {
    columns,
    totalRows: dataRows.length
  }
}

/**
 * 验证文件类型
 */
export function validateFileType(file: File): boolean {
  const validExtensions = ['.csv', '.xlsx', '.xls']
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
  return validExtensions.includes(fileExtension)
}

/**
 * 验证文件大小（默认最大50MB）
 */
export function validateFileSize(file: File, maxSizeMB: number = 50): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  return file.size <= maxSizeBytes
}

/**
 * 筛选规则类型
 */
export type FilterRule = 'contains' | 'suffix' | 'prefix'

/**
 * 筛选结果
 */
export interface FilterResult {
  keyword: string
  sourceColumn: string
  sourceRowIndex: number
}

/**
 * 筛选统计信息
 */
export interface FilterStats {
  totalRows: number
  filteredCount: number
  deduplicatedCount: number
  results: FilterResult[]
}

/**
 * 规则1：包含该关键词
 * 提取包含关键词的整个单元格内容
 */
export function filterByContains(text: string, keyword: string): string | null {
  if (!text || !keyword) return null
  
  const textStr = String(text).trim()
  const keywordStr = String(keyword).trim()
  
  if (textStr.includes(keywordStr)) {
    return textStr
  }
  
  return null
}

/**
 * 规则2：以该关键词为后缀
 * 提取以关键词结尾的最长匹配片段
 * 示例："黄花梨手串价格" + "手串" → "黄花梨手串"
 */
export function filterBySuffix(text: string, keyword: string): string | null {
  if (!text || !keyword) return null
  
  const textStr = String(text).trim()
  const keywordStr = String(keyword).trim()
  
  // 检查是否以关键词结尾
  if (!textStr.endsWith(keywordStr)) {
    return null
  }
  
  // 找到关键词在文本中的最后位置
  const keywordIndex = textStr.lastIndexOf(keywordStr)
  if (keywordIndex === -1) {
    return null
  }
  
  // 提取从开头到关键词结束的部分
  return textStr.substring(0, keywordIndex + keywordStr.length)
}

/**
 * 规则3：以该关键词为前缀
 * 提取以关键词开头的片段
 * 可以提取整个文本，或提取到第一个分隔符（空格、标点等）
 */
export function filterByPrefix(text: string, keyword: string): string | null {
  if (!text || !keyword) return null
  
  const textStr = String(text).trim()
  const keywordStr = String(keyword).trim()
  
  // 检查是否以关键词开头
  if (!textStr.startsWith(keywordStr)) {
    return null
  }
  
  // 提取整个文本（如果以关键词开头）
  // 也可以提取到第一个分隔符，这里先返回整个文本
  return textStr
  
  // 如果需要提取到第一个分隔符，可以使用以下代码：
  // const separators = [' ', '，', '。', '、', '-', '_', '|', '/']
  // const firstSeparatorIndex = textStr
  //   .split('')
  //   .findIndex((char, idx) => idx > keywordStr.length && separators.includes(char))
  // return firstSeparatorIndex > 0 
  //   ? textStr.substring(0, firstSeparatorIndex) 
  //   : textStr
}

/**
 * 应用筛选规则
 */
export function applyFilterRule(
  text: string,
  keyword: string,
  rule: FilterRule
): string | null {
  switch (rule) {
    case 'contains':
      return filterByContains(text, keyword)
    case 'suffix':
      return filterBySuffix(text, keyword)
    case 'prefix':
      return filterByPrefix(text, keyword)
    default:
      return null
  }
}

/**
 * 执行筛选
 * @param dataRows 数据行
 * @param headers 表头列表
 * @param selectedColumns 选中的列名
 * @param keyword 关键词
 * @param rule 筛选规则
 * @returns 筛选结果和统计信息
 */
export function executeFilter(
  dataRows: string[][],
  headers: string[],
  selectedColumns: string[],
  keyword: string,
  rule: FilterRule
): FilterStats {
  const results: FilterResult[] = []
  const seen = new Set<string>() // 用于去重
  
  // 建立列名到索引的映射
  const columnIndexMap: Record<string, number> = {}
  headers.forEach((header, index) => {
    columnIndexMap[header] = index
  })
  
  // 遍历所有数据行
  dataRows.forEach((row, rowIndex) => {
    // 遍历选中的列
    selectedColumns.forEach(columnName => {
      const columnIndex = columnIndexMap[columnName]
      if (columnIndex === undefined) return
      
      const cellValue = row[columnIndex]
      if (!cellValue) return
      
      // 应用筛选规则
      const extracted = applyFilterRule(String(cellValue), keyword, rule)
      
      if (extracted) {
        // 去重：使用提取出的关键词作为唯一键
        const uniqueKey = extracted.toLowerCase().trim()
        
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey)
          results.push({
            keyword: extracted,
            sourceColumn: columnName,
            sourceRowIndex: rowIndex + 1 // 转换为1-based索引（加上表头行）
          })
        }
      }
    })
  })
  
  // 统计去重前的数量（需要重新计算，因为去重是在结果中进行的）
  let filteredCount = 0
  dataRows.forEach((row) => {
    selectedColumns.forEach(columnName => {
      const columnIndex = columnIndexMap[columnName]
      if (columnIndex === undefined) return
      
      const cellValue = row[columnIndex]
      if (!cellValue) return
      
      const extracted = applyFilterRule(String(cellValue), keyword, rule)
      if (extracted) {
        filteredCount++
      }
    })
  })
  
  return {
    totalRows: dataRows.length,
    filteredCount,
    deduplicatedCount: results.length,
    results
  }
}

