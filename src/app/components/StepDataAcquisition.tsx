'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import StepImport from './StepImport'
import TaobaoMinerTab from './TaobaoMinerTab'
import { FileText, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react'

interface StepDataAcquisitionProps {
  projectId: string
  onDataLoaded?: () => void
}

export default function StepDataAcquisition({ projectId, onDataLoaded }: StepDataAcquisitionProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'taobao'>('upload')
  const [hasKeywords, setHasKeywords] = useState(false)
  const [showImportOptions, setShowImportOptions] = useState(false)
  const [keywordsStats, setKeywordsStats] = useState<{
    total: number
    source: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  // 检查是否已有关键词数据
  useEffect(() => {
    checkKeywords()
  }, [projectId])

  const checkKeywords = async () => {
    try {
      setLoading(true)
      
      // 获取关键词统计
      const { count, error: countError } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .neq('status', 'trash')

      if (countError) throw countError

      if (count && count > 0) {
        // 获取数据来源信息
        const { data, error: sourceError } = await supabase
          .from('keywords')
          .select('source')
          .eq('project_id', projectId)
          .neq('status', 'trash')
          .limit(1)
          .single()

        if (!sourceError && data) {
          setHasKeywords(true)
          setKeywordsStats({
            total: count,
            source: data.source || 'upload'
          })
        }
      } else {
        setHasKeywords(false)
        setKeywordsStats(null)
      }
    } catch (error: any) {
      console.error('检查关键词失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDataLoaded = () => {
    setShowImportOptions(false)
    checkKeywords()
    onDataLoaded?.()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  // 如果已有数据，显示统计信息
  if (hasKeywords && keywordsStats) {
    return (
      <div className="space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-900 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            数据已获取
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-lg p-4 border border-green-100">
              <div className="text-sm text-gray-500 mb-1">总关键词数</div>
              <div className="text-2xl font-bold text-gray-900">{keywordsStats.total.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-100">
              <div className="text-sm text-gray-500 mb-1">数据来源</div>
              <div className="text-2xl font-bold text-gray-900">
                {keywordsStats.source === 'taobao' ? '淘宝挖掘' : '5118表格'}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setShowImportOptions(true)
              setHasKeywords(false)
            }}
            className="text-sm text-blue-600 hover:text-blue-700 underline"
          >
            重新获取数据
          </button>
        </div>
      </div>
    )
  }

  // 如果还没有数据，提示用户应该在工作台创建项目时导入数据
  return (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-yellow-900 mb-2 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          尚未获取数据
        </h3>
        <p className="text-yellow-700 mb-4">
          此项目尚未导入关键词数据。正常情况下，项目创建时应该已经完成了数据获取。
        </p>
        <p className="text-sm text-yellow-600 mb-4">
          如果确实需要导入数据，您可以：
        </p>
        <ul className="list-disc list-inside text-sm text-yellow-700 space-y-2 mb-4">
          <li>返回工作台，通过"导入长尾词"或"去淘宝挖掘"创建新项目（会自动导入数据）</li>
          <li>点击下方"重新获取数据"按钮，在当前项目中导入数据（此功能保留用于数据替换）</li>
        </ul>
        <button
          onClick={() => setShowImportOptions(true)}
          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
        >
          重新获取数据
        </button>
      </div>

      {/* 点击"重新获取数据"后显示的选项（默认隐藏） */}
      {showImportOptions && (
        <div className="space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">获取关键词数据</h2>
            <p className="text-gray-500">选择一种方式获取关键词数据</p>
          </div>

          {/* Tab 切换 */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('upload')}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === 'upload'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  导入 5118 表格
                </div>
              </button>
              <button
                onClick={() => setActiveTab('taobao')}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === 'taobao'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  淘宝挖掘
                </div>
              </button>
            </nav>
          </div>

          {/* Tab 内容 */}
          <div className="mt-6">
            {activeTab === 'upload' ? (
              <StepImport 
                projectId={projectId} 
                onNext={handleDataLoaded}
              />
            ) : (
              <TaobaoMinerTab 
                projectId={projectId} 
                onDataLoaded={handleDataLoaded}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

