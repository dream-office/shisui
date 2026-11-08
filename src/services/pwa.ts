/**
 * PWA 注册与更新提示。
 *
 * 只在生产构建里注册 —— 开发时注册 Service Worker 会缓存 dev 资源，HMR 会变得难以预测。
 * 更新策略：新版本装好后**不自动接管**，先提示用户；点了「刷新」才 skipWaiting + reload。
 *
 * 两个踩过的坑（都写在这儿防复发）：
 * 1. 不能只监听 window load：React 的 effect 可能在 load 之后才跑，事件永不再来 → 从不注册。
 * 2. 不能无条件在 controllerchange 里 reload：首次安装时 activate 的 clients.claim()
 *    也会触发 controllerchange，那样第一次访问就会被刷新一次。
 *    只有「用户点了刷新」才允许 reload。
 */
let reloadOnControllerChange = false

export function registerServiceWorker(onUpdateReady: (apply: () => void) => void): void {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  const start = () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        const notify = (worker: ServiceWorker | null) => {
          if (!worker) return
          // 首次安装（没有旧 controller）不提示；只有「已有旧版本在运行」才算更新
          if (navigator.serviceWorker.controller) {
            onUpdateReady(() => {
              reloadOnControllerChange = true
              worker.postMessage({ type: 'SKIP_WAITING' })
            })
          }
        }

        notify(registration.waiting)

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') notify(installing)
          })
        })
      })
      .catch(() => {
        // 注册失败不影响主流程：只是没有离线能力
      })
  }

  if (document.readyState === 'complete') {
    start()
  } else {
    window.addEventListener('load', start, { once: true })
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadOnControllerChange) return // 首次 claim 不刷新
    reloadOnControllerChange = false
    window.location.reload()
  })
}
