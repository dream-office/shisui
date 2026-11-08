import { useMemo, useState } from 'react'
import { buildMonthGrid, spanDays, startOfDay } from 'shisui-core'
import type { StoredTask } from 'shisui-core'
import { useApp } from '@/state/store'
import { useNow } from './useNow'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function dayStartOf(ms: number): number {
  return startOfDay(new Date(ms)).getTime()
}

function taskDay(task: StoredTask): number | null {
  const at = task.startAt ?? task.dueAt
  return at === null ? null : dayStartOf(at)
}

function formatTime(task: StoredTask): string {
  const at = task.startAt ?? task.dueAt
  if (at === null) return '无时间'
  const date = new Date(at)
  const allDay = date.getHours() === 0 && date.getMinutes() === 0
  return allDay ? '全天' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * 月视图：固定 42 格（6 周）；点某天在下方列出当天任务；把任务拖到另一天 → 只改日期、保留时刻。
 * 拖拽用 HTML5 dnd（draggable + dataTransfer），不引第三方库。
 */
export default function MonthView() {
  const tasks = useApp((s) => s.tasks)
  const moveTaskToDay = useApp((s) => s.moveTaskToDay)
  const nowMs = useNow(60_000)
  const now = useMemo(() => new Date(nowMs), [nowMs])

  const today = dayStartOf(nowMs)
  const [anchor, setAnchor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const [dragging, setDragging] = useState<string | null>(null)

  const byDay = useMemo(() => {
    const map = new Map<number, StoredTask[]>()
    for (const task of tasks) {
      const day = taskDay(task)
      if (day === null) continue
      // 跨天区间：在覆盖的每一天都出现（首日到末日，按本地日期推进）
      const days = spanDays(task)
      for (let i = 0; i < days; i += 1) {
        const cell = new Date(day)
        cell.setDate(cell.getDate() + i)
        const key = cell.getTime()
        const list = map.get(key) ?? []
        list.push(task)
        map.set(key, list)
      }
    }
    return map
  }, [tasks])

  const cells = useMemo(() => buildMonthGrid(anchor), [anchor])
  const selectedTasks = byDay.get(selected) ?? []
  const monthLabel = `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`

  const shiftMonth = (delta: number) => {
    setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  const goToday = () => {
    setAnchor(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelected(today)
  }

  const onDrop = async (event: React.DragEvent, day: number) => {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || dragging
    setDragging(null)
    if (!id) return
    await moveTaskToDay(id, day)
    setSelected(day)
  }

  return (
    <div className="month-view">
      <div className="month-toolbar">
        <button type="button" className="btn btn-sm" onClick={() => shiftMonth(-1)} aria-label="上个月">
          ← 上月
        </button>
        <h2 className="month-title">{monthLabel}</h2>
        <button type="button" className="btn btn-sm" onClick={goToday}>
          今天
        </button>
        <button type="button" className="btn btn-sm" onClick={() => shiftMonth(1)} aria-label="下个月">
          下月 →
        </button>
      </div>

      <div className="month-grid" role="grid" aria-label="月历">
        {WEEKDAYS.map((label) => (
          <div key={label} className="month-weekday" role="columnheader">
            {label}
          </div>
        ))}
        {cells.map((day) => {
          const date = new Date(day)
          const dayTasks = byDay.get(day) ?? []
          const inMonth = date.getMonth() === anchor.getMonth()
          const classes = ['month-cell']
          if (!inMonth) classes.push('is-outside')
          if (day === today) classes.push('is-today')
          if (day === selected) classes.push('is-selected')
          return (
            <button
              key={day}
              type="button"
              className={classes.join(' ')}
              data-day={day}
              role="gridcell"
              aria-label={`${date.getMonth() + 1} 月 ${date.getDate()} 日，${dayTasks.length} 件事`}
              onClick={() => setSelected(day)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => void onDrop(event, day)}
            >
              <span className="month-daynum">{date.getDate()}</span>
              {dayTasks.length > 0 && (
                <span className="month-dots">
                  {dayTasks.slice(0, 3).map((task) => (
                    <span key={task.id} className={`month-dot ${task.done ? 'is-done' : ''}`} />
                  ))}
                  {dayTasks.length > 3 && <span className="month-count">+{dayTasks.length - 3}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <section className="month-day card">
        <h3>
          <span className="month-day-title">
            {`${new Date(selected).getMonth() + 1} 月 ${new Date(selected).getDate()} 日 · ${
              ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date(selected).getDay()]
            }`}
          </span>
          <span className="month-day-count">{selectedTasks.length} 件</span>
        </h3>
        {selectedTasks.length === 0 ? (
          <p className="muted month-day-empty">这天没有事。把其他日子的任务拖到这一格就能挪过来。</p>
        ) : (
          <ul className="day-list">
            {selectedTasks.map((task) => (
              <li
                key={task.id}
                className={`day-task ${task.done ? 'is-done' : ''}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', task.id)
                  event.dataTransfer.effectAllowed = 'move'
                  setDragging(task.id)
                }}
                onDragEnd={() => setDragging(null)}
              >
                <span className="day-time">{formatTime(task)}</span>
                <span className="day-title">{task.title}</span>
                {spanDays(task) > 1 && <span className="day-span">跨天</span>}
                {task.location && <span className="muted">{task.location}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="muted month-hint">拖动任务到别的日期可改期；时刻保持不变，全天任务仍是整天。</p>
      </section>
    </div>
  )
}
