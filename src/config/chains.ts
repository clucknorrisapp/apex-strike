import { defineChain } from 'viem'

export const cronos = defineChain({
  id: 25,
  name: 'Cronos',
  nativeCurrency: {
    decimals: 18,
    name: 'Cronos',
    symbol: 'CRO',
  },
  rpcUrls: {
    default: {
      http: ['https://evm.cronos.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Cronoscan',
      url: 'https://cronoscan.com',
    },
  },
})

// Apex Huntress NFT Contract on Cronos
export const APEX_HUNTRESS_CONTRACT = '0x7e9c0ed6433f1425b218f7cc721ba60d6be9e9b9' as const

export const APEX_HUNTRESS_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const