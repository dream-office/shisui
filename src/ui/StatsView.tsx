import { t } from '@/i18n'
import { useMemo } from 'react'
import EmptyState from './EmptyState'
import { computeStats } from 'shisui-core'
import { useApp } from '@/state/store'
import { useNow } from './useNow'
import { readFocusSessions, summarizeFocusSessions } from '@/services/focusLog'

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

function durationText(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return t('{n} 分钟', { n: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? t('{h} 小时', { h: hours }) : t('{h} 小时 {m} 分钟', { h: hours, m: rest })
}

const OVERDUE_LABELS = [
  ['under1d', '1 天内'],
  ['1to3d', '1–3 天'],
  ['3to7d', '3–7 天'],
  ['over7d', '7 天以上'],
] as const

const CONFLICT_LABELS = [
  ['overlap', '时间重叠'],
  ['overdue', '已过期'],
  ['clash', '截止撞车'],
  ['pileup', '同日堆积'],
] as const

/**
 * 统计页：全部在本地用现有数据算，不引图表库。
 * 完成率/手改率口径在 core 的 computeStats；专注时长来自本地 focusLog。
 */
export default function StatsView() {
  const tasks = useApp((s) => s.tasks)
  const now = useNow(60_000)
  const stats = useMemo(() => computeStats(tasks, now), [tasks, now])
  const focus = useMemo(() => summarizeFocusSessions(readFocusSessions(), now), [now])
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
            body={t('收录第一条待办后，这里会显示完成率、逾期、冲突与专注时长。')}
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

      <div className="metric card">
        <div className="metric-head">
          <span className="metric-label">{t('近 7 天专注')}</span>
          <strong className="metric-value">{focus.sessions === 0 ? '—' : durationText(focus.totalMs)}</strong>
        </div>
        <p className="metric-hint muted">
          {focus.sessions === 0
            ? t('进入日程页的「专注模式」开始计时')
            : t('共 {n} 次 · 今天 {m} 分钟', {
                n: focus.sessions,
                m: Math.round(focus.todayMs / 60_000),
              })}
        </p>
      </div>

      <div className="stats-panel card">
        <div className="stats-panel-head">
          <h3>{t('未完成逾期分布')}</h3>
          <span className="muted">{t('共 {n} 件', { n: stats.overdue })}</span>
        </div>
        {stats.overdue === 0 ? (
          <p className="stats-empty muted">{t('当前没有逾期任务')}</p>
        ) : (
          <div className="bucket-list">
            {OVERDUE_LABELS.map(([key, label]) => {
              const count = stats.overdueBuckets.find((bucket) => bucket.key === key)?.count ?? 0
              return (
                <div className="bucket-row" key={key}>
                  <span>{t(label)}</span>
                  <div className="bucket-track">
                    <div
                      className="bucket-fill"
                      style={{ width: `${(count / stats.overdue) * 100}%` }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="stats-panel card">
        <div className="stats-panel-head">
          <h3>{t('冲突体检')}</h3>
          <span className="muted">{t('按当前未完成任务计算')}</span>
        </div>
        <div className="conflict-grid">
          {CONFLICT_LABELS.map(([key, label]) => (
            <div className="conflict-item" key={key}>
              <span className="conflict-label">{t(label)}</span>
              <strong className="conflict-count">{stats.conflicts[key]}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
