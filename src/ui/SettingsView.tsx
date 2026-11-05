import { useState } from 'react'
import { useApp } from '@/state/store'
import { DEFAULT_LLM_CONFIG, isLLMReady, type LLMConfig } from '@/services/llm'
import { exportSnapshot, importSnapshot, type Snapshot } from '@/data/repo'

export default function SettingsView() {
  const llmConfig = useApp((s) => s.llmConfig)
  const saveLLM = useApp((s) => s.saveLLM)
  const clearAll = useApp((s) => s.clearAll)
  const hydrate = useApp((s) => s.hydrate)
  const [draft, setDraft] = useState<LLMConfig>(llmConfig)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    saveLLM(draft)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  const handleExport = async () => {
    const snapshot = await exportSnapshot()
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `shisui-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (file: File) => {
    const text = await file.text()
    await importSnapshot(JSON.parse(text) as Snapshot)
    await hydrate()
  }

  return (
    <div className="settings">
      <section className="card">
        <h3>AI 增强引擎（可选）</h3>
        <p className="muted">
          填任意 OpenAI 兼容接口即可启用双引擎。不填也能用：规则引擎离线完成全部解析，只是对特别绕的写法容错更低。
          Key 只保存在你自己的 localStorage，请求直接发给你填的服务商。
        </p>

        <label className="field block">
          <span>接口地址</span>
          <input
            value={draft.endpoint}
            onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })}
            placeholder={DEFAULT_LLM_CONFIG.endpoint}
            spellCheck={false}
          />
        </label>

        <label className="field block">
          <span>模型</span>
          <input
            value={draft.model}
            onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            placeholder={DEFAULT_LLM_CONFIG.model}
            spellCheck={false}
          />
        </label>

        <label className="field block">
          <span>API Key</span>
          <input
            type="password"
            value={draft.apiKey}
            onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
            placeholder="sk-..."
            spellCheck={false}
          />
        </label>

        <div className="settings-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            保存配置
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setDraft({ ...DEFAULT_LLM_CONFIG })
              saveLLM({ ...DEFAULT_LLM_CONFIG })
            }}
          >
            关掉 AI，只用规则引擎
          </button>
          <span className={`status ${isLLMReady(draft) ? 'is-on' : ''}`}>
            {isLLMReady(draft) ? '双引擎已启用' : '当前仅规则引擎'}
          </span>
          {saved && <span className="status is-on">已保存</span>}
        </div>
      </section>

      <section className="card">
        <h3>数据</h3>
        <p className="muted">所有数据都在本机浏览器。导出成 JSON 等于一份完整备份，换浏览器或换设备时导入即可恢复。</p>
        <div className="settings-actions">
          <button type="button" className="btn" onClick={handleExport}>
            导出备份 JSON
          </button>
          <label className="btn btn-ghost file-btn">
            导入备份
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleImport(file)
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm('会清空所有待办与导入记录，确定吗？')) void clearAll()
            }}
          >
            清空全部数据
          </button>
        </div>
      </section>

      <section className="card about">
        <h3>关于拾穗</h3>
        <ul>
          <li>
            <strong>纯前端、本地优先</strong>：没有后端，没有账号。学号、客户名、手机号、合同金额不会离开你的浏览器。
          </li>
          <li>
            <strong>不预设场景</strong>：公司群、项目群、班级群、家长群，同一套解析规则——按内容判断，不按场景套模板。
          </li>
          <li>
            <strong>双引擎</strong>：规则引擎负责可解释、可离线；AI 引擎负责覆盖刁钻写法。两条路都能出结果，谁更可信取谁。
          </li>
          <li>
            <strong>可复现</strong>：时间解析是注入 ref 的纯函数，全部单测确定性通过，换机器换时区结果一致。
          </li>
        </ul>
      </section>
    </div>
  )
}
