import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/lib/supabaseServer'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id

    if (!taskId) {
      return NextResponse.json(
        { error: '缺少任务ID' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const userId = await getUserIdFromRequest(request)

    // 查询任务
    let query = supabase
      .from('filter_tasks')
      .select('*')
      .eq('id', taskId)

    // 如果有用户ID，只查询该用户的任务
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: task, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '任务不存在' },
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      data: task
    })
  } catch (error: any) {
    console.error('查询任务失败:', error)
    return NextResponse.json(
      {
        error: '查询任务失败',
        message: error.message || '未知错误'
      },
      { status: 500 }
    )
  }
}

