import { completionTrend, computeStats, kindDistribution, type KindCount, type StoredTask, type WeekCompletion } from 'shisui-core'
import { t, getLang } from '@/i18n'
import { useMemo } from 'react'
import EmptyState from './EmptyState'
import { useApp } from '@/state/store'
import { useNow } from './useNow'
import { dailyFocus, readFocusSessions, summarizeFocusSessions, type FocusDay } from '@/services/focusLog'
import { buildStatsCsv, downloadStatsPng, downloadTextFile, type StatsExportData } from '@/services/statsExport'

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

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(getLang() === 'en' ? 'en-US' : 'zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
}

const KIND_LABELS: Record<StoredTask['kind'], string> = {
  task: '任务 / 交付物',
  meeting: '会议 / 活动',
  review: '评审 / 验收',
  signup: '报名 / 登记',
  payment: '缴费 / 报销',
  approval: '审批 / 确认',
  survey: '问卷 / 填表',
  exam: '考试 / 测验',
  other: '其他',
}

function TrendBars({ points }: { points: WeekCompletion[] }) {
  return (
    <div className="trend-chart" role="img" aria-label={t('8 周完成趋势')}>
      {points.map((point) => (
        <div className="trend-col" key={point.weekStart}>
          <span className="trend-value">{point.rate === null ? '—' : `${point.rate}%`}</span>
          <div className="trend-track">
            <div className="trend-bar" style={{ height: point.rate === null ? '0%' : `${Math.max(2, point.rate)}%` }} />
          </div>
          <span className="trend-label">{shortDate(point.weekStart)}</span>
        </div>
      ))}
    </div>
  )
}

function KindBars({ kinds }: { kinds: KindCount[] }) {
  const max = Math.max(1, ...kinds.map((item) => item.count))
  return (
    <div className="kind-list">
      {kinds.map((item) => (
        <div className="kind-row" key={item.kind}>
          <span className="kind-label">{t(KIND_LABELS[item.kind])}</span>
          <div className="kind-track">
            <div className="kind-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  )
}

function FocusBars({ days }: { days: FocusDay[] }) {
  const max = Math.max(1, ...days.map((day) => day.totalMs))
  return (
    <div className="focus-trend" role="img" aria-label={t('每日专注趋势')}>
      {days.map((day) => (
        <div className="focus-col" key={day.dayStart}>
          <span className="focus-value">{day.totalMs === 0 ? '—' : `${Math.round(day.totalMs / 60_000)}m`}</span>
          <div className="focus-track">
            <div className="focus-bar" style={{ height: `${(day.totalMs / max) * 100}%` }} />
          </div>
          <span className="focus-label">{shortDate(day.dayStart)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * 统计页：全部在本地用现有数据算，不引图表库。
 * 完成率/手改率/延期完成率口径在 core 的 computeStats；专注来自本地 focusLog。
 */
export default function StatsView() {
  const tasks = useApp((s) => s.tasks)
  const now = useNow(60_000)
  const stats = useMemo(() => computeStats(tasks, now), [tasks, now])
  const trend = useMemo(() => completionTrend(tasks, now, 8), [tasks, now])
  const kinds = useMemo(() => kindDistribution(tasks), [tasks])
  const sessions = useMemo(() => readFocusSessions(), [])
  const focus = useMemo(() => summarizeFocusSessions(sessions, now), [sessions, now])
  const focusDays = useMemo(() => dailyFocus(sessions, now, 7), [sessions, now])
  const setView = useApp((s) => s.setView)

  const exportData = (): StatsExportData => ({
    stats,
    trend,
    kinds,
    focus: focusDays,
    kindLabel: (kind) => t(KIND_LABELS[kind]),
    lang: getLang(),
  })
  const dateStamp = new Date(now).toISOString().slice(0, 10)

  return (
    <section className="stats-view">
      <div className="stats-head">
        <h2>{t('统计')}</h2>
        <div className="stats-tools">
          <span className="muted">{t('全部在本地计算')}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => downloadTextFile(`shisui-stats-${dateStamp}.csv`, buildStatsCsv(exportData()))}
          >
            {t('导出 CSV')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => downloadStatsPng(exportData(), `shisui-stats-${dateStamp}.png`)}
          >
            {t('导出 PNG')}
          </button>
        </div>
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
          hint={t('本周到期 {n} 件，已完成 {done} 件（按到期时间统计，跳过不计）', { n: stats.weekTotal, done: stats.doneThisWeek })}
        />
        <MetricBar
          label={t('解析手改率')}
          value={stats.editRate}
          hint={t('解析来源 {n} 件，其中你手动改过 {edited} 件（手动添加 / 日历导入不算）', { n: stats.parsedTotal, edited: stats.edited })}
        />
      </div>

      <div className="metric-grid">
        <MetricBar
          label={t('延期完成率')}
          value={stats.lateRate}
          hint={t('有完成时间的 {n} 件已完成中，{late} 件晚于截止时间', { n: stats.doneWithTime, late: stats.lateDone })}
        />
        <div className="metric card">
          <div className="metric-head">
            <span className="metric-label">{t('未完成 / 全部')}</span>
            <strong className="metric-value">{stats.open} / {stats.total}</strong>
          </div>
          <p className="metric-hint muted">{t('已跳过 {n} 件，不算完成率、逾期与冲突', { n: stats.skipped })}</p>
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
            : t('共 {n} 次 · 今天 {m} 分钟', { n: focus.sessions, m: Math.round(focus.todayMs / 60_000) })}
        </p>
      </div>

      <div className="stats-panel card">
        <div className="stats-panel-head">
          <h3>{t('8 周完成趋势')}</h3>
          <span className="muted">{t('按每周到期任务统计，跳过不计')}</span>
        </div>
        <TrendBars points={trend} />
      </div>

      <div className="stats-panel card">
        <div className="stats-panel-head">
          <h3>{t('按任务类型分布')}</h3>
          <span className="muted">{t('全部任务（含已完成/跳过）')}</span>
        </div>
        {kinds.length === 0 ? <p className="stats-empty muted">{t('还没有任务')}</p> : <KindBars kinds={kinds} />}
      </div>

      <div className="stats-panel card">
        <div className="stats-panel-head">
          <h3>{t('每日专注趋势')}</h3>
          <span className="muted">{t('最近 7 天，切走/锁屏 30 秒内回来继续计时')}</span>
        </div>
        <FocusBars days={focusDays} />
        <p className="metric-hint muted">
          {focus.sessions === 0
            ? t('进入日程页的「专注模式」开始计时')
            : t('共 {n} 次 · 今天 {m} 分钟', { n: focus.sessions, m: Math.round(focus.todayMs / 60_000) })}
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
                    <div className="bucket-fill" style={{ width: `${(count / stats.overdue) * 100}%` }} />
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

      <details className="stats-panel card methodology">
        <summary>{t('统计口径说明')}</summary>
        <ul>
          <li>{t('本周完成率：分母是按开始/截止时间落在本周的任务，分子是其中已完成；跳过的任务不计入。')}</li>
          <li>{t('延期完成率：只看有实际完成时间（doneAt）的已完成任务，完成时间晚于截止/开始时间算延期。')}</li>
          <li>{t('8 周趋势：以周一为一周起点，按任务开始/截止时间归属，跳过不计。')}</li>
          <li>{t('专注时长：只记本机完成的专注段，最近 7 个自然日；单段不足 1 分钟或超过 4 小时不记。')}</li>
          <li>{t('所有数据只在本机计算，不上传。')}</li>
        </ul>
      </details>
    </section>
  )
}
