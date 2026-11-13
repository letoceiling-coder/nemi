import { Component, ReactNode } from 'react'

/** A crash inside one section shows a message instead of a black window; the rest of the app keeps working. */
export class ErrorBoundary extends Component<{ children: ReactNode; onHome: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('section crashed', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-md text-center">
          <div className="mb-2 text-[16px] font-semibold">В этом разделе произошла ошибка</div>
          <div className="mb-4 text-[13px] text-fg3">Остальные разделы работают. Если ошибка повторяется, пришлите этот текст разработчику:</div>
          <pre className="mb-4 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-surface2 p-3 text-left text-[12px] text-fg2">{this.state.error.message}</pre>
          <button className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accentfg" onClick={() => { this.setState({ error: null }); this.props.onHome() }}>Вернуться к ассистенту</button>
        </div>
      </div>
    )
  }
}
