import { BrowserView } from '../components/BrowserView'

/** The built-in browser. Collecting data from sites by the assistant (Browser Agent) comes with stage 8. */
export function BrowserPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pb-3 pt-6">
        <h1 className="text-[22px] font-semibold tracking-tight">Браузер</h1>
        <p className="text-fg3">Встроенный браузер. Ассистент открывает здесь найденные страницы; сбор данных с сайтов по поручению — на этапе 8.</p>
      </div>
      <div className="mx-8 mb-6 min-h-0 flex-1 overflow-hidden rounded-xl border border-line"><BrowserView /></div>
    </div>
  )
}
