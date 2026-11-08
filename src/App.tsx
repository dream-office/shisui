import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/state/store'
import { registerServiceWorker } from '@/services/pwa'
import InboxView from '@/ui/InboxView'
import ErrorBoundary from '@/ui/ErrorBoundary'
import HelpPanel from '@/ui/HelpPanel'
import MonthView from '@/ui/MonthView'
import PlanView from '@/ui/PlanView'
import SettingsView from '@/ui/SettingsView'
import StatsView from '@/ui/StatsView'
import { isLLMReady } from '@/services/llm'

/** 仅在 URL 显式带 ?__boom=1 时渲染：供 e2e 验证错误边界；默认完全不影响使用 */
function ErrorProbe(): null {
  throw new Error('__armed_error_for_e2e__')
}

const TABS = [
  { id: 'inbox', label: '收件' },
  { id: 'plan', label: '日程' },
  { id: 'calendar', label: '月历' },
  { id: 'stats', label: '统计' },
  { id: 'settings', label: '设置' },
] as const

export default function App() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const hydrate = useApp((s) => s.hydrate)
  const tasks = useApp((s) => s.tasks)
  const llmConfig = useApp((s) => s.llmConfig)
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)
  const [armed, setArmed] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('__boom') === '1',
  )
  const [helpOpen, setHelpOpen] = useState(false)
  const helpButtonRef = useRef<HTMLButtonElement>(null)

  // 错误边界自测开关：读取后立刻清掉 URL，保证刷新/回首页不会再次 armed
  useEffect(() => {
    if (!armed) return
    window.history.replaceState(null, '', window.location.pathname)
  }, [armed])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // 只在生产构建里注册 Service Worker；有新版本时提示用户，而不是自动替换页面
  useEffect(() => {
    registerServiceWorker((apply) => setApplyUpdate(() => apply))
  }, [])

  const pending = tasks.filter((task) => !task.done).length
  const aiOn = isLLMReady(llmConfig)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">穗</span>
          <div className="brand-text">
            <h1>拾穗</h1>
            <p>群里散落的截止时间，替你捡起来</p>
          </div>
            <button
              ref={helpButtonRef}
              type="button"
              className="btn btn-ghost btn-sm help-open"
              aria-haspopup="dialog"
              onClick={() => setHelpOpen(true)}
            >
              怎么用
            </button>
        </div>

        <nav className="tabs" aria-label="主视图">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${view === tab.id ? 'is-active' : ''}`}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
              {tab.id === 'plan' && pending > 0 && <span className="tab-badge">{pending}</span>}
            </button>
          ))}
        </nav>

        <div className={`engine-pill ${aiOn ? 'is-ai' : ''}`} title={aiOn ? '规则引擎 + AI 双引擎' : '仅规则引擎（在设置里可接入 AI）'}>
          <span className="dot" />
          {aiOn ? '双引擎' : '规则引擎'}
        </div>
      </header>

      <main className="main">
        <ErrorBoundary onReset={() => setArmed(false)}>
          {armed && <ErrorProbe />}
          {view === 'inbox' && <InboxView />}
          {view === 'plan' && <PlanView />}
          {view === 'calendar' && <MonthView />}
          {view === 'stats' && <StatsView />}
          {view === 'settings' && <SettingsView />}
        </ErrorBoundary>
      </main>

      <footer className="footer">
        <span>数据只存在本地浏览器里（IndexedDB），不上传服务器</span>
        <span className="footer-sep">·</span>
        <span>规则引擎离线可用，接不接 AI 都能跑</span>
        <span className="footer-sep">·</span>
        <a
          className="footer-link"
          href="https://github.com/dream-office/shisui"
          target="_blank"
          rel="noreferrer"
        >
          源码（AGPL-3.0）
        </a>
      </footer>

      <HelpPanel
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false)
          helpButtonRef.current?.focus()
        }}
      />

      {applyUpdate && (
        <div className="toast update-toast" role="status">
          <span>有新版本可用</span>
          <button type="button" className="btn btn-sm" onClick={applyUpdate}>
            刷新
          </button>
        </div>
      )}
    </div>
  )
}
