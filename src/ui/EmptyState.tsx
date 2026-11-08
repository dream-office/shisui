/**
 * 空态统一：轻量「穗」几何标记 + 一句项目语气文案 + 一个操作入口。
 * 标记是 inline SVG，不引图片、不加载字体；签名色只用于这里。
 */
interface Props {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
  compact?: boolean
}

export function SprigMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`sprig-mark ${className}`.trim()}
      viewBox="0 0 40 40"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      {/* 茎 */}
      <path d="M20 36V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* 三粒麦穗：菱形几何 */}
      <path d="M20 9 26 15 20 21 14 15Z" fill="currentColor" />
      <path d="M20 18 24.5 22.5 20 27 15.5 22.5Z" fill="currentColor" opacity="0.72" />
      <path d="M20 25 23.5 28.5 20 32 16.5 28.5Z" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

export default function EmptyState({ title, body, action, compact = false }: Props) {
  return (
    <div className={`empty-state ${compact ? 'is-compact' : ''}`}>
      <SprigMark />
      <div className="empty-state-text">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      {action && (
        <button type="button" className="btn btn-primary btn-sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
