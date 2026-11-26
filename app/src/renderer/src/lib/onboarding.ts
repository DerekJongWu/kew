// Pure helpers for the first-launch screen.
import type { SetupPlan } from '../../../shared/api'

export const isFolderNotEmpty = (e: unknown): boolean =>
  e instanceof Error && e.name === 'FolderNotEmptyError'

export const isFolderMissing = (e: unknown): boolean =>
  e instanceof Error && e.name === 'FolderMissingError'

/** The folder a FolderNotEmptyError names (set by the main process). */
export const notEmptyFolder = (e: unknown): string | null =>
  e instanceof Error && typeof (e as { path?: unknown }).path === 'string'
    ? (e as unknown as { path: string }).path
    : null

export function folderName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? '/'
}

/** The renderer doesn't know the home folder; macOS homes are /Users/<name>. */
export const prettyPath = (path: string): string => path.replace(/^\/Users\/[^/]+(?=\/|$)/, '~')

export function planSummary(plan: SetupPlan): {
  notes: string
  folders: string[]
  files: string[]
  nothing: boolean
} {
  const n = plan.existingNotes
  return {
    notes:
      n === 0
        ? 'No notes here yet'
        : `${n} ${n === 1 ? 'note' : 'notes'} already here, left untouched`,
    folders: plan.willCreate.filter((p) => p.endsWith('/')),
    files: plan.willCreate.filter((p) => !p.endsWith('/')),
    nothing: plan.willCreate.length === 0
  }
}
