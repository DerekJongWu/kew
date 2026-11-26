import type { Vault } from '../core/vault'

const SCHEMA_PATH = '.kew/schema.yaml'

/**
 * Builds the watcher callback: re-index the changed paths, then broadcast the changed ids,
 * unless the vault was switched or closed meanwhile. Schema edits always broadcast (even with
 * no record ids) so the renderer re-reads getState() and shows schemaError.
 */
export function createChangeHandler(
  getVault: () => Vault | null,
  broadcast: (ids: string[]) => void,
  onError: (e: unknown) => void = console.error
): (v: Vault, paths: string[]) => Promise<void> {
  return async (v, paths) => {
    try {
      const ids = await v.onExternalChange(paths)
      if (getVault() !== v) return
      if (ids.length > 0 || paths.includes(SCHEMA_PATH)) broadcast(ids)
    } catch (e) {
      onError(e)
    }
  }
}
