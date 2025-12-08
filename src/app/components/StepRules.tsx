'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Trash2, Sparkles, RefreshCw, Check, RotateCcw, Filter, ShoppingBag } from 'lucide-react'

interface StepRulesProps {
  projectId: string
  onNext: () => void
}

export default function StepRules({ projectId, onNext }: StepRulesProps) {
  const [stats, setStats] = useState({ valid: 0, trash: 0, pending: 0 })
  const [suffixes, setSuffixes] = useState<{ word: string, count: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [processingMsg, setProcessingMsg] = useState('')

  useEffect(() => {
    fetchStats()
    analyzeSuffixes() // <--- 改用后缀分析
  }, [projectId])

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

  // === 新功能：后缀聚类分析 (找产品) ===
  const analyzeSuffixes = async () => {
    if (stats.pending === 0 && stats.valid === 0) return;

    setLoading(true)
    // 拿 5000 个样本
    const { data: samples } = await supabase
      .from('keywords')
      .select('term')
      .eq('project_id', projectId)
      .eq('status', 'pending') // 只分析没处理过的
      .limit(5000)

    if (!samples || samples.length === 0) {
      setLoading(false)
      return
    }

    const suffixMap: Record<string, number> = {}

    samples.forEach(row => {
      const term = row.term.trim()
      if (term.length >= 2) {
        // 提取最后2个字作为“疑似产品名”
        // 比如 "野生黑枸杞" -> "枸杞"
        // 比如 "野生奥特曼" -> "特曼" (虽然不准，但在量大时会有统计规律)
        // 优化：如果有 Intl.Segmenter，提取最后一个分词更准，这里先用简单切片
        const suffix = term.slice(-2) 
        if (!/^\d+$/.test(suffix)) { // 排除数字结尾
           suffixMap[suffix] = (suffixMap[suffix] || 0) + 1
        }
      }
    })

    const sorted = Object.entries(suffixMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50) // 取前50个大类
      .map(([word, count]) => ({ word, count }))

    setSuffixes(sorted)
    setLoading(false)
  }

  // 动作：按后缀批量封杀
  const handleBanSuffix = async (suffix: string) => {
    setSuffixes(prev => prev.filter(t => t.word !== suffix))
    
    // 调用 Supabase 封杀 (需在 SQL 添加 clean_by_suffix，下面会给)
    // 这里暂时复用 clean_by_token，虽然有点误杀风险，但在初期效率第一
    await supabase.rpc('clean_by_token', { p_id: projectId, token: suffix })
    
    fetchStats()
  }

  // 动作：按后缀批量保留 (这是新逻辑：确认是产品的，全部标为 Valid)
  const handleKeepSuffix = async (suffix: string) => {
    setSuffixes(prev => prev.filter(t => t.word !== suffix))
    
    // 我们需要一个新 SQL 函数：set_valid_by_token
    await supabase.rpc('set_valid_by_token', { p_id: projectId, token: suffix })
    
    fetchStats()
  }

  // 之前的自动清洗逻辑
  const handleAutoClean = async () => {
    setLoading(true)
    try {
      setProcessingMsg('1/3 去除无搜索量...')
      await supabase.rpc('clean_rule_volume', { p_id: projectId })
      setProcessingMsg('2/3 去除纯数字...')
      await supabase.rpc('clean_rule_digits', { p_id: projectId })
      setProcessingMsg('3/3 去除超长词...')
      await supabase.rpc('clean_rule_long', { p_id: projectId })
      
      await fetchStats()
      await analyzeSuffixes()
      alert('自动清洗完成！')
    } catch (e) { console.error(e) }
    setLoading(false)
    setProcessingMsg('')
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* 仪表盘 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-100 p-4 rounded-xl text-center border border-slate-200">
          <div className="text-slate-500 text-sm mb-1">待分类 (混合)</div>
          <div className="text-3xl font-bold text-slate-700">{stats.pending}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-xl text-center border border-green-100">
          <div className="text-green-500 text-sm mb-1">已确认产品 (金矿)</div>
          <div className="text-3xl font-bold text-green-600">{stats.valid}</div>
        </div>
      </div>

      {/* 自动清洗 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-blue-500" />
            第一步：粗清洗
          </h3>
          <p className="text-xs text-slate-500">去除明显垃圾（数字、无流量）</p>
        </div>
        <button onClick={handleAutoClean} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          开始自动清洗
        </button>
      </div>

      {/* 后缀聚类区 (核心升级) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800 flex items-center">
            <ShoppingBag className="w-5 h-5 mr-2 text-purple-500" />
            第二步：按品类分组 (核心)
          </h3>
          <button onClick={analyzeSuffixes} className="text-xs text-blue-600 hover:underline">刷新分组</button>
        </div>
        
        <p className="text-sm text-slate-500 mb-4">
          系统检测到以下结尾词出现频率最高。
          <br/>如果是产品（如“枸杞”），点 <b>绿色勾</b> 保留；如果是垃圾（如“视频”），点 <b>红色桶</b> 剔除。
        </p>

        <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-1">
          {suffixes.length === 0 ? (
            <div className="text-center py-8 text-slate-400 border border-dashed rounded">暂无显著分组</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {suffixes.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow">
                  <div className="flex items-center">
                    <span className="font-bold text-slate-700 text-lg mr-2">{item.word}</span>
                    <span className="text-xs bg-white px-1.5 py-0.5 rounded text-slate-400 border">{item.count}</span>
                  </div>
                  <div className="flex gap-1">
                    {/* 认为是产品 -> 标为 Valid */}
                    <button 
                      onClick={() => handleKeepSuffix(item.word)}
                      className="p-1.5 bg-green-100 text-green-600 rounded hover:bg-green-600 hover:text-white transition-colors"
                      title="这是个好产品，保留！"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    {/* 认为是垃圾 -> 标为 Trash */}
                    <button 
                      onClick={() => handleBanSuffix(item.word)}
                      className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-600 hover:text-white transition-colors"
                      title="这是垃圾，删掉！"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button onClick={onNext} className="bg-slate-800 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-900">
          跳过剩余，去看板选品 →
        </button>
      </div>
    </div>
  )
}