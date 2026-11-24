// Pure helpers for the first-launch screen.
import type { SetupPlan } from '../../../shared/api'

/** The error's name can be lost crossing the context bridge, so the message counts too. */
export const isFolderNotEmpty = (e: unknown): boolean =>
  e instanceof Error &&
  (e.name === 'FolderNotEmptyError' || /Folder is not empty: /.test(e.message))

/** The folder path createVault names in a FolderNotEmptyError. */
export const notEmptyFolder = (e: unknown): string | null =>
  e instanceof Error ? (/Folder is not empty: (.+)$/.exec(e.message)?.[1] ?? null) : null

/** planSetup rejects with ENOENT when the folder is gone (a stale recent vault). */
export const isMissingFolder = (e: unknown): boolean =>
  e instanceof Error && /ENOENT/.test(e.message)

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
