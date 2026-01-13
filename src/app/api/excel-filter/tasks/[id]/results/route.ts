import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/lib/supabaseServer'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id
    const searchParams = request.nextUrl.searchParams
    const isVerified = searchParams.get('is_verified') // 'true' | 'false' | null
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!taskId) {
      return NextResponse.json(
        { error: '缺少任务ID' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const userId = await getUserIdFromRequest(request)

    // 先验证任务是否存在且属于该用户
    if (userId) {
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

    // 查询结果
    let query = supabase
      .from('filter_results')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // 如果指定了验证状态，添加筛选条件
    if (isVerified !== null) {
      query = query.eq('is_verified', isVerified === 'true')
    }

    const { data: results, error, count } = await query

    if (error) {
      throw error
    }

    // 获取总数
    let countQuery = supabase
      .from('filter_results')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)

    if (isVerified !== null) {
      countQuery = countQuery.eq('is_verified', isVerified === 'true')
    }

    const { count: totalCount } = await countQuery

    return NextResponse.json({
      success: true,
      data: {
        results: results || [],
        pagination: {
          total: totalCount || 0,
          limit,
          offset,
          hasMore: (totalCount || 0) > offset + limit
        }
      }
    })
  } catch (error: any) {
    console.error('查询结果失败:', error)
    return NextResponse.json(
      {
        error: '查询结果失败',
        message: error.message || '未知错误'
      },
      { status: 500 }
    )
  }
}

