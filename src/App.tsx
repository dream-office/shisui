import { useEffect, useState } from 'react'
import { useApp } from '@/state/store'
import { registerServiceWorker } from '@/services/pwa'
import InboxView from '@/ui/InboxView'
import PlanView from '@/ui/PlanView'
import SettingsView from '@/ui/SettingsView'
import { isLLMReady } from '@/services/llm'

const TABS = [
  { id: 'inbox', label: '收件' },
  { id: 'plan', label: '日程' },
  { id: 'settings', label: '设置' },
] as const

export default function App() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const hydrate = useApp((s) => s.hydrate)
  const tasks = useApp((s) => s.tasks)
  const llmConfig = useApp((s) => s.llmConfig)
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)

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
        {view === 'inbox' && <InboxView />}
        {view === 'plan' && <PlanView />}
        {view === 'settings' && <SettingsView />}
      </main>

      <footer className="footer">
        <span>数据只存在你自己的浏览器里（IndexedDB），不上传任何服务器</span>
        <span className="footer-sep">·</span>
        <span>规则引擎离线可用，接不接 AI 都能跑</span>
      </footer>

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
