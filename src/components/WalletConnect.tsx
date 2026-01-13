import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  connectWallet,
  disconnectWallet,
  getAccounts,
  getChainId,
  getProvider,
  onAccountsChanged,
  onChainChanged,
  shortAddr
} from '../lib/eth'

type Props = {
  onAccountChange?: (account: string | null) => void
}

export default function WalletConnect({ onAccountChange }: Props) {
  const provider = getProvider()
  const [accounts, setAccounts] = useState<string[]>([])
  const [chainId, setChainId] = useState<string | null>(null)
  const connected = accounts.length > 0
  const primary = useMemo(() => (connected ? accounts[0] : ''), [accounts, connected])

  useEffect(() => {
    onAccountChange?.(primary || null)
  }, [primary, onAccountChange])

  useEffect(() => {
    // On mount, read current state if provider exists
    ;(async () => {
      const [accs, cid] = await Promise.all([getAccounts(), getChainId()])
      setAccounts(accs)
      setChainId(cid)
    })()
    // Subscribe to changes
    const offAcc = onAccountsChanged((accs) => setAccounts(accs))
    const offChain = onChainChanged((cid) => setChainId(cid))
    return () => {
      offAcc()
      offChain()
    }
  }, [])

  const handleConnect = useCallback(async () => {
    try {
      const { accounts: accs, chainId: cid } = await connectWallet()
      setAccounts(accs)
      setChainId(cid)
    } catch (e: any) {
      alert(e?.message ?? 'Failed to connect wallet')
    }
  }, [])

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectWallet()
    } finally {
      // Clear local state regardless
      setAccounts([])
      // Keep chainId around; provider may remain on same network
    }
  }, [])

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="row between">
        <div>
          <div style={{ fontWeight: 700 }}>Wallet</div>
          {!provider && <div className="status-danger">MetaMask not detected</div>}
          {provider && !connected && <div className="status-muted">Not connected</div>}
          {provider && connected && (
            <div className="status-success">
              {shortAddr(primary)} {chainId ? `(chain ${parseInt(chainId, 16)})` : ''}
            </div>
          )}
        </div>
        <div>
          {!connected ? (
            <button className="btn btn-primary" onClick={handleConnect} disabled={!provider}>
              Connect MetaMask
            </button>
          ) : (
            <button className="btn" onClick={handleDisconnect}>Disconnect</button>
          )}
        </div>
      </div>
    </div>
  )
}
