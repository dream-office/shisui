export const EMBED_BASE = '/projects/shisui'

export const VIEW_PATHS = {
  inbox: 'inbox',
  plan: 'plan',
  calendar: 'calendar',
  stats: 'stats',
  settings: 'settings',
} as const

export type ShellView = keyof typeof VIEW_PATHS

export function viewFromPath(pathname: string): ShellView | null {
  const prefix = EMBED_BASE
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length).replace(/^\/+/, '').replace(/\/+$/, '')
  if (!rest) return 'inbox'
  return (Object.keys(VIEW_PATHS) as ShellView[]).find((key) => VIEW_PATHS[key] === rest) ?? null
}

export function pathForView(view: ShellView): string {
  return `${EMBED_BASE}/${VIEW_PATHS[view]}`
}
