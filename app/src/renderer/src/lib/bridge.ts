// Turns the raw preload bridge (methods resolve to envelopes) into the KewApi the screens use.
// Errors are created here, in the renderer realm, so they keep their name.
import { KEW_METHODS, type Envelope, type KewBridge } from '../../../shared/methods'
import type { KewApi } from '../../../shared/api'

export function unwrap<T>(res: Envelope<T>): T {
  if ('error' in res) {
    const { name, message, path } = res.error
    throw Object.assign(new Error(message), { name }, path === undefined ? {} : { path })
  }
  return res.value
}

export function wrapBridge(bridge: KewBridge): KewApi {
  const api = { onChanged: bridge.onChanged, onMenuUndo: bridge.onMenuUndo } as KewApi
  for (const m of KEW_METHODS) {
    ;(api as unknown as Record<string, unknown>)[m] = async (...args: unknown[]) =>
      unwrap(await (bridge[m] as (...a: unknown[]) => Promise<Envelope>)(...args))
  }
  return api
}
