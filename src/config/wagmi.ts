import { http, createConfig } from 'wagmi'
import { cronos } from './chains'

export const config = createConfig({
  chains: [cronos],
  transports: {
    [cronos.id]: http(),
  },
})