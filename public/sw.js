/**
 * 手写 Service Worker（零依赖，不引入 vite-plugin-pwa）。
 *
 * 策略（都选最保守的一侧）：
 * - **只处理同源 GET**；跨域请求一律放行、不缓存 —— 应用默认零网络请求的承诺不受影响。
 * - **导航请求 network-first**：有网时拿最新页面，断网时回退缓存的 index.html（离线可开）。
 * - **静态资源 cache-first**：首次加载后离线可用；命中缓存直接返回，不再发请求。
 * - **更新不自动接管**：新版本装好先等着，用户点「刷新」才 skipWaiting + reload。
 *   自动接管会在用户操作中途换掉页面，容易丢输入。
 * - **不缓存敏感数据**：只缓存应用外壳与静态资源；待办数据本来就在 IndexedDB，不在缓存里。
 *
 * 版本号变化时才换缓存名，activate 时删掉旧缓存（避免无限增长）。
 */
const CACHE = 'shisui-v0.5.0'

// 资源响应带 Vary: Origin（Vite preview 默认），而预缓存请求与页面请求的 Origin 头不同；
// 按 Vary 匹配会 miss，所以缓存匹配一律忽略 Vary。
const MATCH_OPTIONS = { ignoreVary: true }

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
]

/**
 * 解析构建后的 index.html，把里面引用的同源资源（js/css/图标）也预缓存。
 *
 * 为什么需要：首次访问时 Service Worker 还没接管，Vite 产出的带哈希资源
 * 是在「没有 SW」的情况下加载的，不会被运行时缓存捕获。
 * 不预缓存的话，离线打开只有空壳（HTML 在、JS 不在）。
 */
async function precacheBuildAssets() {
  const cache = await caches.open(CACHE)
  await cache.addAll(APP_SHELL)

  let html = ''
  try {
    const response = await fetch('./index.html', { cache: 'no-cache' })
    if (response.ok) html = await response.text()
  } catch {
    // 离线安装时拿不到 HTML：至少应用外壳已经缓存了
    return
  }

  const urls = new Set()
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const raw = match[1]
    if (!raw || raw.startsWith('http') || raw.startsWith('//') || raw.startsWith('data:')) continue
    if (!raw.startsWith('./') && !raw.startsWith('/')) continue
    urls.add(new URL(raw, self.location.href).href)
  }

  await Promise.all(
    [...urls].map(async (url) => {
      try {
        await cache.add(url)
      } catch {
        // 单个资源失败不该让整个安装失败
      }
    }),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheBuildAssets())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function put(request, response) {
  if (!response || !response.ok) return
  const copy = response.clone()
  caches.open(CACHE).then((cache) => cache.put(request, copy))
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // 跨域不碰，也不缓存

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          put(request, response)
          return response
        })
        .catch(async () => {
          const cached = (await caches.match('./index.html', MATCH_OPTIONS)) || (await caches.match('./', MATCH_OPTIONS))
          return cached || Response.error()
        }),
    )
    return
  }

  event.respondWith(
    caches.match(request, MATCH_OPTIONS).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          put(request, response)
          return response
        }),
    ),
  )
})
