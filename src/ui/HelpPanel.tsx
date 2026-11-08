import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const STEPS = [
  {
    title: '粘贴群消息',
    body: '把群里的通知整段复制到收件页输入框（iOS 可点「粘贴分享内容」），点「开始解析」。',
  },
  {
    title: '检查解析结果并收录',
    body: '规则引擎会拆出事项与截止时间；有歧义或低置信度的会标出来，确认后点「全部收录」。',
  },
  {
    title: '去日程 / 月历',
    body: '日程按天排好并做冲突提醒，月历可拖拽改期；完成、重复、统计都在对应页面。',
  },
]

const NOTES = [
  '数据只存在你自己的浏览器（IndexedDB）里，不上传服务器；唯一会出网的是你自己配置 AI 接口时。',
  '重复任务：完成一次会自动生成下一次；「跳过这一次」不算完成；「结束重复」停止生成但保留历史。',
  'iOS 没有系统分享目标：复制微信群消息后，用收件页的「粘贴分享内容」按钮即可。',
]

/** 使用说明弹层：三步 + 补充说明；Esc/遮罩关闭，焦点回到触发按钮 */
export default function HelpPanel({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="help-overlay" onClick={onClose}>
      <section
        className="help-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="help-head">
          <h2 id="help-title">怎么用拾穗</h2>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="关闭使用说明">
            ✕
          </button>
        </div>

        <ol className="help-steps">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="help-step-num">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="help-notes">
          <h3>补充说明</h3>
          <ul>
            {NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>

        <div className="help-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </section>
    </div>
  )
}
