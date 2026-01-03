import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  try {
    // 检查 auth_taobao.json 文件是否存在
    const authFile = path.join(process.cwd(), 'auth_taobao.json')
    const exists = existsSync(authFile)

    if (!exists) {
      return NextResponse.json({
        success: true,
        is_logged_in: false,
        message: '未找到认证文件'
      })
    }

    // 调用 Python 脚本真正验证登录状态
    return new Promise((resolve) => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'taobao_miner.py')
      const pythonProcess = spawn('python', [scriptPath, '--check-login'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      })

      let stdout = ''
      let stderr = ''

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString('utf-8')
      })

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString('utf-8')
      })

      pythonProcess.on('close', (code) => {
        // 从输出中提取登录状态
        let isLoggedIn = false
        let message = '登录状态检查完成'
        
        // 优先从 stderr 中查找 LOGIN_STATUS 标志（更可靠）
        const statusMatch = stderr.match(/LOGIN_STATUS:(true|false)/)
        if (statusMatch) {
          isLoggedIn = statusMatch[1] === 'true'
          message = isLoggedIn ? '已登录，Cookies 有效' : '未登录或 Cookies 已失效'
        } else {
          // 如果没有找到标志，根据输出内容判断
          const allOutput = stdout + stderr
          if (allOutput.includes('已登录') && allOutput.includes('Cookies 有效')) {
            isLoggedIn = true
            message = '已登录，Cookies 有效'
          } else if (allOutput.includes('未登录') || allOutput.includes('失效') || allOutput.includes('未找到认证文件')) {
            isLoggedIn = false
            message = '未登录或 Cookies 已失效'
          } else if (code !== 0) {
            isLoggedIn = false
            message = '登录检查失败'
          }
        }

        resolve(
          NextResponse.json({
            success: true,
            is_logged_in: isLoggedIn,
            message,
          })
        )
      })

      pythonProcess.on('error', (error) => {
        resolve(
          NextResponse.json(
            {
              success: false,
              is_logged_in: false,
              message: `执行登录检查失败: ${error.message}`,
            },
            { status: 500 }
          )
        )
      })

      // 设置超时（30秒）
      setTimeout(() => {
        pythonProcess.kill()
        resolve(
          NextResponse.json(
            {
              success: false,
              is_logged_in: false,
              message: '登录检查超时',
            },
            { status: 500 }
          )
        )
      }, 30000)
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        is_logged_in: false,
        message: error.message,
      },
      { status: 500 }
    )
  }
}


