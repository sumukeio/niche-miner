import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  // 创建一个 ReadableStream 用于 SSE
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: any) => {
        const message = `data: ${JSON.stringify({ type, ...data })}\n\n`
        controller.enqueue(encoder.encode(message))
      }

      try {
        // 获取 Python 脚本路径
        const scriptPath = path.join(process.cwd(), 'scripts', 'taobao_miner.py')
        
        sendEvent('log', {
          level: 'info',
          message: '正在启动登录流程...'
        })

        // 运行 Python 脚本（使用非交互模式）
        const pythonProcess = spawn('python', [
          scriptPath, 
          '--setup-login', 
          '--non-interactive',
          '--auth-file', 
          'auth_taobao.json'
        ], {
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
          // 设置环境变量确保 UTF-8 编码
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1'
          }
        })

        // 处理 stdout（标准输出）- 使用 UTF-8 解码
        pythonProcess.stdout.setEncoding('utf8')
        pythonProcess.stdout.on('data', (data) => {
          // 确保使用 UTF-8 解码
          const output = typeof data === 'string' ? data : data.toString('utf8')
          // 解析日志输出
          const lines = output.split('\n').filter((line: string) => line.trim())
          
          for (const line of lines) {
            // 跳过空行和仅包含时间戳的行
            if (!line.trim()) continue
            
            // 提取日志消息（移除时间戳和级别）
            let message = line
            const logPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+ - (ERROR|INFO|WARNING|DEBUG) - (.+)$/
            const match = line.match(logPattern)
            if (match) {
              const level = match[1]
              message = match[2]
              
              if (level === 'ERROR') {
                sendEvent('log', {
                  level: 'error',
                  message: message.trim()
                })
              } else if (level === 'WARNING') {
                sendEvent('log', {
                  level: 'warning',
                  message: message.trim()
                })
              } else {
                // INFO 或 DEBUG
                // 检查是否包含成功标识
                if (message.includes('✅') || message.includes('登录验证成功') || message.includes('登录信息已保存')) {
                  sendEvent('log', {
                    level: 'success',
                    message: message.trim()
                  })
                  // 如果检测到登录成功的关键消息，发送成功结果
                  if (message.includes('登录信息已保存') || message.includes('登录验证成功')) {
                    sendEvent('result', { success: true, message: '登录成功！' })
                  }
                } else {
                  sendEvent('log', {
                    level: 'info',
                    message: message.trim()
                  })
                }
              }
            } else if (line.trim()) {
              // 没有匹配到标准格式，直接作为 info 消息
              sendEvent('log', {
                level: 'info',
                message: line.trim()
              })
            }
          }
        })

        // 处理 stderr（错误输出）- 使用 UTF-8 解码
        pythonProcess.stderr.setEncoding('utf8')
        pythonProcess.stderr.on('data', (data) => {
          const output = typeof data === 'string' ? data : data.toString('utf8')
          sendEvent('log', {
            level: 'error',
            message: output.trim()
          })
        })

        // 进程退出
        pythonProcess.on('close', (code) => {
          // 等待一下，确保所有日志都已发送
          setTimeout(() => {
            if (code === 0) {
              sendEvent('result', { success: true, message: '登录完成' })
            } else {
              sendEvent('result', { success: false, message: `进程退出，代码: ${code}` })
            }
            controller.close()
          }, 500)
        })

        pythonProcess.on('error', (error) => {
          sendEvent('log', {
            level: 'error',
            message: `启动进程失败: ${error.message}`
          })
          sendEvent('result', { success: false, message: error.message })
          controller.close()
        })
      } catch (error: any) {
        sendEvent('log', {
          level: 'error',
          message: `执行错误: ${error.message}`
        })
        sendEvent('result', { success: false, message: error.message })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}

