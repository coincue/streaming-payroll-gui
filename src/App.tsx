import { useEffect, useState } from 'react'
import WalletConnect from './components/WalletConnect'
import WalletManager from './components/WalletManager'
import { getTokenBalance } from './lib/balance'
import DistributionView from './components/DistributionView'
import type { PayrollConfig, TeamWallet, EmployeeWallet } from './lib/wallets'
import { createDefaultConfig } from './lib/wallets'
import { getAccounts, getChainId } from './lib/eth'
import { executePayment } from './lib/transactions'
import { getNetworkByChainId } from './lib/networks'
import { computeDistribution } from './lib/wallets'
import {
  getExplorerUrlForChain,
  type PaymentHistoryRecord
} from './lib/csvBackup'

type NoticeType = 'success' | 'warning' | 'error'

type Notice = {
  type: NoticeType
  title: string
  message: string
}

function shortenAddress(addr: string): string {
  if (!addr) return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function withRecipientAmountDefaults<T extends TeamWallet | EmployeeWallet>(items: T[]): T[] {
  return items.map((item) => ({
    ...item,
    paymentType: item.paymentType ?? 'percentage',
    fiatCurrency: item.fiatCurrency ?? 'CAD',
    exactEthAmount: item.exactEthAmount ?? '',
    exactFiatAmount: item.exactFiatAmount ?? ''
  }))
}

function normalizeConfig(savedConfig: unknown): PayrollConfig {
  const fallback = createDefaultConfig()
  if (!savedConfig || typeof savedConfig !== 'object') {
    return fallback
  }

  const raw = savedConfig as Partial<PayrollConfig>

  return {
    ...fallback,
    ...raw,
    teams: withRecipientAmountDefaults(raw.teams ?? []),
    employees: withRecipientAmountDefaults(raw.employees ?? []),
    paymentMode: raw.paymentMode === 'exact' ? 'exact' : 'percentage',
    fiatCurrency: raw.fiatCurrency ?? 'CAD'
  }
}

function normalizePaymentHistory(savedHistory: unknown): PaymentHistoryRecord[] {
  if (!Array.isArray(savedHistory)) {
    return []
  }

  return savedHistory.filter((item): item is PaymentHistoryRecord => {
    if (!item || typeof item !== 'object') {
      return false
    }
    const candidate = item as Partial<PaymentHistoryRecord>
    return (
      typeof candidate.dateTime === 'string' &&
      typeof candidate.recipientName === 'string' &&
      typeof candidate.walletAddress === 'string' &&
      typeof candidate.ethAmount === 'string' &&
      typeof candidate.transactionHash === 'string' &&
      typeof candidate.blockExplorerUrl === 'string' &&
      (candidate.status === 'pending' ||
        candidate.status === 'confirmed' ||
        candidate.status === 'failed') &&
      (candidate.paymentMode === 'percentage' || candidate.paymentMode === 'exact')
    )
  })
}

export default function App() {
  // Load wallet config from localStorage on mount
  const [walletConfig, setWalletConfig] = useState<PayrollConfig>(() => {
    try {
      const saved = localStorage.getItem('walletConfig')
      return saved ? normalizeConfig(JSON.parse(saved)) : createDefaultConfig()
    } catch {
      return createDefaultConfig()
    }
  })
  const [companyBalance, setCompanyBalance] = useState<string>('0')
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('paymentHistory')
      return saved ? normalizePaymentHistory(JSON.parse(saved)) : []
    } catch {
      return []
    }
  })
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null)
  const [networkName, setNetworkName] = useState<string>('Unknown')
  const [isSupportedNetwork, setIsSupportedNetwork] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [showConnectedWalletDetails, setShowConnectedWalletDetails] = useState(false)

  // Save wallet config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('walletConfig', JSON.stringify(walletConfig))
  }, [walletConfig])

  useEffect(() => {
    localStorage.setItem('paymentHistory', JSON.stringify(paymentHistory))
  }, [paymentHistory])

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
      setNetworkName(network?.name || (chainId ? `Chain ${chainId}` : 'Unknown'))
      setIsSupportedNetwork(Boolean(network))
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

  const topLevelRecipients = walletConfig.company
    ? walletConfig.company.distributionMode === 'direct-to-employees'
      ? walletConfig.employees.filter((employee) => employee.parentAddress === walletConfig.company!.address)
      : [
          ...walletConfig.employees.filter(
            (employee) => employee.parentAddress === walletConfig.company!.address
          ),
          ...walletConfig.teams
        ]
    : []

  const totalAllocation = topLevelRecipients.reduce((sum, item) => sum + item.percentage, 0)
  const distribution = computeDistribution(walletConfig, companyBalance ? Number(companyBalance) : 0)
  const recipientsCount = distribution.length
  const companyToken = walletConfig.company?.tokenType ?? '--'

  const paymentStatus = !connectedAccount
    ? 'Wallet not connected'
    : !walletConfig.company
      ? 'Company wallet missing'
      : recipientsCount === 0
        ? 'No recipients configured'
        : loadingBalance
          ? 'Syncing balance'
          : 'Ready'

  const paymentStatusTone: NoticeType = paymentStatus === 'Ready'
    ? 'success'
    : paymentStatus === 'Syncing balance'
      ? 'warning'
      : 'error'

  return (
    <div className="container dashboard">
      <header className="card dashboard-hero">
        <div>
          <p className="eyebrow">Web3 Payroll Dashboard</p>
          <h1 className="title">Coin Cue Pay</h1>
          <p className="subtitle">Crypto Payroll for modern Web3 teams.</p>
        </div>
        <div className="dashboard-hero-actions">
          <WalletConnect onAccountChange={setConnectedAccount} onNotify={setNotice} compact />
          <div className="badge-row">
            <span className={`badge ${connectedAccount ? 'badge-success' : 'badge-warning'}`}>
              {connectedAccount ? `Connected: ${shortenAddress(connectedAccount)}` : 'Wallet Disconnected'}
            </span>
            {connectedAccount && (
              <button
                type="button"
                className="btn btn-ghost btn-copy"
                onClick={() => setShowConnectedWalletDetails((prev) => !prev)}
              >
                View
              </button>
            )}
            <span className="badge badge-info">Network: {networkName}</span>
            {walletConfig.company && (
              <span className="badge badge-info">
                {walletConfig.company.tokenType} • {walletConfig.company.distributionMode === 'via-teams' ? 'Via Teams' : 'Direct'}
              </span>
            )}
          </div>
          {connectedAccount && showConnectedWalletDetails && (
            <div className="address-review" role="note" aria-live="polite">
              <p className="address-review-label">Connected wallet</p>
              <code className="address-review-value">{connectedAccount}</code>
            </div>
          )}
        </div>
      </header>

      {notice && (
        <section className={`notice notice-${notice.type}`} role="status" aria-live="polite">
          <strong>{notice.title}</strong>
          <p>{notice.message}</p>
          <button className="btn btn-ghost" onClick={() => setNotice(null)}>Dismiss</button>
        </section>
      )}

      <section className="mode-banner-wrap">
        <div className={`mode-banner ${isEmployeeMode ? 'mode-banner-employee' : 'mode-banner-manager'}`}>
          <strong>{isEmployeeMode ? 'Employee View' : 'Manager Dashboard'}</strong>
          <p>
            {isEmployeeMode
              ? 'You are viewing your assigned payout information.'
              : 'Configure company wallet, recipients, payout shares, and payment execution.'}
          </p>
        </div>
      </section>

      <section className="dashboard-top-layout" aria-label="Summary and configuration">
        <section className="dashboard-top-stats">
          <h3 className="section-title">Status</h3>
          <div className="stats-grid" aria-label="Dashboard summary">
            <article className="card stat-card">
              <p className="stat-label">Company Balance</p>
              <p className="stat-value">
                {loadingBalance ? 'Loading...' : `${companyBalance} ${companyToken}`}
              </p>
            </article>
            <article className="card stat-card">
              <p className="stat-label">Company Wallet</p>
              <p className="stat-value">
                {walletConfig.company?.address ? shortenAddress(walletConfig.company.address) : '--'}
              </p>
            </article>
            <article className="card stat-card">
              <p className="stat-label">Recipients</p>
              <p className="stat-value">{recipientsCount}</p>
            </article>
            <article className="card stat-card">
              <p className="stat-label">Total Allocation</p>
              <p className="stat-value">
                {totalAllocation.toFixed(2)}%
              </p>
              <p className="stat-helper">Informational only</p>
            </article>
            <article className="card stat-card">
              <p className="stat-label">Payment Status</p>
              <p className={`stat-value status-${paymentStatusTone}`}>{paymentStatus}</p>
            </article>
          </div>
        </section>

        {!isEmployeeMode && (
          <section className="dashboard-top-config" aria-label="Configuration">
            <WalletManager
              config={walletConfig}
              onChange={setWalletConfig}
              paymentHistory={paymentHistory}
              onPaymentHistoryChange={setPaymentHistory}
              onNotify={setNotice}
            />
          </section>
        )}
      </section>

      <main className="dashboard-layout">
        <section className="dashboard-main" aria-label="Distribution and preview">
          <DistributionView
            config={walletConfig}
            onConfigChange={setWalletConfig}
            isEmployeeMode={isEmployeeMode}
            companyBalance={companyBalance}
            connectedAccount={connectedAccount}
            supportedNetwork={isSupportedNetwork}
            onNotify={setNotice}
            onStartPayment={async (recipientAddr, timeZone, amount) => {
              if (!walletConfig.company) {
                setNotice({
                  type: 'warning',
                  title: 'Company wallet required',
                  message: 'Configure a company wallet before attempting payouts.'
                })
                return
              }

              const chainId = await getChainId()
              const network = chainId ? getNetworkByChainId(parseInt(chainId, 16)) : null
              const usdcAddress = network?.usdcAddress

              const result = await executePayment(
                recipientAddr,
                amount,
                walletConfig.company.tokenType,
                usdcAddress
              )

              if (!result.success) {
                setNotice({
                  type: 'error',
                  title: 'Payment failed',
                  message: result.error ?? 'Transaction failed. Please try again.'
                })
                return
              }

              const blockTime = result.timestamp ? new Date(result.timestamp * 1000) : new Date()
              const completedAt = blockTime.toLocaleString('en-US', { timeZone }) + ` (${timeZone})`
              const isTeam = walletConfig.teams.some((team) => team.address === recipientAddr)
              const recipient = isTeam
                ? walletConfig.teams.find((team) => team.address === recipientAddr)
                : walletConfig.employees.find((employee) => employee.address === recipientAddr)
              const paymentType = recipient?.paymentType ?? 'percentage'
              const rawChainId = chainId ? parseInt(chainId, 16) : null
              const paymentRecord: PaymentHistoryRecord = {
                dateTime: blockTime.toLocaleString(),
                recipientName: recipient?.name ?? recipientAddr,
                walletAddress: recipientAddr,
                ethAmount: amount.toString(),
                fiatAmount: recipient?.exactFiatAmount || undefined,
                fiatCurrency: recipient?.fiatCurrency || undefined,
                transactionHash: result.txHash ?? '',
                blockExplorerUrl: getExplorerUrlForChain(rawChainId, result.txHash ?? ''),
                status: 'confirmed',
                paymentMode: paymentType === 'fixed' ? 'exact' : 'percentage'
              }

              setWalletConfig((current) => ({
                ...current,
                ...(isTeam && {
                  teams: current.teams.map((team) =>
                    team.address === recipientAddr ? { ...team, started: true, completedAt } : team
                  )
                }),
                ...(!isTeam && {
                  employees: current.employees.map((employee) =>
                    employee.address === recipientAddr
                      ? { ...employee, started: true, completedAt }
                      : employee
                  )
                })
              }))

              setPaymentHistory((current) => [...current, paymentRecord])

              setNotice({
                type: 'success',
                title: 'Payment sent',
                message: `Transaction confirmed: ${result.txHash}`
              })
            }}
            loadingBalance={loadingBalance}
          />
        </section>
      </main>
    </div>
  )
}
