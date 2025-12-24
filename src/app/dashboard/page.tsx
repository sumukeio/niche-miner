'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, FolderOpen, Calendar, Trash2, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Project {
  id: string
  name: string
  created_at: string
  keywords_count?: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          created_at,
          keywords (count)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // 处理数据，获取每个项目的关键词数量
      const projectsWithCount = await Promise.all(
        (data || []).map(async (project: any) => {
          const { count } = await supabase
            .from('keywords')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id)

          return {
            id: project.id,
            name: project.name,
            created_at: project.created_at,
            keywords_count: count || 0
          }
        })
      )

      setProjects(projectsWithCount)
    } catch (error: any) {
      console.error('加载项目失败:', error)
      alert('加载项目失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 检查文件类型
    const validExtensions = ['.csv', '.xlsx', '.xls']
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!validExtensions.includes(fileExtension)) {
      alert('不支持的文件格式，请上传 CSV、XLSX 或 XLS 文件')
      return
    }

    setUploading(true)

    try {
      // 创建项目
      const projectName = file.name.replace(/\.(csv|xlsx|xls)$/i, '') + '_' + new Date().toLocaleDateString('zh-CN')
      const { data: projectData, error: projError } = await supabase
        .from('projects')
        .insert({ name: projectName })
        .select()
        .single()

      if (projError) throw projError
      const projectId = projectData.id

      // 跳转到项目详情页进行导入
      router.push(`/project/${projectId}`)
    } catch (error: any) {
      alert('创建项目失败: ' + error.message)
      setUploading(false)
    }
  }

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!confirm('确定要删除这个项目吗？这将删除所有相关的关键词数据。')) {
      return
    }

    try {
      // 删除项目（数据库应该设置级联删除关键词）
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)

      if (error) throw error

      // 重新加载项目列表
      loadProjects()
    } catch (error: any) {
      alert('删除项目失败: ' + error.message)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              NicheMiner
            </Link>
            <span className="text-slate-400">工作台</span>
          </div>
          <Link
            href="/ad-validator"
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all text-sm font-medium"
          >
            广告验证工具
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* 上传区域 */}
        <div className="mb-8">
          <label className="block">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="file-upload"
            />
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-12 text-center cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl">
              {uploading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                  <span className="text-white font-semibold text-lg">正在创建项目...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <Plus className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">创建新项目</h3>
                    <p className="text-blue-100">
                      上传长尾词文件（支持 CSV、XLSX、XLS 格式）
                    </p>
                  </div>
                </div>
              )}
            </div>
          </label>
        </div>

        {/* 项目列表 */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">我的项目</h2>

          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-slate-500">加载中...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center">
              <FolderOpen className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 text-lg mb-2">还没有项目</p>
              <p className="text-slate-400">点击上方按钮上传文件创建第一个项目</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/project/${project.id}`}
                  className="bg-white rounded-xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(project.created_at).toLocaleDateString('zh-CN')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span>{project.keywords_count || 0} 个关键词</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="删除项目"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center text-blue-600 font-medium group-hover:gap-2 transition-all">
                    <span>查看详情</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}


