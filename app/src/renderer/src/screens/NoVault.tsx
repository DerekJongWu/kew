import { EmptyState } from '../components/EmptyState'

/** Shown until onboarding (Task 15) lands. */
export function NoVault(): React.JSX.Element {
  return (
    <div className="no-vault drag">
      <EmptyState title="No vault open">
        Kew works on a folder of notes on this Mac. Opening one comes next.
      </EmptyState>
    </div>
  )
}
