import { t } from '@/i18n'
import { useMemo, useState } from 'react'
import EmptyState from './EmptyState'
import { startOfDay } from 'shisui-core'
import { filterTasks, parseRRule, scanConflicts, weeklyLoad } from 'shisui-core'
import { describeRule } from 'shisui-core'
import { describeRuleI18n, formatWeekdayI18n, getLang, undoLabelI18n } from '@/i18n'
import { tasksToIcs } from 'shisui-core'
import type { StoredTask } from 'shisui-core'
import { useApp } from '@/state/store'
import { downloadTextFile } from '@/services/download'
import FocusView from './FocusView'
import TaskRow, { dayHeading } from './TaskRow'
import { useNow } from './useNow'

export default function PlanView() {
  const tasks = useApp((s) => s.tasks)
  const setView = useApp((s) => s.setView)
  const toggleDone = useApp((s) => s.toggleDone)
  const dropTask = useApp((s) => s.dropTask)
  const series = useApp((s) => s.series)
  const skipTask = useApp((s) => s.skipTask)
  const endSeries = useApp((s) => s.endSeries)
  const searchQuery = useApp((s) => s.searchQuery)
  const setSearchQuery = useApp((s) => s.setSearchQuery)
  const selectedIds = useApp((s) => s.selectedIds)
  const toggleSelection = useApp((s) => s.toggleSelection)
  const clearSelection = useApp((s) => s.clearSelection)
  const selectAll = useApp((s) => s.selectAll)
  const batchSetDone = useApp((s) => s.batchSetDone)
  const batchDelete = useApp((s) => s.batchDelete)
  const undo = useApp((s) => s.undo)
  const undoLastBatch = useApp((s) => s.undoLastBatch)
  const setTags = useApp((s) => s.setTags)
  const focusMode = useApp((s) => s.focusMode)
  const openFocus = useApp((s) => s.openFocus)
  const [batchMode, setBatchMode] = useState(false)
  const editTaskFields = useApp((s) => s.editTaskFields)
  const editSeriesFields = useApp((s) => s.editSeriesFields)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const now = useNow(30_000)
  const ref = useMemo(() => new Date(now), [now])

  const active = useMemo(() => tasks.filter((task) => !task.done), [tasks])
  const done = useMemo(() => tasks.filter((task) => task.done), [tasks])
  const visibleActive = useMemo(
    () => filterTasks(active, searchQuery).filter((task) => !onlyOpen || !task.skipped),
    [active, searchQuery, onlyOpen],
  )
  const visibleDone = useMemo(() => (onlyOpen ? [] : filterTasks(done, searchQuery)), [done, searchQuery, onlyOpen])

  const seriesById = useMemo(() => new Map(series.map((item) => [item.id, item])), [series])
  const seriesAffectedCountOf = (task: StoredTask): number => {
    if (!task.seriesId) return 0
    return tasks.filter(
      (item) =>
        item.seriesId === task.seriesId &&
        (item.recurrenceIndex ?? 0) >= (task.recurrenceIndex ?? 0) &&
        !item.done &&
        !item.skipped,
    ).length
  }

  const seriesLabelOf = (task: StoredTask): string | null => {
    if (!task.seriesId) return null
    const item = seriesById.get(task.seriesId)
    if (!item) return t('重复')
    const rule = parseRRule(item.rrule)
    if (!rule) return item.rrule
    return getLang() === 'en' ? describeRuleI18n(item.rrule) : describeRule(rule)
  }

  const conflicts = useMemo(() => scanConflicts(visibleActive, ref), [visibleActive, ref])
  const load = useMemo(() => weeklyLoad(visibleActive, ref), [visibleActive, ref])

  const groups = useMemo(() => {
    const buckets = new Map<number, StoredTask[]>()
    for (const task of visibleActive) {
      const at = task.dueAt ?? task.startAt
      if (at === null) continue
      const key = startOfDay(new Date(at)).getTime()
      const list = buckets.get(key) ?? []
      list.push(task)
      buckets.set(key, list)
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, list]) => ({
        day,
        list: list.sort((a, b) => (a.dueAt ?? a.startAt ?? 0) - (b.dueAt ?? b.startAt ?? 0)),
      }))
  }, [visibleActive])

  const noTime = visibleActive.filter((task) => task.dueAt === null && task.startAt === null)
  const maxLoad = Math.max(1, ...load)
  const today = startOfDay(ref).getTime()

  const exportIcs = () => {
    if (tasks.length === 0) return
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTextFile(
      tasksToIcs(tasks, {
        calendarName: t('拾穗日程'),
        series: series.map((item) => ({
          id: item.id,
          rrule: item.rrule,
          startAt: item.startAt,
          endAt: item.endAt ?? null,
          allDay: item.allDay ?? false,
          title: item.title,
          channel: item.channel,
          location: item.location,
          until: item.until ?? null,
          endedAt: item.endedAt ?? null,
        })),
      }),
      `shisui-${stamp}.ics`,
      'text/calendar;charset=utf-8',
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="empty card">
        <EmptyState
          title={t('日程还是空的')}
          body={t('去「收件」贴一段群通知，解析完收录进来，这里就会自动排好并做冲突体检。')}
          action={{ label: t('去贴通知'), onClick: () => setView('inbox') }}
        />
      </div>
    )
  }

  return (
    <div className="plan">
      <div className="plan-toolbar">
        <input
          className="search-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('搜索标题 / 原文 / 地点 / #标签')}
          aria-label={t('搜索任务')}
        />
        <button type="button" className="btn btn-sm" onClick={exportIcs}>
          {t('导出 .ics')}
        </button>
        <button type="button" className={`btn btn-sm ${focusMode ? 'btn-primary' : ''}`} onClick={openFocus}>
          {t('专注模式')}
        </button>
        <label className="muted inline-check">
          <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
          {t('只看未完成')}
        </label>
        <button
          type="button"
          className={`btn btn-sm ${batchMode ? 'btn-primary' : ''}`}
          onClick={() => {
            setBatchMode((value) => !value)
            clearSelection()
          }}
        >
          {batchMode ? t('退出多选') : t('多选')}
        </button>
        {undo && (
          <button type="button" className="btn btn-sm" onClick={() => void undoLastBatch()}>
            {t('撤销「{v}」', { v: undoLabelI18n(undo.label) })}
          </button>
        )}
        <span className="muted">{t('导出后可在系统日历 / Google Calendar 里导入或订阅')}</span>
      </div>

      {focusMode && <FocusView />}

      {batchMode && (
        <div className="batch-bar card">
          <span>{t('已选 {n} 件', { n: selectedIds.length })}</span>
          <button type="button" className="btn btn-sm" onClick={() => selectAll(visibleActive.map((task) => task.id))}>
            {t('全选当前')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={selectedIds.length === 0}
            onClick={() => void batchSetDone(selectedIds, true)}
          >
            {t('批量完成')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={selectedIds.length === 0}
            onClick={() => void batchSetDone(selectedIds, false)}
          >
            {t('取消完成')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={selectedIds.length === 0}
            onClick={() => void batchDelete(selectedIds)}
          >
            {t('批量删除')}
          </button>
        </div>
      )}

      <section className="stats">
        <div className="stat card">
          <span className="stat-label">{t('待办')}</span>
          <strong className="stat-value">{active.length}</strong>
          <span className="stat-hint">{t('件没做完')}</span>
        </div>
        <div className="stat card">
          <span className="stat-label">{t('冲突/风险')}</span>
          <strong className={`stat-value ${conflicts.length > 0 ? 'is-warn' : ''}`}>{conflicts.length}</strong>
          <span className="stat-hint">{t('处需要留意')}</span>
        </div>
        <div className="stat card span-2">
          <span className="stat-label">{t('未来 7 天压力')}</span>
          <div className="load-bars">
            {load.map((value, index) => {
              const dayMs = today + index * 86_400_000
              const d = new Date(dayMs)
              const week = formatWeekdayI18n(d.getTime())
              return (
                <div className="load-col" key={dayMs} title={t('{n} 件', { n: value })}>
                  <div className="load-track">
                    <div className={`load-fill ${index === 0 ? 'is-today' : ''}`} style={{ height: `${(value / maxLoad) * 100}%` }} />
                  </div>
                  <span className="load-day">{index === 0 ? t('今') : week}</span>
                  <span className="load-count">{value || ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {conflicts.length > 0 && (
        <section className="conflicts">
          <h3>{t('冲突体检')}</h3>
          <ul>
            {conflicts.map((note) => (
              <li key={note.id} className={`conflict level-${note.level}`}>
                <strong>{note.title}</strong>
                <p>{note.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map(({ day, list }) => (
        <section className="day-group" key={day}>
          <h3 className={`day-heading ${day === today ? 'is-today' : ''}`}>
            {dayHeading(day, now)}
            <span className="day-count">{list.length}</span>
          </h3>
          <ul className="task-list">
            {list.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                onToggle={() => void toggleDone(task.id)}
                onDelete={() => void dropTask(task.id)}
                seriesLabel={seriesLabelOf(task)}
                onSkip={() => void skipTask(task.id)}
                onEndSeries={task.seriesId ? () => void endSeries(task.id) : undefined}
                selectionMode={batchMode}
                selected={selectedIds.includes(task.id)}
                onSelect={() => toggleSelection(task.id)}
                onTagsChange={(tags) => void setTags(task.id, tags)}
                onEditOnce={(fields) => void editTaskFields(task.id, fields)}
                onEditSeries={(fields) => void editSeriesFields(task.id, fields)}
                seriesAffectedCount={seriesAffectedCountOf(task)}
              />
            ))}
          </ul>
        </section>
      ))}

      {noTime.length > 0 && (
        <section className="day-group">
          <h3 className="day-heading is-warn">{t('没有明确时间 · 建议手动补一个')}</h3>
          <ul className="task-list">
            {noTime.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                onToggle={() => void toggleDone(task.id)}
                onDelete={() => void dropTask(task.id)}
                seriesLabel={seriesLabelOf(task)}
                onSkip={() => void skipTask(task.id)}
                onEndSeries={task.seriesId ? () => void endSeries(task.id) : undefined}
                selectionMode={batchMode}
                selected={selectedIds.includes(task.id)}
                onSelect={() => toggleSelection(task.id)}
                onTagsChange={(tags) => void setTags(task.id, tags)}
                onEditOnce={(fields) => void editTaskFields(task.id, fields)}
                onEditSeries={(fields) => void editSeriesFields(task.id, fields)}
                seriesAffectedCount={seriesAffectedCountOf(task)}
              />
            ))}
          </ul>
        </section>
      )}

      {visibleDone.length > 0 && (
        <details className="done-block">
          <summary>{t('已完成 {n} 件', { n: visibleDone.length })}</summary>
          <ul className="task-list">
            {visibleDone.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                onToggle={() => void toggleDone(task.id)}
                onDelete={() => void dropTask(task.id)}
                seriesLabel={seriesLabelOf(task)}
                onSkip={() => void skipTask(task.id)}
                onEndSeries={task.seriesId ? () => void endSeries(task.id) : undefined}
                selectionMode={batchMode}
                selected={selectedIds.includes(task.id)}
                onSelect={() => toggleSelection(task.id)}
                onTagsChange={(tags) => void setTags(task.id, tags)}
                onEditOnce={(fields) => void editTaskFields(task.id, fields)}
                onEditSeries={(fields) => void editSeriesFields(task.id, fields)}
                seriesAffectedCount={seriesAffectedCountOf(task)}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
