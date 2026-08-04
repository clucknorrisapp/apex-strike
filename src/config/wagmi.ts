import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { cronos } from './chains'

export const config = createConfig({
  chains: [cronos],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [cronos.id]: http(),
  },
})
