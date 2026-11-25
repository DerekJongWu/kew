import { router } from '../router'

const TABS = [
  { key: 'fields', label: 'Fields' },
  { key: 'vault', label: 'Vault and history' }
] as const

/** The Settings header: kicker, title and the tab row. Tabs switch the route. */
export function SettingsHeader({
  tab,
  title
}: {
  tab: 'fields' | 'vault'
  title: string
}): React.JSX.Element {
  return (
    <>
      <header className="screen-head">
        <div>
          <p className="screen-kicker">Settings</p>
          <h1 className="screen-title">{title}</h1>
        </div>
      </header>
      <nav className="view-tabs settings-tabs" aria-label="Settings sections">
        <div className="tabs">
          {TABS.map((t) => (
            <span key={t.key} className={`tab-wrap${tab === t.key ? ' is-active' : ''}`}>
              <button
                type="button"
                className="tab"
                aria-current={tab === t.key ? 'page' : undefined}
                onClick={() => router.navigate({ name: 'settings', tab: t.key })}
              >
                {t.label}
              </button>
            </span>
          ))}
        </div>
      </nav>
    </>
  )
}
