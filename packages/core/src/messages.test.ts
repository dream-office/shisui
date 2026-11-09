
import { describe, expect, it } from 'vitest'
import { parseNotice } from './ruleParser.js'
import { scanConflicts } from './conflict.js'
import { importIcs } from './icsImport.js'
import { parseNoticeBatch } from './batch.js'
import { createManualTask, ManualTaskError } from './manual.js'
import { buildBackup, validateBackup } from './backup.js'
import type { ParsedTask } from './types.js'
import { timeNoteCode } from './messages.js'
import { SAMPLE_WORK } from './samples.js'

function task(title: string, at: number, extra = {}) {
  return {
    id: title,
    title,
    dueAt: at,
    startAt: null,
    kind: 'task' as const,
    ...extra,
  }
}

describe('v1.4 core 消息 code 双轨', () => {
  it('reasons 与 reasonCodes 对齐，且含 kind code', () => {
    const result = parseNotice(SAMPLE_WORK, new Date(2026, 10, 8, 10, 0, 0))
    expect(result.tasks.length).toBeGreaterThan(0)
    for (const parsed of result.tasks) {
      expect(parsed.reasonCodes, parsed.title).toBeDefined()
      expect(parsed.reasonCodes!.length, parsed.title).toBe(parsed.reasons.length)
    }
    expect(result.tasks[0].reasonCodes!.some((m) => m.code === 'reason.kindHit')).toBe(true)
  })

  it('二选一标签带 choiceCode', () => {
    const result = parseNotice('本周日 23:59 前交实验报告', new Date(2026, 10, 8, 10, 0, 0))
    const labels = result.tasks.map((t) => t.choiceCode)
    expect(labels).toContain('choice.thisWeek')
    expect(labels).toContain('choice.nextWeek')
  })

  it('时间假设 note 映射为 code', () => {
    expect(timeNoteCode('「月底」按本月最后一天理解')?.code).toBe('time.monthEnd')
    expect(timeNoteCode('「3 个工作日」会跳过周末计算')?.params?.count).toBe('3')
    expect(timeNoteCode('随便一句') ).toBeUndefined()
  })

  it('冲突四类都有 titleCode/detailCode', () => {
    const now = new Date(2026, 10, 8, 10, 0, 0)
    const notes = scanConflicts(
      [
        task('A', now.getTime() - 60_000),
        task('B', now.getTime() + 30 * 60_000),
        task('C', now.getTime() + 60 * 60_000),
        task('D', now.getTime() + 90 * 60_000),
        task('E', now.getTime() + 2 * 60 * 60_000),
      ],
      now,
    )
    expect(notes.length).toBeGreaterThan(0)
    for (const note of notes) {
      expect(note.titleCode, note.id).toBeDefined()
      expect(note.detailCode, note.id).toBeDefined()
    }
    expect(notes.some((n) => n.titleCode!.code === 'conflict.overdue.title')).toBe(true)
  })

  it('ICS 坏文件与 warning 带 code', () => {
    const bad = importIcs('not a calendar')
    expect(bad.warningCodes?.[0].code).toBe('ics.notCalendar')
    const broken = importIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:X\nEND:VCALENDAR')
    expect(broken.warningCodes?.[0].code).toBe('ics.incomplete')
  })

  it('batch 空文本 / 重复有 warningCodes', () => {
    const empty = parseNoticeBatch('', new Date(2026, 10, 8, 10, 0, 0))
    expect(empty.warningCodes?.some((m) => m.code === 'warning.noSections')).toBe(true)
  })

  it('手动添加错误/原因有 code', () => {
    expect(() => createManualTask({ title: '  ' }, 'id')).toThrow(ManualTaskError)
    try {
      createManualTask({ title: '  ' }, 'id')
    } catch (error) {
      expect((error as ManualTaskError).code).toBe('manual.emptyTitle')
    }
    const created = createManualTask({ title: '交报告', dueAt: Date.now() }, 'id')
    expect(created.reasonCodes?.[0].code).toBe('reason.manual')
  })

  it('备份错误有 errorCodes，旧备份仍可读', () => {
    expect(validateBackup('not json').errorCodes?.[0].code).toBe('backup.badJson')
    const built = JSON.parse(
      JSON.stringify(
        buildBackup({
          appVersion: '1.4.0',
          tasks: [{ id: 't1', title: '旧任务', dueAt: null, startAt: null, createdAt: Date.now(), reasons: ['旧原因'] } as unknown as ParsedTask],
          series: [],
          batches: [],
        }),
      ),
    ) as Record<string, unknown>
    delete (built.tasks as Array<Record<string, unknown>>)[0].reasonCodes
    const legacy = validateBackup(JSON.stringify(built))
    expect(legacy.ok).toBe(true)
    expect(legacy.backup!.tasks[0].reasonCodes).toBeUndefined()
  })

  it('新备份透传 reasonCodes', () => {
    const raw = JSON.stringify(
      buildBackup({
        appVersion: '1.4.0',
        tasks: [
          {
            id: 't1',
            title: '任务',
            dueAt: null,
            startAt: null,
            createdAt: Date.now(),
            reasons: ['原因'],
            reasonCodes: [{ code: 'reason.manual' }],
          } as unknown as ParsedTask,
        ],
        series: [],
        batches: [],
      }),
    )
    const result = validateBackup(raw)
    expect(result.ok).toBe(true)
    expect(result.backup!.tasks[0].reasonCodes?.[0].code).toBe('reason.manual')
  })
})
