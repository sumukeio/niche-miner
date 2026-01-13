import { NextRequest, NextResponse } from 'next/server'
import { executeFilter, FilterRule } from '@/lib/excelFilterUtils'
import { createServerClient, getUserIdFromRequest } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      fileData, // 包含 rawRows, headers, dataRows
      selectedColumns,
      keyword,
      filterRule,
      projectId,
      fileName,
      fileSize,
      headerRowIndex
    } = body

    // 验证参数
    if (!fileData || !selectedColumns || !keyword || !filterRule) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      )
    }

    if (!Array.isArray(selectedColumns) || selectedColumns.length === 0) {
      return NextResponse.json(
        { error: '请至少选择一个列' },
        { status: 400 }
      )
    }

    if (!['contains', 'suffix', 'prefix'].includes(filterRule)) {
      return NextResponse.json(
        { error: '无效的筛选规则' },
        { status: 400 }
      )
    }

    // 执行筛选
    const stats = executeFilter(
      fileData.dataRows,
      fileData.headers,
      selectedColumns,
      keyword,
      filterRule as FilterRule
    )

    // 获取用户ID
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      // 如果没有用户ID，只返回结果，不保存到数据库
      return NextResponse.json({
        success: true,
        data: {
          stats,
          saved: false,
          message: '筛选完成，但未保存到数据库（需要登录）'
        }
      })
    }

    // 保存到数据库
    const supabase = createServerClient()

    // 创建筛选任务
    const { data: task, error: taskError } = await supabase
      .from('filter_tasks')
      .insert({
        user_id: userId,
        project_id: projectId || null,
        file_name: fileName || 'unknown',
        file_size: fileSize || 0,
        header_row_index: headerRowIndex || 0,
        selected_columns: selectedColumns,
        keyword,
        filter_rule: filterRule,
        total_rows: stats.totalRows,
        filtered_count: stats.filteredCount,
        deduplicated_count: stats.deduplicatedCount,
        status: 'completed'
      })
      .select()
      .single()

    if (taskError) {
      console.error('保存任务失败:', taskError)
      return NextResponse.json({
        success: true,
        data: {
          stats,
          saved: false,
          message: '筛选完成，但保存任务失败',
          error: taskError.message
        }
      })
    }

    // 批量插入筛选结果
    if (stats.results.length > 0) {
      const resultsToInsert = stats.results.map(result => ({
        task_id: task.id,
        keyword_text: result.keyword,
        source_column: result.sourceColumn,
        source_row_index: result.sourceRowIndex
      }))

      // 分批插入（每批1000条）
      const BATCH_SIZE = 1000
      for (let i = 0; i < resultsToInsert.length; i += BATCH_SIZE) {
        const batch = resultsToInsert.slice(i, i + BATCH_SIZE)
        const { error: insertError } = await supabase
          .from('filter_results')
          .insert(batch)

        if (insertError) {
          console.error(`插入结果批次 ${i / BATCH_SIZE + 1} 失败:`, insertError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        stats,
        saved: true
      }
    })
  } catch (error: any) {
    console.error('筛选处理失败:', error)
    return NextResponse.json(
      {
        error: '筛选处理失败',
        message: error.message || '未知错误'
      },
      { status: 500 }
    )
  }
}

