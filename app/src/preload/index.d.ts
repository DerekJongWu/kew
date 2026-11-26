import type { KewBridge } from '../shared/methods'

declare global {
  interface Window {
    kew: KewBridge
  }
}
