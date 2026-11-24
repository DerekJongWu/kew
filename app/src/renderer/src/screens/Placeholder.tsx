import { kew, useQuery } from '../api'
import type { Route } from '../router'
import { DESTINATIONS, SETTINGS, TYPE_LABEL } from '../lib/destinations'
import { EmptyState } from '../components/EmptyState'

function useHeading(route: Route): { title: string; kicker: string } {
  const id = route.name === 'record' ? route.id : null
  const { data } = useQuery(() => (id ? kew.get(id) : Promise.resolve(null)), [id])
  if (route.name === 'record')
    return { title: data?.name ?? '', kicker: data ? TYPE_LABEL[data.type] : '' }
  if (route.name === 'search') return { title: `Search: ${route.q}`, kicker: '' }
  if (route.name === 'settings') return { title: SETTINGS.label, kicker: '' }
  const d = DESTINATIONS.find((x) => x.key === (route.name === 'list' ? route.type : route.name))
  return { title: d?.label ?? '', kicker: '' }
}

/** Screens that land after the design checkpoint. Navigation to them already works. */
export function Placeholder({ route }: { route: Route }): React.JSX.Element {
  const { title, kicker } = useHeading(route)
  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          {kicker && <p className="screen-kicker">{kicker}</p>}
          <h1 className="screen-title">{title}</h1>
        </div>
      </header>
      <EmptyState title="Coming next">
        This screen is part of the next build step. Press ⌘[ to go back, or ⌘K to jump somewhere
        else.
      </EmptyState>
    </div>
  )
}
