import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

/**
 * 错误边界：解析或渲染抛异常时兜住，不白屏。
 * 数据在 IndexedDB 里，重试或回首页都不会丢；错误信息保留在页面上，方便用户描述问题。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('界面异常：', error, info.componentStack)
  }

  private retry = () => {
    this.setState({ hasError: false, message: '' })
  }

  private goHome = () => {
    window.location.hash = ''
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <section className="error-boundary card" role="alert">
        <h3>界面出了点问题，但你的数据还在</h3>
        <p className="muted">
          待办都存在浏览器本地（IndexedDB），不会因为这次异常丢失。可以先重试；如果反复出现，回首页后手动导出备份。
        </p>
        <pre className="error-detail">{this.state.message || '未知错误'}</pre>
        <div className="error-actions">
          <button type="button" className="btn btn-primary" onClick={this.retry}>
            重试
          </button>
          <button type="button" className="btn btn-ghost" onClick={this.goHome}>
            回首页
          </button>
        </div>
      </section>
    )
  }
}
