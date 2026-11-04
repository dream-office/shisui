import { useState } from 'react'
import { useApp } from '@/state/store'
import { SAMPLE_NOTICE, SAMPLE_NOTICE_2 } from '@/core/samples'
import CandidateCard from './CandidateCard'
import { useNow } from './useNow'

export default function InboxView() {
  const [raw, setRaw] = useState('')
  const candidates = useApp((s) => s.candidates)
  const parsing = useApp((s) => s.parsing)
  const stage = useApp((s) => s.stage)
  const engineNote = useApp((s) => s.engineNote)
  const warnings = useApp((s) => s.warnings)
  const parse = useApp((s) => s.parse)
  const acceptCandidates = useApp((s) => s.acceptCandidates)
  const dismissCandidate = useApp((s) => s.dismissCandidate)
  const updateCandidate = useApp((s) => s.updateCandidate)
  const now = useNow(15_000)
  const [accepted, setAccepted] = useState(0)

  const handleParse = async () => {
    setAccepted(0)
    await parse(raw)
  }

  const acceptAll = async () => {
    const ids = candidates.map((task) => task.id)
    await acceptCandidates(ids)
    setAccepted((n) => n + ids.length)
  }

  return (
    <div className="inbox">
      <section className="hero">
        <h2>
          把通知<em>粘进来</em>，剩下的交给课代表
        </h2>
        <p>
          「本周五23:59前在学习通交实验报告」「下周三下午2点教学楼A301开会」—— 这些不用你手动记，
          解析完还能告诉你<strong>哪两件事会撞车</strong>。
        </p>
      </section>

      <section className="composer card">
        <div className="composer-head">
          <label htmlFor="notice">群消息原文</label>
          <span className="muted">{raw.length} 字</span>
        </div>
        <textarea
          id="notice"
          className="composer-input"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder={'例如：\n【教务处】各位同学请注意：\n1. 本周五23:59前在学习通提交《数据结构》实验报告三。\n2. 下周三下午2点在 教学楼A301 开班会。'}
          rows={7}
          spellCheck={false}
        />
        <div className="composer-actions">
          <button type="button" className="btn btn-primary" onClick={handleParse} disabled={parsing || !raw.trim()}>
            {parsing ? '解析中…' : '开始解析'}
          </button>
          <button type="button" className="btn" onClick={() => setRaw(SAMPLE_NOTICE)} disabled={parsing}>
            填入示例一
          </button>
          <button type="button" className="btn" onClick={() => setRaw(SAMPLE_NOTICE_2)} disabled={parsing}>
            示例二
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRaw('')} disabled={parsing || !raw}>
            清空
          </button>
        </div>

        {parsing && (
          <div className="stage">
            <span className="spinner" aria-hidden />
            <span>{stage || '正在解析…'}</span>
          </div>
        )}
      </section>

      {engineNote && (
        <div className="engine-note">
          <span className="engine-note-label">解析引擎</span>
          <span>{engineNote}</span>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <section className="results">
          <div className="results-head">
            <h3>
              识别到 <em>{candidates.length}</em> 条待办
            </h3>
            <div className="results-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={acceptAll}>
                全部收录
              </button>
            </div>
          </div>

          <div className="cards">
            {candidates.map((task) => (
              <CandidateCard
                key={task.id}
                task={task}
                now={now}
                onUpdate={(patch) => updateCandidate(task.id, patch)}
                onAccept={async () => {
                  await acceptCandidates([task.id])
                  setAccepted((n) => n + 1)
                }}
                onDismiss={() => dismissCandidate(task.id)}
              />
            ))}
          </div>
        </section>
      )}

      {accepted > 0 && (
        <div className="toast">
          已收录 {accepted} 条，去「日程」看看有没有撞车
        </div>
      )}

      {candidates.length === 0 && !parsing && (
        <section className="capabilities card">
          <h3>它能认出什么</h3>
          <div className="cap-grid">
            <div>
              <h4>时间</h4>
              <p>本周五23:59 / 下周三 / 明晚8点 / 中午12点前 / 3天内 / 11月18日 / 周五下午2点</p>
            </div>
            <div>
              <h4>事项</h4>
              <p>作业与实验报告、考试与答辩、班会与讲座、报名选课、缴费报销、问卷打卡</p>
            </div>
            <div>
              <h4>提交渠道</h4>
              <p>学习通、雨课堂、智慧树、教务系统、邮箱、腾讯会议、钉钉、纸质线下</p>
            </div>
            <div>
              <h4>不止于此</h4>
              <p>收录后会自动体检：已经过期、两件撞车、同一天堆三件，都会直接标出来</p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
