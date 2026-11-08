import { t } from '@/i18n'
import { useMemo } from 'react'
import EmptyState from './EmptyState'
import { computeStats } from 'shisui-core'
import { useApp } from '@/state/store'
import { useNow } from './useNow'

function MetricBar({ label, hint, value }: { label: string; hint: string; value: number | null }) {
  return (
    <div className="metric card">
      <div className="metric-head">
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value === null ? '—' : `${value}%`}</strong>
      </div>
      <div className="metric-track">
        <div className="metric-fill" style={{ width: value === null ? '0%' : `${value}%` }} />
      </div>
      <p className="metric-hint muted">{hint}</p>
    </div>
  )
}

/**
 * 统计页：全部在本地用现有数据算，不引图表库。
 * 口径在 core 的 computeStats 里（纯函数、可单测）。
 */
export default function StatsView() {
  const tasks = useApp((s) => s.tasks)
  const now = useNow(60_000)
  const stats = useMemo(() => computeStats(tasks, now), [tasks, now])
  const setView = useApp((s) => s.setView)

  return (
    <section className="stats-view">
      <div className="stats-head">
        <h2>{t('统计')}</h2>
        <span className="muted">{t('全部在本地计算')}</span>
      </div>

      {stats.total === 0 && (
        <div className="card">
          <EmptyState
            title={t('还没有数据')}
            body={t('收录第一条待办后，这里会显示你的完成率与解析质量。')}
            action={{ label: t('去收件'), onClick: () => setView('inbox') }}
          />
        </div>
      )}

      <div className="metric-grid">
        <MetricBar
          label={t('本周完成率')}
          value={stats.completion}
          hint={t('本周到期 {n} 件，已完成 {done} 件（按到期时间统计，不看完成时间）', { n: stats.weekTotal, done: stats.doneThisWeek })}
        />
        <MetricBar
          label={t('解析手改率')}
          value={stats.editRate}
          hint={t('解析来源 {n} 件，其中你手动改过 {edited} 件（手动添加 / 日历导入不算）', { n: stats.parsedTotal, edited: stats.edited })}
        />
      </div>

      <div className="metric-grid">
        <div className="metric card">
          <div className="metric-head">
            <span className="metric-label">{t('全部任务')}</span>
            <strong className="metric-value">{stats.total}</strong>
          </div>
          <p className="metric-hint muted">{t('包括所有来源与已完成')}</p>
        </div>
        <div className="metric card">
          <div className="metric-head">
            <span className="metric-label">{t('未完成')}</span>
            <strong className="metric-value">{stats.open}</strong>
          </div>
          <p className="metric-hint muted">{t('还在日程里的条目')}</p>
        </div>
      </div>
    </section>
  )
}
