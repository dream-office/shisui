
import { describe, expect, it } from 'vitest'
import { buildMessages, parseLLMResponse } from './llm'

const REF = new Date(2026, 10, 4, 22, 7)

describe('v1.1.3 LLM 后处理', () => {
  it('标题去章节号；空标题/章节名标题丢弃', () => {
    const tasks = parseLLMResponse({
      tasks: [
        { title: '三、请完成军事理论课学习与考试', kind: 'exam', dueAt: '2026-12-30T23:59:00+08:00' },
        { title: '学习（考试）平台', kind: 'other', dueAt: '2026-12-30T23:59:00+08:00' },
        { title: '', kind: 'task', dueAt: '2026-12-30T23:59:00+08:00' },
      ],
    })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('请完成军事理论课学习与考试')
  })

  it('URL 不进 channel / location', () => {
    const [task] = parseLLMResponse({
      tasks: [
        {
          title: '完成学习',
          kind: 'task',
          dueAt: '2026-12-30T23:59:00+08:00',
          channel: 'https://mooc.example.com/course',
          location: 'https://mooc.example.com/course',
        },
      ],
    })
    expect(task.channel).toBeNull()
    expect(task.location).toBeNull()
  })

  it('AI 自己重复的行合并', () => {
    const tasks = parseLLMResponse({
      tasks: [
        { title: '完成军事理论课学习与考试', kind: 'exam', dueAt: '2026-12-30T23:59:00+08:00' },
        { title: '完成军事理论课学习与考试。', kind: 'exam', dueAt: '2026-12-30T23:59:00+08:00' },
      ],
    })
    expect(tasks).toHaveLength(1)
  })

  it('url/note：只收 http(s) 链接，note 原样保留', () => {
    const [task] = parseLLMResponse({
      tasks: [
        {
          title: 'WPS 挑战赛',
          kind: 'exam',
          dueAt: '2026-11-08T22:00:00+08:00',
          url: 'https://f.kdocs.cn/g/BcUkkscR/',
          note: '温馨提示',
        },
      ],
    })
    expect(task.url).toBe('https://f.kdocs.cn/g/BcUkkscR/')
    expect(task.note).toBe('温馨提示')
    expect(parseLLMResponse({ tasks: [{ title: 'x', dueAt: '2026-11-08T22:00:00+08:00', url: 'javascript:alert(1)' }] })[0].url).toBeNull()
  })

  it('prompt 含 3 个 few-shot、URL 不是 channel、单通知通常 1 条', () => {
    const system = buildMessages('通知', REF)[0].content
    expect(system).toContain('例1')
    expect(system).toContain('例2')
    expect(system).toContain('例3')
    expect(system).toContain('例4')
    expect(system).toContain('URL / 网址不是 channel')
    expect(system).toContain('一条通知可能有多件事')
  })
})
