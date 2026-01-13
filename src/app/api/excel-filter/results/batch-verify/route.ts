import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resultIds, isVerified = true, taskId } = body

    if (!resultIds || !Array.isArray(resultIds) || resultIds.length === 0) {
      return NextResponse.json(
        { error: '缺少结果ID列表' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const userId = await getUserIdFromRequest(request)

    // 如果提供了 taskId，验证任务是否属于该用户
    if (userId && taskId) {
      const { data: task, error: taskError } = await supabase
        .from('filter_tasks')
        .select('id')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single()

      if (taskError || !task) {
        return NextResponse.json(
          { error: '任务不存在或无权限访问' },
          { status: 404 }
        )
      }
    }

    // 批量更新验证状态
    const { data: updatedResults, error: updateError } = await supabase
      .from('filter_results')
      .update({
        is_verified: isVerified,
        verified_at: isVerified ? new Date().toISOString() : null
      })
      .in('id', resultIds)
      .select()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      data: {
        updatedCount: updatedResults?.length || 0,
        results: updatedResults
      }
    })
  } catch (error: any) {
    console.error('批量更新验证状态失败:', error)
    return NextResponse.json(
      {
        error: '批量更新验证状态失败',
        message: error.message || '未知错误'
      },
      { status: 500 }
    )
  }
}

