import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * 创建服务端 Supabase 客户端
 * 用于 API 路由中访问数据库
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // 使用服务端密钥创建客户端（绕过 RLS）
  // 注意：在生产环境中，应该使用服务端密钥，并手动检查权限
  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * 从请求头中获取用户 ID
 * 如果前端传递了 user_id，则使用它
 * 否则尝试从 Supabase session 中获取
 */
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  try {
    // 尝试从请求头获取
    const userId = request.headers.get('x-user-id')
    if (userId) {
      return userId
    }

    // 如果有 session，可以从 session 中获取
    // 这里简化处理，返回 null，让调用方处理
    return null
  } catch (error) {
    console.error('获取用户ID失败:', error)
    return null
  }
}

