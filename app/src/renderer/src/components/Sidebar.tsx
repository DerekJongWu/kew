import { kew, useQuery } from '../api'
import { useRoute } from '../router'
import { DESTINATIONS, SETTINGS, destinationKey, type Destination } from '../lib/destinations'
import type { VaultInfo } from '../../../shared/api'
import { Chip, Kbd } from './Chip'
import { Icon } from './Icon'
import { HistoryMenu } from './HistoryMenu'
import { StatusLine } from './StatusLine'

async function counts(): Promise<Record<string, number>> {
  const [t, companies, schema] = await Promise.all([kew.today(), kew.list('company'), kew.schema()])
  const stages = schema.types.company.fields.find((f) => f.key === 'pipeline_status')?.options ?? []
  const open = new Set(
    stages.filter((o) => o.category === 'new' || o.category === 'in-progress').map((o) => o.value)
  )
  return {
    today: t.followUps.length + t.repliesOwed.length + t.reachOut.length + t.newInbound.length,
    pipeline: companies.filter((c) => open.has(String(c.fields.pipeline_status ?? ''))).length
  }
}

export function Sidebar({
  vault,
  onOpenCommand
}: {
  vault: VaultInfo
  onOpenCommand(): void
}): React.JSX.Element {
  const [route, navigate] = useRoute()
  const { data } = useQuery(counts, [vault.root])
  const current = destinationKey(route)

  const item = (d: Destination): React.JSX.Element => {
    const n = data?.[d.key]
    return (
      <li key={d.key}>
        <button
          type="button"
          className="nav-item"
          aria-current={current === d.key ? 'page' : undefined}
          title={`${d.label}  ⌘${d.shortcut}`}
          onClick={() => navigate(d.route)}
        >
          <span>{d.label}</span>
          {n !== undefined && n > 0 && (
            <span className={`nav-count${d.key === 'today' ? ' is-due' : ''}`}>
              <span className="visually-hidden">, </span>
              {n}
            </span>
          )}
        </button>
      </li>
    )
  }

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar-top drag">
        <span className="wordmark">Kew</span>
        {vault.isSample && <Chip tone="accent">Sample</Chip>}
      </div>
      <button type="button" className="jump" onClick={onOpenCommand}>
        <Icon name="search" size={14} />
        <span>Search or jump</span>
        <Kbd>⌘K</Kbd>
      </button>
      <ul className="nav-list">{DESTINATIONS.map(item)}</ul>
      <div className="sidebar-spacer" />
      <ul className="nav-list">{item(SETTINGS)}</ul>
      <div className="sidebar-foot">
        <HistoryMenu />
        <StatusLine />
      </div>
      <p className="vault-name" title={vault.root}>
        {vault.name}
      </p>
    </nav>
  )
}
