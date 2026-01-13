import { useEffect, useState } from 'react'
import WalletConnect from './components/WalletConnect'
import WalletManager from './components/WalletManager'
import { getTokenBalance } from './lib/balance'
import DistributionView from './components/DistributionView'
import type { PayrollConfig } from './lib/wallets'
import { createDefaultConfig } from './lib/wallets'
import { getAccounts, getChainId } from './lib/eth'
import { executePayment } from './lib/transactions'
import { getNetworkByChainId } from './lib/networks'

export default function App() {
  // Load wallet config from localStorage on mount
  const [walletConfig, setWalletConfig] = useState<PayrollConfig>(() => {
    try {
      const saved = localStorage.getItem('walletConfig')
      return saved ? JSON.parse(saved) : createDefaultConfig()
    } catch {
      return createDefaultConfig()
    }
  })
  const [companyBalance, setCompanyBalance] = useState<string>('0')
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null)
  const [networkName, setNetworkName] = useState<string>('Unknown')

  // Save wallet config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('walletConfig', JSON.stringify(walletConfig))
  }, [walletConfig])

  useEffect(() => {
    const getAccount = async () => {
      const accounts = await getAccounts()
      setConnectedAccount(accounts[0] || null)
    }
    getAccount()
  }, [])

  useEffect(() => {
    const getNetwork = async () => {
      const chainId = await getChainId()
      const network = chainId ? getNetworkByChainId(parseInt(chainId, 16)) : null
      setNetworkName(network?.name || `Chain ${chainId}`)
    }
    getNetwork()
  }, [connectedAccount])

  // Fetch company balance for DistributionView
  useEffect(() => {
    const fetchBalance = async () => {
      if (!walletConfig.company) return
      setLoadingBalance(true)
      try {
        const chainId = await getChainId()
        const network = chainId ? getNetworkByChainId(parseInt(chainId, 16)) : null
        const usdcAddress = network?.usdcAddress || ''
        const balance = await getTokenBalance(
          walletConfig.company.address,
          usdcAddress,
          walletConfig.company.tokenType
        )
        setCompanyBalance(balance)
      } catch (error) {
        setCompanyBalance('0')
      } finally {
        setLoadingBalance(false)
      }
    }
    fetchBalance()
  }, [walletConfig.company?.address, walletConfig.company?.tokenType])

  // Check if connected account is an employee
  const isEmployeeMode = connectedAccount
    ? walletConfig.employees.some(
        (emp) => emp.address.toLowerCase() === connectedAccount.toLowerCase()
      )
    : false

  return (
    <div className="container">
      <h1 className="title">OnChain Payroll</h1>

      <WalletConnect onAccountChange={setConnectedAccount} />

      {connectedAccount && (
        <div className="card" style={{ marginBottom: '1rem', padding: '.75rem', fontSize: '.9rem' }}>
          <span className="muted">Network: <strong>{networkName}</strong></span>
        </div>
      )}

      {/* Only show manager if not an employee (read-only mode) */}
      {!isEmployeeMode && (
        <WalletManager 
          config={walletConfig} 
          onChange={(newConfig) => {
            setWalletConfig(newConfig)
            localStorage.setItem('walletConfig', JSON.stringify(newConfig))
          }} 
        />
      )}



      <DistributionView
        config={walletConfig}
        isEmployeeMode={isEmployeeMode}
        companyBalance={companyBalance}
        connectedAccount={connectedAccount}
        onStartPayment={async (recipientAddr, timeZone, amount) => {
          if (!walletConfig.company) return
          // Use amount from DistributionView (based on live balance)
          // Get network info for USDC address
          const chainId = await getChainId()
          const network = chainId ? getNetworkByChainId(parseInt(chainId, 16)) : null
          const usdcAddress = network?.usdcAddress

          // Execute blockchain transaction
          const result = await executePayment(
            recipientAddr,
            amount,
            walletConfig.company.tokenType,
            usdcAddress
          )

          if (!result.success) {
            alert(`Transaction failed: ${result.error}`)
            return
          }

          // Format completion time from block timestamp
          const blockTime = result.timestamp ? new Date(result.timestamp * 1000) : new Date()
          const completedAt = blockTime.toLocaleString('en-US', { timeZone }) + ` (${timeZone})`

          // Update either employee or team based on what was paid
          const isTeam = walletConfig.teams.some((t) => t.address === recipientAddr)

          setWalletConfig({
            ...walletConfig,
            ...(isTeam && {
              teams: walletConfig.teams.map((t) =>
                t.address === recipientAddr ? { ...t, started: true, completedAt } : t
              )
            }),
            ...(!isTeam && {
              employees: walletConfig.employees.map((e) =>
                e.address === recipientAddr ? { ...e, started: true, completedAt } : e
              )
            })
          })

          alert(`Payment sent! Transaction: ${result.txHash}`)
        }}
        loadingBalance={loadingBalance}
      />

      <p className="muted">Configure wallets and distribute payments through the hierarchy. Distribution is based on the live wallet balance.</p>
    </div>
  )
}
