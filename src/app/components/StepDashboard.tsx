'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ScatterChart, Scatter, ZAxis, TooltipProps 
} from 'recharts'
import { Download, TrendingUp, DollarSign, Loader2 } from 'lucide-react'
import Papa from 'papaparse'

// === 修复点 1: 将非核心字段设为可选 (?) ===
type KeywordData = {
  term: string
  search_volume: number
  competition: number
  pc_volume?: number      // 变更为可选
  mobile_volume?: number  // 变更为可选
  blue_ocean_score?: number
}

export default function StepDashboard({ projectId, onNext }: { projectId: string, onNext: () => void }) {
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')
  
  const [topKeywords, setTopKeywords] = useState<KeywordData[]>([])
  const [scatterData, setScatterData] = useState<KeywordData[]>([])
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    loadDashboardData()
  }, [projectId])

  const loadDashboardData = async () => {
    setLoading(true)
    
    // 1. 获取总数
    const { count } = await supabase
      .from('keywords')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .neq('status', 'trash')
    
    setTotalCount(count || 0)

    // 2. 获取“蓝海暴利榜” (Top 100)
    const { data: topData } = await supabase
      .from('keywords')
      .select('term, search_volume, competition, pc_volume, mobile_volume')
      .eq('project_id', projectId)
      .neq('status', 'trash')
      .order('search_volume', { ascending: false })
      .limit(100)

    if (topData) {
      const scoredData: KeywordData[] = topData.map((k: any) => ({
        ...k,
        blue_ocean_score: Math.round(k.search_volume / (k.competition + 1))
      })).sort((a, b) => (b.blue_ocean_score || 0) - (a.blue_ocean_score || 0))
      
      setTopKeywords(scoredData)
    }

    // 3. 获取散点图数据
    // === 修复点 2: 这里我们多查几个字段，或者依赖上面的类型定义变为可选 ===
    const { data: chartData } = await supabase
      .from('keywords')
      .select('term, search_volume, competition') // 这里没查 pc_volume 也没事了，因为类型里是可选的
      .eq('project_id', projectId)
      .neq('status', 'trash')
      .lt('competition', 50)
      .gt('search_volume', 50)
      .limit(300)
    
    if (chartData) setScatterData(chartData)
    
    setLoading(false)
  }

  // 循环分页导出
  const handleExport = async () => {
    setExporting(true)
    setExportProgress('准备下载...')
    
    const BATCH_SIZE = 1000
    let allRows: any[] = []
    let from = 0
    let hasMore = true

    try {
      while (hasMore) {
        setExportProgress(`正在拉取第 ${from} - ${from + BATCH_SIZE} 行...`)
        
        const { data, error } = await supabase
          .from('keywords')
          .select('关键词:term, 总流量:search_volume, 竞争度:competition, PC流量:pc_volume, 移动流量:mobile_volume')
          .eq('project_id', projectId)
          .neq('status', 'trash')
          .range(from, from + BATCH_SIZE - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allRows = allRows.concat(data)
          from += BATCH_SIZE
          if (data.length < BATCH_SIZE) hasMore = false
        } else {
          hasMore = false
        }
      }

      setExportProgress('正在生成 CSV 文件...')
      const csv = Papa.unparse(allRows)
      const blobWithBOM = new Blob(["\uFEFF"+csv], {type: 'text/csv;charset=utf-8;'});
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blobWithBOM)
      link.download = `最终选品结果_${allRows.length}条.csv`
      link.click()

      setExportProgress('下载完成！')

    } catch (err: any) {
      alert('导出中断：' + err.message)
    } finally {
      setExporting(false)
    }
  }

  // === 修复点 3: Tooltip 类型改为 any，解决 Recharts 类型冲突 ===
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg opacity-90 z-50">
          <p className="font-bold text-sm mb-1">{data.term}</p>
          <p>流量: {data.search_volume}</p>
          <p>竞争: {data.competition}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) return <div className="p-20 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2"/>正在挖掘金矿数据...</div>

  return (
    <div className="space-y-8 animate-in fade-in pb-20">
      
      {/* 头部 */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">{totalCount.toLocaleString()} <span className="text-sm font-normal text-slate-400">个潜在商机</span></h2>
          <p className="text-slate-400 text-sm mt-1">这是去除所有垃圾后剩下的干净数据</p>
        </div>
        
        <button 
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {exportProgress}
            </>
          ) : (
            <>
              <Download className="w-5 h-5 mr-2" />
              导出全部数据 (Excel)
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* 左侧：蓝海榜单 */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-yellow-500" />
              Top 100 蓝海暴利词 (按性价比排序)
            </h3>
            <span className="text-xs text-slate-400">性价比 = 流量 / (竞争+1)</span>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-white sticky top-0 z-10 shadow-sm text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3">排名</th>
                  <th className="px-5 py-3">关键词</th>
                  <th className="px-5 py-3 text-right">日搜索量</th>
                  <th className="px-5 py-3 text-right">竞争度</th>
                  <th className="px-5 py-3 text-right">蓝海分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topKeywords.map((k, i) => (
                  <tr key={i} className="hover:bg-blue-50 transition-colors group cursor-pointer">
                    <td className="px-5 py-3 text-slate-400 font-mono w-16">#{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-slate-700 group-hover:text-blue-600 select-all">
                      {k.term}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-slate-700">{k.search_volume}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{k.competition}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        (k.blue_ocean_score || 0) > 50 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {k.blue_ocean_score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 右侧：分布图 */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col h-[500px]">
          <h3 className="font-bold text-slate-800 mb-2 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-purple-500" />
            机会分布图
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            把鼠标移到圆点上，查看具体关键词。<br/>
            越靠左上角，机会越大。
          </p>
          
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  type="number" 
                  dataKey="competition" 
                  name="竞争" 
                  label={{ value: '竞争 (越低越好) →', position: 'bottom', offset: 0, fontSize: 12 }} 
                  tick={{fontSize: 10}}
                />
                <YAxis 
                  type="number" 
                  dataKey="search_volume" 
                  name="流量" 
                  label={{ value: '流量 (越高越好) ↑', angle: -90, position: 'insideLeft', fontSize: 12 }} 
                  tick={{fontSize: 10}}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Opportunities" data={scatterData} fill="#8b5cf6" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  )
}