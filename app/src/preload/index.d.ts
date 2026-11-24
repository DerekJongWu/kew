import type { KewApi } from '../shared/api'

declare global {
  interface Window {
    kew: KewApi
  }
}
