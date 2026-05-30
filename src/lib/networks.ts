export type NetworkConfig = {
  chainId: number
  name: string
  rpcUrl: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  usdcAddress?: string
}

export const networks: Record<string, NetworkConfig> = {
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' // Sepolia USDC test token
  },
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCf7e' // Base Sepolia USDC
  },
  mainnet: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // Mainnet USDC
  },
  polygon: {
    chainId: 137,
    name: 'Polygon Mainnet',
    rpcUrl: 'https://polygon-rpc.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // Polygon USDC
  }
}

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(networks).find((n) => n.chainId === chainId)
}
