import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'
import { EventEmitter } from 'events'

// 注意：xlsx需要单独安装
let XLSX: any = null
try {
  XLSX = require('xlsx')
} catch (e) {
  console.warn('xlsx未安装，将使用简化模式处理结果')
}

// 全局存储：当前运行的任务
const runningTasks = new Map<string, {
  process: any
  mode: 'pc' | 'mobile'
  results: any[]
  logs: string[]
  proxyIndex: number
}>()

// 事件发射器用于SSE
const eventEmitters = new Map<string, EventEmitter>()

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const mode = formData.get('mode') as 'pc' | 'mobile'

    if (!file) {
      return NextResponse.json({ error: '未提供文件' }, { status: 400 })
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 创建临时目录
    const tempDir = join(process.cwd(), 'temp')
    await mkdir(tempDir, { recursive: true })

    // 保存上传的文件
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filePath = join(tempDir, `keywords_${taskId}.xlsx`)
    await writeFile(filePath, buffer)

    // 生成代理列表（5个IP）
    // 从环境变量读取，如果没有则使用占位符（实际运行时需要配置）
    const proxyList = [
      process.env.PROXY_1,
      process.env.PROXY_2,
      process.env.PROXY_3,
      process.env.PROXY_4,
      process.env.PROXY_5,
    ].filter(Boolean) as string[]

    // 创建事件发射器
    const emitter = new EventEmitter()
    eventEmitters.set(taskId, emitter)

    // 存储任务信息
    runningTasks.set(taskId, {
      process: null,
      mode,
      results: [],
      logs: [],
      proxyIndex: 0
    })

    // 启动验证流程（异步，不阻塞响应）
    startValidation(taskId, filePath, proxyList, mode, emitter).catch(err => {
      emitter.emit('data', JSON.stringify({
        type: 'error',
        message: `验证失败: ${err.message}`
      }))
    })

    return NextResponse.json({ 
      success: true, 
      taskId,
      message: '验证已启动'
    })

  } catch (error: any) {
    console.error('启动验证失败:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function startValidation(
  taskId: string,
  filePath: string,
  proxyList: string[],
  mode: 'pc' | 'mobile',
  emitter: EventEmitter
) {
  const task = runningTasks.get(taskId)
  if (!task) return

  const scriptPath = join(process.cwd(), 'baidu_ad_validator.py')
  const tempDir = join(process.cwd(), 'temp')
  
  // 使用5个IP轮换（如果配置了代理），否则使用5次无代理运行
  const proxiesToUse = proxyList.length > 0 ? proxyList : [null, null, null, null, null]
  const allResults: Map<string, any> = new Map() // 用于去重，key是关键词+链接组合

  emitter.emit('data', JSON.stringify({
    type: 'log',
    level: 'info',
    message: `开始${mode === 'pc' ? 'PC端' : '移动端'}验证，将使用${proxiesToUse.length}个代理轮换`
  }))

  // 轮换5个IP
  for (let i = 0; i < proxiesToUse.length; i++) {
    const proxy = proxiesToUse[i]
    
    if (proxy) {
      emitter.emit('data', JSON.stringify({
        type: 'proxy_change',
        index: i,
        proxy: proxy.replace(/:[^:]*$/, ':****') // 隐藏端口号
      }))
    } else {
      emitter.emit('data', JSON.stringify({
        type: 'proxy_change',
        index: i,
        proxy: '无代理（直连）'
      }))
    }

    task.proxyIndex = i
    const outputPath = join(tempDir, `results_${taskId}_${i}.xlsx`)
    
    // 构建Python命令
    const args = [
      scriptPath,
      '--input', filePath,
      '--output', outputPath,
      mode === 'mobile' ? '--mobile' : '',
      '--headless'
    ].filter(Boolean)

    // 如果使用代理，创建临时代理文件
    if (proxy) {
      const proxyFilePath = join(tempDir, `proxy_${taskId}_${i}.txt`)
      await writeFile(proxyFilePath, proxy)
      args.push('--proxy-list', proxyFilePath)
    }

    // 执行Python脚本
    await new Promise<void>((resolve, reject) => {
      const pythonProcess = spawn('python', args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      })

      task.process = pythonProcess

      // 处理标准输出
      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString()
        task.logs.push(output)
        
        // 实时发送日志
        output.split('\n').forEach((line: string) => {
          if (line.trim()) {
            const level = line.includes('ERROR') || line.includes('错误') ? 'error' :
                         line.includes('WARNING') || line.includes('警告') ? 'warning' :
                         line.includes('✓') || line.includes('完成') ? 'success' : 'info'
            
            emitter.emit('data', JSON.stringify({
              type: 'log',
              level,
              message: line.trim()
            }))

            // 解析进度信息
            const progressMatch = line.match(/\[(\d+)\/(\d+)\]/)
            if (progressMatch) {
              const keywordMatch = line.match(/搜索: (.+?)(?:\s|$)/)
              if (keywordMatch) {
                emitter.emit('data', JSON.stringify({
                  type: 'progress',
                  current: parseInt(progressMatch[1]),
                  total: parseInt(progressMatch[2]),
                  keyword: keywordMatch[1],
                  proxyIndex: i
                }))
              }
            }
          }
        })
      })

      // 处理错误输出
      pythonProcess.stderr.on('data', (data) => {
        const error = data.toString()
        task.logs.push(error)
        emitter.emit('data', JSON.stringify({
          type: 'log',
          level: 'error',
          message: `错误: ${error.trim()}`
        }))
      })

      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            // 读取结果Excel文件
            let data: any[] = []
            
            if (XLSX) {
              const workbook = XLSX.readFile(outputPath)
              const sheetName = workbook.SheetNames[0]
              const worksheet = workbook.Sheets[sheetName]
              data = XLSX.utils.sheet_to_json(worksheet)
            } else {
              // 如果没有xlsx库，尝试简单的CSV解析或跳过
              emitter.emit('data', JSON.stringify({
                type: 'log',
                level: 'warning',
                message: 'xlsx库未安装，跳过结果解析（请安装: npm install xlsx）'
              }))
            }

            // 处理结果，合并到allResults（去重）
            data.forEach((row: any) => {
              const keyword = row['Keyword'] || row['关键词'] || ''
              if (!keyword || row['Has_Ads'] !== 'Yes') return

              // 获取广告链接（最多3个）
              const adLinks: string[] = []
              const adTitles: string[] = []
              
              for (let j = 1; j <= 3; j++) {
                const link = row[`Ad_Link_${j}`] || ''
                const title = row[`Ad_Title_${j}`] || ''
                if (link) {
                  adLinks.push(link)
                  adTitles.push(title || link)
                }
              }

              // 使用关键词+链接组合作为唯一键
              adLinks.forEach((link, idx) => {
                const uniqueKey = `${keyword}|||${link}`
                if (!allResults.has(uniqueKey)) {
                  allResults.set(uniqueKey, {
                    keyword,
                    ad_titles: [adTitles[idx]],
                    ad_links: [link]
                  })
                }
              })
            })

            emitter.emit('data', JSON.stringify({
              type: 'log',
              level: 'success',
              message: `代理 ${i + 1}/${proxiesToUse.length} 完成，已收集 ${allResults.size} 个去重后的广告`
            }))
            
            resolve()
          } catch (err: any) {
            emitter.emit('data', JSON.stringify({
              type: 'log',
              level: 'warning',
              message: `读取结果文件失败: ${err.message}`
            }))
            resolve() // 继续下一个代理
          }
        } else {
          reject(new Error(`进程退出码: ${code}`))
        }
      })

      pythonProcess.on('error', (error) => {
        emitter.emit('data', JSON.stringify({
          type: 'error',
          message: `执行失败: ${error.message}`
        }))
        reject(error)
      })
    })
  }

  // 所有代理运行完成，整理结果
  // 按关键词分组
  const groupedResults = new Map<string, { keyword: string, ad_titles: string[], ad_links: string[] }>()
  
  allResults.forEach((value) => {
    if (!groupedResults.has(value.keyword)) {
      groupedResults.set(value.keyword, {
        keyword: value.keyword,
        ad_titles: [],
        ad_links: []
      })
    }
    const group = groupedResults.get(value.keyword)!
    value.ad_links.forEach((link, idx) => {
      if (!group.ad_links.includes(link)) {
        group.ad_links.push(link)
        group.ad_titles.push(value.ad_titles[idx] || link)
      }
    })
  })

  const uniqueAds = Array.from(groupedResults.values())
  const keywordsWithAds = uniqueAds.length

  emitter.emit('data', JSON.stringify({
    type: 'result',
    result: {
      mode,
      total_keywords: keywordsWithAds,
      keywords_with_ads: keywordsWithAds,
      unique_ads: uniqueAds
    }
  }))

  emitter.emit('data', JSON.stringify({
    type: 'log',
    level: 'success',
    message: `验证完成！共找到 ${keywordsWithAds} 个关键词有广告，去重后共 ${uniqueAds.reduce((sum, ad) => sum + ad.ad_links.length, 0)} 个广告链接`
  }))

  // 清理临时文件（可选，保留一段时间便于调试）
  // try {
  //   const files = await readdir(tempDir)
  //   const taskFiles = files.filter(f => f.includes(taskId))
  //   await Promise.all(taskFiles.map(f => unlink(join(tempDir, f))).catch(() => {}))
  // } catch (err) {
  //   // 忽略清理错误
  // }

  // 清理任务
  runningTasks.delete(taskId)
  eventEmitters.delete(taskId)
}

// SSE流端点
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const taskId = searchParams.get('taskId')

  if (!taskId) {
    return NextResponse.json({ error: '缺少taskId参数' }, { status: 400 })
  }

  let emitter = eventEmitters.get(taskId)
  if (!emitter) {
    emitter = new EventEmitter()
    eventEmitters.set(taskId, emitter)
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch (err) {
          console.error('发送SSE数据失败:', err)
        }
      }

      const onData = (data: string) => {
        send(data)
      }

      emitter.on('data', onData)

      // 发送初始消息
      send(JSON.stringify({
        type: 'log',
        level: 'info',
        message: '连接已建立'
      }))

      // 清理函数
      return () => {
        emitter.off('data', onData)
      }
    },
    cancel() {
      console.log('SSE连接已关闭')
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
