import { t } from '@/i18n'
import { useMemo, useState } from 'react'
import { sortFocusQueue } from 'shisui-core'
import { useApp } from '@/state/store'
import TaskRow from './TaskRow'

/** 专注模式：一次只处理一件，完成/跳过/下一条；完成与跳过复用重复系列语义 */
export default function FocusView() {
  const tasks = useApp((s) => s.tasks)
  const focusIndex = useApp((s) => s.focusIndex)
  const closeFocus = useApp((s) => s.closeFocus)
  const focusNext = useApp((s) => s.focusNext)
  const focusComplete = useApp((s) => s.focusComplete)
  const focusSkip = useApp((s) => s.focusSkip)
  const series = useApp((s) => s.series)
  const now = Date.now()

  const active = useMemo(() => sortFocusQueue(tasks), [tasks])
  const safeIndex = active.length === 0 ? 0 : focusIndex % active.length
  const current = active[safeIndex]
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="focus card" role="region" aria-label={t('专注模式')}>
      <div className="focus-head">
        <h3>{t('专注模式')}</h3>
        <span className="muted">
          {active.length === 0 ? t('全部处理完了') : `${safeIndex + 1} / ${active.length}`}
        </span>
      </div>

      {current === undefined ? (
        <p className="muted">{t('没有未完成的任务了，休息一下。')}</p>
      ) : (
        <div className="focus-body">
          <TaskRow
            task={current}
            now={now}
            onToggle={() => void run(focusComplete)}
            onDelete={() => void run(focusSkip)}
            seriesLabel={
              current.seriesId
                ? series.find((item) => item.id === current.seriesId)?.title ?? t('重复')
                : null
            }
            onSkip={() => void run(focusSkip)}
            onEndSeries={undefined}
          />
          <div className="focus-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run(focusComplete)}>
              {t('完成')}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(focusSkip)}>
              {t('跳过')}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={focusNext}>
              {t('下一条')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeFocus}>
              {t('退出专注')}
            </button>
          </div>
          <p className="muted focus-hint">{t('完成后会自动排到下一条；「跳过」对重复任务是「跳过这一次」。')}</p>
        </div>
      )}
    </section>
  )
}
