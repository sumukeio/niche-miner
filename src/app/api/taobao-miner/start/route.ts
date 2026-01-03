import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { supabase } from '@/lib/supabaseClient'

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
        // 解析请求体
        const body = await request.json()
        const { 
          seed_words, 
          min_sales, 
          max_sales, 
          project_id, 
          max_pages,
          min_price,
          max_price,
          must_contain,
          must_not_contain,
          shop_type
        } = body

        // 验证参数
        if (!seed_words || !Array.isArray(seed_words) || seed_words.length === 0) {
          sendEvent('error', {
            message: '种子词不能为空'
          })
          controller.close()
          return
        }

        // 如果没有提供 project_id，自动创建项目
        let finalProjectId = project_id
        if (!finalProjectId || finalProjectId.trim() === '') {
          sendEvent('log', {
            level: 'info',
            message: '未提供项目ID，正在自动创建项目...'
          })

          try {
            // 生成项目名称：淘宝挖掘_种子词_日期
            const seedWordsStr = seed_words.join(',')
            const dateStr = new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).replace(/\//g, '-')
            const projectName = `淘宝挖掘_${seedWordsStr}_${dateStr}`

            const { data: newProject, error: createError } = await supabase
              .from('projects')
              .insert({ name: projectName })
              .select()
              .single()

            if (createError) {
              throw new Error(`创建项目失败: ${createError.message}`)
            }

            finalProjectId = newProject.id

            sendEvent('log', {
              level: 'success',
              message: `✅ 项目创建成功: ${projectName} (ID: ${finalProjectId})`
            })

            // 通知前端项目已创建
            sendEvent('project_created', {
              project_id: finalProjectId,
              project_name: projectName
            })
          } catch (createError: any) {
            sendEvent('error', {
              message: `创建项目失败: ${createError.message || '未知错误'}`
            })
            controller.close()
            return
          }
        }

        // 构建种子词参数（逗号分隔）
        const seedWordsStr = seed_words.join(',')

        // 获取 Python 脚本路径
        const scriptPath = path.join(process.cwd(), 'scripts', 'taobao_miner.py')
        
        sendEvent('log', {
          level: 'info',
          message: '正在启动淘宝挖掘...'
        })
        // 构建筛选条件日志
        const filterLogs = []
        if (min_price || max_price) {
          filterLogs.push(`价格: ${min_price || '不限'}-${max_price || '不限'}`)
        }
        if (must_contain && must_contain.length > 0) {
          filterLogs.push(`必须包含: ${must_contain.join(', ')}`)
        }
        if (must_not_contain && must_not_contain.length > 0) {
          filterLogs.push(`不能包含: ${must_not_contain.join(', ')}`)
        }
        if (shop_type && shop_type !== 'all') {
          filterLogs.push(`店铺类型: ${shop_type === 'tmall' ? '天猫' : 'C店'}`)
        }
        
        sendEvent('log', {
          level: 'info',
          message: `种子词: ${seedWordsStr} | 项目ID: ${project_id} | 销量范围: ${min_sales || 50}-${max_sales || 5000}${filterLogs.length > 0 ? ` | ${filterLogs.join(' | ')}` : ''}`
        })

        // 构建 Python 命令参数
        const args = [
          scriptPath,
          '--mine',
          '--seed-words', seedWordsStr,
          '--project-id', finalProjectId,
          '--min-sales', String(min_sales || 50),
          '--max-sales', String(max_sales || 5000),
          '--max-pages', String(max_pages || 5),
        ]

        // 添加筛选参数（如果有值）
        if (min_price !== undefined && min_price !== null && min_price !== '') {
          args.push('--min-price', String(min_price))
        }
        if (max_price !== undefined && max_price !== null && max_price !== '') {
          args.push('--max-price', String(max_price))
        }
        if (must_contain && Array.isArray(must_contain) && must_contain.length > 0) {
          args.push('--must-contain', must_contain.join(','))
        }
        if (must_not_contain && Array.isArray(must_not_contain) && must_not_contain.length > 0) {
          args.push('--must-not-contain', must_not_contain.join(','))
        }
        if (shop_type && shop_type !== 'all') {
          args.push('--shop-type', shop_type)
        }

        // 如果有环境变量，传递给 Python（通过环境变量传递）
        const env = {
          ...process.env,
          // Supabase 配置会自动从环境变量读取
        }

        // 运行 Python 脚本
        const pythonProcess = spawn('python', args, {
          cwd: process.cwd(),
          env: {
            ...env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1'
          },
          stdio: ['pipe', 'pipe', 'pipe']
        })
        
        // 设置 UTF-8 编码
        pythonProcess.stdout.setEncoding('utf8')
        pythonProcess.stderr.setEncoding('utf8')

        // 处理 stdout（标准输出）
        pythonProcess.stdout.on('data', (data) => {
          const output = data.toString()
          // 解析日志输出
          const lines = output.split('\n').filter((line: string) => line.trim())
          
          for (const line of lines) {
            // 提取日志级别和消息
            if (line.includes('ERROR') || line.includes('❌')) {
              sendEvent('log', {
                level: 'error',
                message: line.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+ - ERROR - /, '').trim()
              })
            } else if (line.includes('✅') || line.includes('成功') || line.includes('完成')) {
              sendEvent('log', {
                level: 'success',
                message: line.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+ - INFO - /, '').trim()
              })
            } else if (line.includes('WARNING') || line.includes('⚠️')) {
              sendEvent('log', {
                level: 'warning',
                message: line.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+ - WARNING - /, '').trim()
              })
            } else if (line.includes('INFO')) {
              sendEvent('log', {
                level: 'info',
                message: line.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+ - INFO - /, '').trim()
              })
            } else if (line.trim()) {
              // 其他输出也作为 info 日志
              sendEvent('log', {
                level: 'info',
                message: line.trim()
              })
            }
          }
        })

        // 处理 stderr（错误输出）
        pythonProcess.stderr.on('data', (data) => {
          const output = data.toString()
          sendEvent('log', {
            level: 'error',
            message: output.trim()
          })
        })

        // 进程退出
        pythonProcess.on('close', (code) => {
          if (code === 0) {
            sendEvent('result', { 
              success: true,
              message: '挖掘完成！',
              project_id: finalProjectId
            })
          } else {
            sendEvent('result', { 
              success: false, 
              message: `进程退出，代码: ${code}`,
              project_id: finalProjectId
            })
          }
          controller.close()
        })

        pythonProcess.on('error', (error) => {
          sendEvent('log', {
            level: 'error',
            message: `启动进程失败: ${error.message}`
          })
          sendEvent('result', { 
            success: false, 
            message: error.message 
          })
          controller.close()
        })
      } catch (error: any) {
        sendEvent('log', {
          level: 'error',
          message: `执行错误: ${error.message}`
        })
        sendEvent('result', { 
          success: false, 
          message: error.message 
        })
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

