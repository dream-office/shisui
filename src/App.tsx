import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { setLang as applyLang, t } from '@/i18n'
import { useApp } from '@/state/store'
import { pathForView, viewFromPath } from '@/shells/routes'
import { registerServiceWorker } from '@/services/pwa'
import InboxView from '@/ui/InboxView'
import ErrorBoundary from '@/ui/ErrorBoundary'
import HelpPanel from '@/ui/HelpPanel'
import MonthView from '@/ui/MonthView'
import PlanView from '@/ui/PlanView'
import SettingsView from '@/ui/SettingsView'
import StatsView from '@/ui/StatsView'
import { isLLMReady } from '@/services/llm'
import { registerSignatureClick } from '@/ui/signature'

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


/** 侧栏/dock 图标：内置 SVG，避免新增依赖 */
function NavIcon({ id }: { id: string }) {
  const paths: Record<string, string> = {
    inbox: 'M4 5h16v10H4z M4 15l3-3h10l3 3 M8 19h8',
    plan: 'M5 4h14v16H5z M8 3v4 M16 3v4 M5 9h14 M9 13l2 2 4-4',
    calendar: 'M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16',
    stats: 'M5 20V10 M12 20V4 M19 20v-7',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-4l-.4 2.1a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L6 10a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.1h4l.4-2.1a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z',
  }
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[id] ?? paths.inbox} />
    </svg>
  )
}

let signatureLogged = false

export default function App() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const hydrate = useApp((s) => s.hydrate)
  const tasks = useApp((s) => s.tasks)
  const llmConfig = useApp((s) => s.llmConfig)
  const lang = useApp((s) => s.lang)
  const theme = useApp((s) => s.theme)
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)
  const [armed, setArmed] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('__boom') === '1',
  )
  const [helpOpen, setHelpOpen] = useState(false)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const navRefs = useRef<Record<string, HTMLButtonElement[]>>({})
  const helpTriggerRef = useRef<HTMLButtonElement | null>(null)
  const scrollPositions = useRef<Partial<Record<string, number>>>({})
  const pendingScroll = useRef(false)
  const restoreFocus = useRef(false)
  const signatureClicks = useRef<number[]>([])
  const signatureRef = useRef<HTMLButtonElement>(null)
  const signatureCloseRef = useRef<HTMLButtonElement>(null)

  // 外观：跟随系统 / 强制亮暗；PWA theme-color 跟随
  useEffect(() => {
    if (__EMBEDDED__) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if (meta) meta.content = resolved === 'dark' ? '#1E1A12' : '#FAF5EC'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  // 语言切换：同步 i18n 模块、<html lang> 与标题
  useEffect(() => {
    applyLang(lang)
    if (__EMBEDDED__) return
    document.title =
      lang === 'en' ? 'Shisui — turn group messages into to-dos' : '拾穗 · 群消息变待办'
    // PWA manifest 中英双份：按语言切换 <link rel="manifest">
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (link) link.href = lang === 'en' ? './manifest.en.webmanifest' : './manifest.webmanifest'
  }, [lang])

  // 错误边界自测开关：读取后立刻清掉 URL，保证刷新/回首页不会再次 armed
  useEffect(() => {
    if (!armed) return
    window.history.replaceState(null, '', window.location.pathname)
  }, [armed])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Tab 历史：浏览器返回回到来源视图，并恢复滚动位置/焦点
  useEffect(() => {
    if (!window.history.state || window.history.state.shisuiView === undefined) {
      window.history.replaceState({ shisuiView: view }, '')
    }
    const onPopState = (event: PopStateEvent) => {
      const stateView = (event.state as { shisuiView?: string } | null)?.shisuiView
      const next = stateView ?? (__EMBEDDED__ ? viewFromPath(window.location.pathname) : null)
      if (!next || next === view) return
      scrollPositions.current[view] = window.scrollY
      pendingScroll.current = true
      restoreFocus.current = true
      setView(next as typeof view)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [view, setView])

  useEffect(() => {
    const top = pendingScroll.current ? (scrollPositions.current[view] ?? 0) : 0
    pendingScroll.current = false
    window.scrollTo({ top, behavior: 'auto' })
    if (restoreFocus.current) {
      restoreFocus.current = false
      focusNav(view)
    }
  }, [view])

  const focusNav = (id: string) => {
    const candidates = navRefs.current[id] ?? []
    candidates.find((el) => el.getClientRects().length > 0)?.focus({ preventScroll: true })
  }

  const onNavKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const current = TABS.findIndex((tab) => tab.id === view)
    let next = current
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % TABS.length
    else next = (current - 1 + TABS.length) % TABS.length
    focusNav(TABS[next].id)
  }

  const openHelp = (trigger: HTMLButtonElement) => {
    helpTriggerRef.current = trigger
    setHelpOpen(true)
  }

  const navigate = (next: typeof view) => {
    if (next === view) return
    scrollPositions.current[view] = window.scrollY
    const url = __EMBEDDED__ ? pathForView(next) : null
    window.history.pushState({ shisuiView: next }, '', url)
    setView(next)
  }

  // 控制台签名：整页只打一次（React StrictMode 双挂载也只一次）
  useEffect(() => {
    if (signatureLogged) return
    signatureLogged = true
    console.log('%c拾穗 · dream-office · 把散落的时间捡起来', 'color:#906F17;font-weight:600;')
  }, [])

  // 彩蛋打开后：焦点到关闭按钮，Esc 关闭并把焦点还给落款
  useEffect(() => {
    if (!signatureOpen) return
    signatureCloseRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSignatureOpen(false)
        signatureRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [signatureOpen])

  const closeSignature = () => {
    setSignatureOpen(false)
    signatureRef.current?.focus()
  }

  const handleSignatureClick = () => {
    const result = registerSignatureClick(signatureClicks.current, Date.now())
    signatureClicks.current = result.clicks
    if (result.open) setSignatureOpen(true)
  }

  // 只在生产构建里注册 Service Worker；有新版本时提示用户，而不是自动替换页面
  useEffect(() => {
    if (__EMBEDDED__) return
    registerServiceWorker((apply) => setApplyUpdate(() => apply))
  }, [])

  const pending = tasks.filter((task) => !task.done).length
  const aiOn = isLLMReady(llmConfig)

  const registerNav = (id: string, el: HTMLButtonElement | null) => {
    const list = navRefs.current[id] ?? []
    const next = list.filter((item) => item !== el && item.isConnected)
    if (el) next.push(el)
    navRefs.current[id] = next
  }

  const navButtons = (location: 'sidebar' | 'dock') =>
    TABS.map((tab) => (
      <button
        key={`${location}-${tab.id}`}
        type="button"
        ref={(el) => registerNav(tab.id, el)}
        className={location === 'sidebar' ? 'sb-item' : 'dock-item'}
        aria-current={view === tab.id ? 'page' : undefined}
        aria-label={t(tab.label)}
        tabIndex={view === tab.id ? 0 : -1}
        onClick={() => navigate(tab.id)}
      >
        {location === 'sidebar' ? <NavIcon id={tab.id} /> : <NavIcon id={tab.id} />}
        <span>{t(tab.label)}</span>
        {tab.id === 'plan' && pending > 0 && <span className="tab-badge">{pending}</span>}
      </button>
    ))

  return (
    <>
      {!__EMBEDDED__ && <div className="gradient-line" aria-hidden="true" />}
      <div className={`shell${__EMBEDDED__ ? ' is-embedded' : ''}`}>
        {!__EMBEDDED__ && (
        <aside className="sidebar" aria-label={t('主导航')}>
          <div className="sb-brand">
            <span className="sb-mark" aria-hidden="true">穗</span>
            <div className="sb-brand-copy">
              <h1 className="sb-title">{t('拾穗')}</h1>
              <span className="sb-tagline">{t('群里散落的截止时间，替你捡起来')}</span>
            </div>
          </div>
          <nav className="sb-nav" aria-label={t('主视图')} onKeyDown={onNavKeyDown}>
            {navButtons('sidebar')}
          </nav>
          <div className="sb-foot">
            <button
              type="button"
              className="btn btn-sm sb-help"
              aria-haspopup="dialog"
              onClick={(event) => openHelp(event.currentTarget)}
            >
              {t('怎么用')}
            </button>
            <div
              className={`engine-pill ${aiOn ? 'is-ai' : ''}`}
              title={aiOn ? t('规则引擎 + AI 双引擎') : t('仅规则引擎（在设置里可接入 AI）')}
            >
              <span className="dot" />
              {aiOn ? t('双引擎') : t('规则引擎')}
            </div>
          </div>
        </aside>
        )}

        <div className="shell-main">
          {!__EMBEDDED__ && (
          <header className="mobile-bar">
            <div className="mobile-brand">
              <span className="sb-mark" aria-hidden="true">穗</span>
              <h1 className="sb-title">{t('拾穗')}</h1>
            </div>
            <span className="grow" />
            <button
              type="button"
              className="mobile-help"
              aria-haspopup="dialog"
              onClick={(event) => openHelp(event.currentTarget)}
            >
              {t('怎么用')}
            </button>
          </header>
          )}

      <main className="main" id="main">
        {__EMBEDDED__ && (
          <div className="embedded-head">
            <button type="button" className="btn btn-sm" aria-haspopup="dialog" onClick={(event) => openHelp(event.currentTarget)}>
              {t('怎么用')}
            </button>
          </div>
        )}

        <ErrorBoundary onReset={() => setArmed(false)}>
          {armed && <ErrorProbe />}
          {view === 'inbox' && <InboxView />}
          {view === 'plan' && <PlanView />}
          {view === 'calendar' && <MonthView />}
          {view === 'stats' && <StatsView />}
          {view === 'settings' && <SettingsView />}
        </ErrorBoundary>
      </main>

      {!__EMBEDDED__ && (
      <footer className="footer">
        <span>{t('数据只存在本地浏览器里（IndexedDB），不上传服务器')}</span>
        <span className="footer-sep">·</span>
        <span>{t('规则引擎离线可用，接不接 AI 都能跑')}</span>
        <span className="footer-sep">·</span>
        <a
          className="footer-link"
          href="https://github.com/dream-office/shisui"
          target="_blank"
          rel="noreferrer"
        >
          {t('源码（AGPL-3.0）')}
        </a>
        <button
          ref={signatureRef}
          type="button"
          className="signature-btn"
          onClick={handleSignatureClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setSignatureOpen(true)
            }
          }}
          aria-label={t('dream-office 签名')}
          title={t('dream-office 签名')}
          aria-expanded={signatureOpen}
          aria-controls="signature-note"
        >
          <span className="signature-mark" aria-hidden />
          dream-office
        </button>
        {signatureOpen && (
          <div
            id="signature-note"
            className="signature-line"
            role="dialog"
            aria-modal="false"
            aria-label={t('作者签名')}
          >
            <p className="signature-quote" aria-live="polite">
              {t('把散落的时间，一粒一粒捡起来。')}
            </p>
            <button
              ref={signatureCloseRef}
              type="button"
              className="signature-close"
              onClick={closeSignature}
              aria-label={t('关闭作者签名')}
            >
              ×
            </button>
          </div>
        )}
      </footer>
      )}
        </div>
      </div>

      {!__EMBEDDED__ && (
      <div className="dock">
        <nav aria-label={t('主视图')} onKeyDown={onNavKeyDown}>
          {navButtons('dock')}
        </nav>
      </div>
      )}

      <HelpPanel
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false)
          helpTriggerRef.current?.focus()
        }}
      />

      {applyUpdate && (
        <div className="toast update-toast" role="status">
          <span>{t('有新版本可用')}</span>
          <button type="button" className="btn btn-sm" onClick={applyUpdate}>
            {t('刷新')}
          </button>
        </div>
      )}
    </>
  )
}
