import { useMemo } from 'react'
import { startOfDay } from 'shisui-core'
import { scanConflicts, weeklyLoad } from 'shisui-core'
import { tasksToIcs } from 'shisui-core'
import type { StoredTask } from 'shisui-core'
import { useApp } from '@/state/store'
import { downloadTextFile } from '@/services/download'
import TaskRow, { dayHeading } from './TaskRow'
import { useNow } from './useNow'

export default function PlanView() {
  const tasks = useApp((s) => s.tasks)
  const setView = useApp((s) => s.setView)
  const toggleDone = useApp((s) => s.toggleDone)
  const dropTask = useApp((s) => s.dropTask)
  const now = useNow(30_000)
  const ref = useMemo(() => new Date(now), [now])

  const active = useMemo(() => tasks.filter((task) => !task.done), [tasks])
  const done = useMemo(() => tasks.filter((task) => task.done), [tasks])

  const conflicts = useMemo(() => scanConflicts(active, ref), [active, ref])
  const load = useMemo(() => weeklyLoad(active, ref), [active, ref])

  const groups = useMemo(() => {
    const buckets = new Map<number, StoredTask[]>()
    for (const task of active) {
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
  }, [active])

  const noTime = active.filter((task) => task.dueAt === null && task.startAt === null)
  const maxLoad = Math.max(1, ...load)
  const today = startOfDay(ref).getTime()

  const exportIcs = () => {
    if (tasks.length === 0) return
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTextFile(tasksToIcs(tasks, { calendarName: '拾穗日程' }), `shisui-${stamp}.ics`, 'text/calendar;charset=utf-8')
  }

  if (tasks.length === 0) {
    return (
      <div className="empty card">
        <h3>日程还是空的</h3>
        <p>去「收件」贴一段群通知，解析完收录进来，这里就会自动排好并做冲突体检。</p>
        <button type="button" className="btn btn-primary" onClick={() => setView('inbox')}>
          去贴通知
        </button>
      </div>
    )
  }

  return (
    <div className="plan">
      <div className="plan-toolbar">
        <button type="button" className="btn btn-sm" onClick={exportIcs}>
          导出 .ics
        </button>
        <span className="muted">导出后可在系统日历 / Google Calendar 里导入或订阅</span>
      </div>

      <section className="stats">
        <div className="stat card">
          <span className="stat-label">待办</span>
          <strong className="stat-value">{active.length}</strong>
          <span className="stat-hint">件没做完</span>
        </div>
        <div className="stat card">
          <span className="stat-label">冲突/风险</span>
          <strong className={`stat-value ${conflicts.length > 0 ? 'is-warn' : ''}`}>{conflicts.length}</strong>
          <span className="stat-hint">处需要留意</span>
        </div>
        <div className="stat card span-2">
          <span className="stat-label">未来 7 天压力</span>
          <div className="load-bars">
            {load.map((value, index) => {
              const dayMs = today + index * 86_400_000
              const d = new Date(dayMs)
              const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
              return (
                <div className="load-col" key={dayMs} title={`${value} 件`}>
                  <div className="load-track">
                    <div className={`load-fill ${index === 0 ? 'is-today' : ''}`} style={{ height: `${(value / maxLoad) * 100}%` }} />
                  </div>
                  <span className="load-day">{index === 0 ? '今' : week}</span>
                  <span className="load-count">{value || ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {conflicts.length > 0 && (
        <section className="conflicts">
          <h3>冲突体检</h3>
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
              />
            ))}
          </ul>
        </section>
      ))}

      {noTime.length > 0 && (
        <section className="day-group">
          <h3 className="day-heading is-warn">没有明确时间 · 建议手动补一个</h3>
          <ul className="task-list">
            {noTime.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                onToggle={() => void toggleDone(task.id)}
                onDelete={() => void dropTask(task.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <details className="done-block">
          <summary>已完成 {done.length} 件</summary>
          <ul className="task-list">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                onToggle={() => void toggleDone(task.id)}
                onDelete={() => void dropTask(task.id)}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
