import { useApp } from '@/state/store'

/**
 * 导入历史：每次「全部收录」会留下一条原始文本。
 * 用途是「回看当时贴了什么」以及「二次收录」——同一份通知过一阵可能又要交一次。
 */
export default function HistoryPanel({ onReuse }: { onReuse: (raw: string) => void }) {
  const history = useApp((s) => s.history)

  return (
    <section className="history card">
      <h3>
        导入历史<span className="muted">（{history.length}）</span>
      </h3>
      {history.length === 0 ? (
        <p className="muted">还没有收录过通知。贴一段、点「全部收录」之后，这里会留下原文，方便回看和二次收录。</p>
      ) : (
        <ul>
          {history.map((batch) => (
            <li key={batch.id}>
              <div className="history-meta">
                <time dateTime={new Date(batch.createdAt).toISOString()}>
                  {new Date(batch.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </time>
                <span className="muted">
                  · {batch.taskCount} 条 · {batch.engine}
                </span>
              </div>
              <p className="history-raw">{batch.rawText.slice(0, 90)}{batch.rawText.length > 90 ? '…' : ''}</p>
              <button type="button" className="btn btn-sm" onClick={() => onReuse(batch.rawText)}>
                重新解析
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
