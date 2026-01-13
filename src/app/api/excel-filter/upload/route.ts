import { NextRequest, NextResponse } from 'next/server'
import { parseExcelFileWithHeader, generateDataPreview, detectHeaderRow } from '@/lib/excelFilterUtils'
import { createServerClient } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const customHeaderRowIndex = formData.get('headerRowIndex') 
      ? parseInt(formData.get('headerRowIndex') as string) - 1 // 转换为0-based
      : undefined

    if (!file) {
      return NextResponse.json(
        { error: '未提供文件' },
        { status: 400 }
      )
    }

    // 解析文件
    const parseResult = await parseExcelFileWithHeader(file, customHeaderRowIndex)

    // 生成数据预览
    const preview = generateDataPreview(parseResult.headers, parseResult.dataRows, 10)

    // 如果用户指定了表头行，重新检测以获取置信度
    let detection
    if (customHeaderRowIndex !== undefined) {
      detection = {
        headerRowIndex: customHeaderRowIndex,
        headers: parseResult.headers,
        confidence: 'high' as const
      }
    } else {
      detection = detectHeaderRow(parseResult.rawRows)
    }

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        fileSize: file.size,
        headerRowIndex: parseResult.headerRowIndex,
        headers: parseResult.headers,
        detection,
        preview,
        totalRows: parseResult.dataRows.length
      }
    })
  } catch (error: any) {
    console.error('文件上传解析失败:', error)
    return NextResponse.json(
      { 
        error: '文件解析失败',
        message: error.message || '未知错误'
      },
      { status: 500 }
    )
  }
}

