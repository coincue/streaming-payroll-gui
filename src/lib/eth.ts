export type Eip1193Provider = {
  isMetaMask?: boolean
  request: (args: { method: string; params?: any[] | object }) => Promise<any>
  on?: (event: string, listener: (...args: any[]) => void) => void
  removeListener?: (event: string, listener: (...args: any[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export function getProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null
  const p = window.ethereum
  return p && typeof p.request === 'function' ? p : null
}

export async function connectWallet(): Promise<{ accounts: string[]; chainId: string }>
{
  const provider = getProvider()
  if (!provider) throw new Error('No Ethereum provider found. Install MetaMask.')
  const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' })
  const chainId: string = await provider.request({ method: 'eth_chainId' })
  return { accounts, chainId }
}

export async function getAccounts(): Promise<string[]> {
  const provider = getProvider()
  if (!provider) return []
  const accounts: string[] = await provider.request({ method: 'eth_accounts' })
  return accounts
}

export async function getChainId(): Promise<string | null> {
  const provider = getProvider()
  if (!provider) return null
  return provider.request({ method: 'eth_chainId' })
}

export async function disconnectWallet(): Promise<void> {
  const provider = getProvider()
  if (!provider) return
  try {
    // Best-effort revoke (supported by MetaMask via permissions API)
    await provider.request({
      method: 'wallet_revokePermissions',
      params: [
        {
          eth_accounts: {}
        }
      ]
    })
  } catch {
    // Not supported or rejected; fall back to local state clear only
  }
}

export function onAccountsChanged(cb: (accounts: string[]) => void): () => void {
  const provider = getProvider()
  if (!provider || !provider.on || !provider.removeListener) return () => {}
  const handler = (accs: string[]) => cb(accs)
  provider.on('accountsChanged', handler)
  return () => provider.removeListener && provider.removeListener('accountsChanged', handler)
}

export function onChainChanged(cb: (chainId: string) => void): () => void {
  const provider = getProvider()
  if (!provider || !provider.on || !provider.removeListener) return () => {}
  const handler = (id: string) => cb(id)
  provider.on('chainChanged', handler)
  return () => provider.removeListener && provider.removeListener('chainChanged', handler)
}

export function shortAddr(addr: string): string {
  if (!addr) return ''
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}
