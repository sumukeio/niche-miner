import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/lib/supabaseServer'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resultId = params.id
    const body = await request.json()
    const { isVerified = true } = body

    if (!resultId) {
      return NextResponse.json(
        { error: '缺少结果ID' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const userId = await getUserIdFromRequest(request)

    // 验证结果是否存在且属于该用户的任务
    if (userId) {
      const { data: result, error: resultError } = await supabase
        .from('filter_results')
        .select(`
          id,
          task_id,
          filter_tasks!inner(user_id)
        `)
        .eq('id', resultId)
        .single()

      if (resultError || !result) {
        return NextResponse.json(
          { error: '结果不存在或无权限访问' },
          { status: 404 }
        )
      }

      // 检查任务是否属于该用户
      const task = result.filter_tasks as any
      if (task.user_id !== userId) {
        return NextResponse.json(
          { error: '无权限访问' },
          { status: 403 }
        )
      }
    }

    // 更新验证状态
    const { data: updatedResult, error: updateError } = await supabase
      .from('filter_results')
      .update({
        is_verified: isVerified,
        verified_at: isVerified ? new Date().toISOString() : null
      })
      .eq('id', resultId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      data: updatedResult
    })
  } catch (error: any) {
    console.error('更新验证状态失败:', error)
    return NextResponse.json(
      {
        error: '更新验证状态失败',
        message: error.message || '未知错误'
      },
      { status: 500 }
    )
  }
}

