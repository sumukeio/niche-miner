@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ==========================================
:: Indie Boss 文档驱动开发初始化脚本 (Windows版)
:: ==========================================

:: 1. 获取日期 (格式 YYYYMMDD)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set DATE=%datetime:~0,8%

:: 2. 设置变量
set PHASE_NAME=phase-init-%DATE%
set PHRASE_ROOT=.phrase
set PHASE_DIR=%PHRASE_ROOT%\phases\%PHASE_NAME%
set DOCS_DIR=%PHRASE_ROOT%\docs

echo 🚀 Indie Boss 数字工厂启动中...

:: 3. 创建目录结构
if not exist "%PHASE_DIR%" md "%PHASE_DIR%"
if not exist "%DOCS_DIR%" md "%DOCS_DIR%"

:: 4. 创建全局索引 (Global Indexes)

if not exist "%DOCS_DIR%\ISSUES.md" (
    (
        echo # Global Issues Index
        echo ^| ID ^| Status ^| Summary ^| Phase ^|
        echo ^|----^|--------^|---------^|-------^|
    ) > "%DOCS_DIR%\ISSUES.md"
)

if not exist "%DOCS_DIR%\CHANGE.md" (
    (
        echo # Global Change Log
        echo 记录跨阶段的重大变更。详情见各 phase 下的 change_*.md。
        echo.
        echo - [%PHASE_NAME%](../phases/%PHASE_NAME%/change_init.md)
    ) > "%DOCS_DIR%\CHANGE.md"
)

:: 5. 创建当前阶段模板 (Phase Templates)

:: spec: 需求与交互
(
    echo # Spec: Project Initialization
    echo ## 1. Summary
    echo 项目基建搭建与环境配置。
    echo.
    echo ## 2. Goals
    echo - 初始化 Next.js + Tailwind + Supabase。
    echo - 确立 .cursorrules 规范。
    echo.
    echo ## 3. User Flows ^(N/A for Init^)
) > "%PHASE_DIR%\spec_init.md"

:: tech-refer: 技术决策与数据库
(
    echo # Tech Reference: Initialization
    echo ## Stack
    echo - Framework: Next.js 14+ ^(App Router^)
    echo - Style: Tailwind CSS + Shadcn/UI
    echo - DB: Supabase ^(PostgreSQL^)
    echo - Deploy: Vercel
    echo.
    echo ## Schema ^(Database^)
    echo - N/A for init
) > "%PHASE_DIR%\tech-refer_init.md"

:: plan: 宏观计划
(
    echo # Plan: Initialization
    echo ## Milestones
    echo - [ ] 基础环境跑通
    echo - [ ] 数据库连接成功
    echo.
    echo ## Task Pool ^(拆解任务^)
    echo - task001 [ ] 初始化 Next.js 项目并清理样板代码。 ^(验证: npm run dev 页面纯净^)
    echo - task002 [ ] 配置 Supabase Client 与 环境变量。 ^(验证: 能打印 supabase 实例^)
    echo - task003 [ ] 配置 .cursorrules。 ^(验证: Cursor 读取规则^)
) > "%PHASE_DIR%\plan_init.md"

:: task: 每日执行清单
(
    echo # Task Tracker
    echo 复制 plan 中的任务到这里，一个个执行。
    echo.
    echo - task001 [ ] ...
) > "%PHASE_DIR%\task_init.md"

:: change: 变更日志
(
    echo # Change Log ^(%PHASE_NAME%^)
    echo ## taskNNN
    echo - Type: Add/Modify
    echo - Files: ...
) > "%PHASE_DIR%\change_init.md"

echo ✅ 结构初始化完成！
echo 📂 文档位于: %PHASE_DIR%
echo 👉 请立即配置根目录下的 .cursorrules

pause