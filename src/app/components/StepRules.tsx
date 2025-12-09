'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Trash2, Sparkles, RefreshCw, Check, Search, RotateCcw, XCircle } from 'lucide-react'
import { Segment, useDefault } from 'segmentit'

interface StepRulesProps {
  projectId: string
  onNext: () => void
}

export default function StepRules({ projectId, onNext }: StepRulesProps) {
  const [stats, setStats] = useState({ valid: 0, trash: 0, pending: 0 })
  const [groups, setGroups] = useState<{ word: string, count: number }[]>([])
  const [loading, setLoading] = useState(false)
  
  // === 核心升级：持久化已处理词根 ===
  // 只要你点过一次（保留或删除），这个词根就被打入冷宫，永远不会再弹出来烦你
  const [processedTokens, setProcessedTokens] = useState<Set<string>>(new Set())

  // 初始化分词器
  const segmenterRef = useRef<any>(null)

  useEffect(() => {
    if (!segmenterRef.current) {
      const segment = useDefault(new Segment())
      segmenterRef.current = segment
    }
    
    // 加载本地缓存的已处理词 (防止刷新丢失)
    const saved = localStorage.getItem(`processed_${projectId}`)
    if (saved) {
      setProcessedTokens(new Set(JSON.parse(saved)))
    }

    fetchStats()
    analyzeSmart()
  }, [projectId])

  // 每次更新 processedTokens 时，同步保存到 localStorage
  const saveProcessedToken = (token: string) => {
    const newSet = new Set(processedTokens)
    newSet.add(token)
    setProcessedTokens(newSet)
    localStorage.setItem(`processed_${projectId}`, JSON.stringify(Array.from(newSet)))
  }

  // 重置项目时，也清空本地缓存
  const clearProcessedTokens = () => {
    setProcessedTokens(new Set())
    localStorage.removeItem(`processed_${projectId}`)
  }

  const fetchStats = async () => {
    const { data } = await supabase.rpc('get_project_stats', { p_id: projectId })
    if (data && data[0]) {
      setStats({
        valid: data[0].valid_count,
        trash: data[0].trash_count,
        pending: data[0].pending_count
      })
    }
  }

  const analyzeSmart = async () => {
    // 只有当没有数据时才彻底停止，否则始终尝试寻找新特征
    if (stats.pending === 0 && stats.valid === 0) return

    setLoading(true)
    
    // 随机采样：每次从前 20000 行 Pending 数据里随机抓 5000 行
    // 这样能避免“死盯着前几行”的问题，让数据滚动起来
    const randomOffset = Math.floor(Math.random() * 10) * 1000 

    const { data: samples } = await supabase
      .from('keywords')
      .select('term')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .range(randomOffset, randomOffset + 4999)

    if (!samples || samples.length === 0) {
      setLoading(false)
      // 如果随机没捞到，尝试捞最前面兜底
      if (randomOffset > 0) {
        const { data: retrySamples } = await supabase
          .from('keywords')
          .select('term')
          .eq('project_id', projectId)
          .eq('status', 'pending')
          .limit(2000)
          
        if(retrySamples && retrySamples.length > 0) {
          processSamples(retrySamples)
          return
        }
      }
      return
    }

    processSamples(samples)
  }

  const processSamples = (samples: any[]) => {
    const tokenMap: Record<string, number> = {}
    const stopWords = new Set(['长尾', '多少', '什么', '怎么', '价格', '哪里', '图片', '大全', '一斤', '这个', '那个', '意思', '包含', '哪些', '野生', '功效', '作用', '做法'])

    samples.forEach(row => {
      const term = row.term.trim()
      const result = segmenterRef.current.doSegment(term, {
        simple: true,
        stripPunctuation: true
      })

      result.forEach((word: string) => {
        // === 终极过滤逻辑 ===
        // 1. 长度 > 1
        // 2. 不是纯数字
        // 3. 不是停用词
        // 4. ⚡️⚡️ 绝对不是之前处理过的词 (processedTokens) ⚡️⚡️
        if (word.length > 1 && !/^\d+$/.test(word) && !stopWords.has(word) && !processedTokens.has(word)) {
          tokenMap[word] = (tokenMap[word] || 0) + 1
        }
      })
    })

    const sorted = Object.entries(tokenMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 100)
      .map(([word, count]) => ({ word, count }))

    setGroups(sorted)
    setLoading(false)
  }

  // === 动作：级联保留 ===
  const handleKeepCascade = async (token: string) => {
    // 1. 立即从 UI 移除
    setGroups(prev => prev.filter(t => t.word !== token))
    // 2. 永久加入“已处理”黑名单
    saveProcessedToken(token)
    
    // 3. 后台执行 (不等待，让它在后台跑，前端立刻响应)
    await supabase.rpc('set_valid_by_token', { p_id: projectId, token: token })
    fetchStats() // 更新数字
  }

  // === 动作：级联封杀 ===
  const handleBanCascade = async (token: string) => {
    setGroups(prev => prev.filter(t => t.word !== token))
    saveProcessedToken(token)

    await supabase.rpc('clean_by_token', { p_id: projectId, token: token })
    fetchStats()
  }

  // 自动清洗
  const handleAutoClean = async () => {
    setLoading(true)
    try {
      await supabase.rpc('clean_rule_volume', { p_id: projectId })
      await supabase.rpc('clean_rule_digits', { p_id: projectId })
      await supabase.rpc('clean_rule_long', { p_id: projectId })
      
      await fetchStats()
      // 清洗完后，清空忽略名单，重新分析
      clearProcessedTokens()
      await analyzeSmart()
      alert('自动清洗完成！')
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleReset = async () => {
    if(!confirm('确定重置项目？所有进度将丢失。')) return;
    setLoading(true)
    await supabase.rpc('reset_project_status', { p_id: projectId })
    clearProcessedTokens() // 重置时一定要清空缓存
    await fetchStats()
    await analyzeSmart()
    setLoading(false)
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* 仪表盘 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-100 p-4 rounded-xl text-center">
          <div className="text-slate-500 text-sm mb-1">待分类</div>
          <div className="text-2xl font-bold text-slate-700">{stats.pending}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-xl text-center border border-red-100">
          <div className="text-red-500 text-sm mb-1">已剔除</div>
          <div className="text-2xl font-bold text-red-600">{stats.trash}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-xl text-center border border-green-100">
          <div className="text-green-500 text-sm mb-1">已确认金矿</div>
          <div className="text-2xl font-bold text-green-600">{stats.valid}</div>
        </div>
      </div>

      {/* 控制栏 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={handleReset} className="text-slate-400 hover:text-red-500 text-sm flex items-center transition-colors">
            <RotateCcw className="w-4 h-4 mr-1" /> 重置项目
          </button>
          <div className="h-4 w-px bg-slate-200"></div>
          <span className="text-sm text-slate-500">
            已过滤 <span className="font-bold text-slate-700">{processedTokens.size}</span> 个特征词
          </span>
        </div>
        <button onClick={handleAutoClean} disabled={loading} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-900 disabled:opacity-50 transition-colors">
          <Sparkles className="w-4 h-4 inline mr-1"/> 自动粗清洗
        </button>
      </div>

      {/* 智能选词区 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[500px] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center text-lg">
              <Search className="w-5 h-5 mr-2 text-blue-600" />
              智能特征提取
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Top 100 高频特征词。点过的词永远不会再出现。
            </p>
          </div>
          <button 
            onClick={analyzeSmart} 
            disabled={loading}
            className="text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center"
          >
             <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`}/> 
             {loading ? '分析中...' : '换一批 / 刷新'}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto custom-scrollbar p-1 flex-1 content-start">
          {groups.map((item, idx) => (
            <div key={`${item.word}-${idx}`} className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg p-3 hover:shadow-md transition-all group animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-700 text-lg break-words leading-tight">{item.word}</span>
                <span className="text-[10px] bg-white px-1.5 py-0.5 rounded text-slate-400 border font-mono">{item.count}</span>
              </div>
              
              <div className="flex gap-2 mt-auto pt-2">
                <button 
                  onClick={() => handleKeepCascade(item.word)}
                  className="flex-1 py-1.5 bg-green-100 text-green-700 rounded text-xs font-bold hover:bg-green-600 hover:text-white transition-colors flex justify-center items-center shadow-sm"
                >
                  <Check className="w-3 h-3 mr-1" />
                  是产品
                </button>
                <button 
                  onClick={() => handleBanCascade(item.word)}
                  className="flex-1 py-1.5 bg-red-100 text-red-600 rounded text-xs font-bold hover:bg-red-600 hover:text-white transition-colors flex justify-center items-center shadow-sm"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  垃圾
                </button>
              </div>
            </div>
          ))}
          
          {groups.length === 0 && !loading && (
             <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
               <Sparkles className="w-10 h-10 mb-2 text-slate-300" />
               <p>暂无新特征词。</p>
               <p className="text-xs mt-2">点击刷新试试，或直接查看结果。</p>
             </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button onClick={onNext} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg hover:shadow-blue-200 transition-all active:scale-95">
          选完了，去查看结果 →
        </button>
      </div>
    </div>
  )
}