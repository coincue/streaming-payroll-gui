import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FiatCurrency, PayrollConfig } from '../lib/wallets'
import { computeDistribution } from '../lib/wallets'
import { fetchEthPrice } from '../lib/ethPrice'

type NoticeType = 'success' | 'warning' | 'error'

type Notice = {
  type: NoticeType
  title: string
  message: string
}

type RecipientRole = 'team' | 'employee'

type RecipientRow = {
  address: string
  name: string
  role: RecipientRole
  percentage: number
  paymentType: 'percentage' | 'fixed'
  fiatCurrency: FiatCurrency
  exactEthAmount?: string
  exactFiatAmount?: string
  amount: number
  timeZone: string
  started: boolean
  completedAt?: string
}

type Props = {
  config: PayrollConfig
  onConfigChange: (config: PayrollConfig) => void
  isEmployeeMode?: boolean
  companyBalance?: string
  loadingBalance?: boolean
  connectedAccount?: string | null
  supportedNetwork?: boolean
  onStartPayment?: (employeeAddress: string, timeZone: string, amount: number) => void
  onNotify?: (notice: Notice | null) => void
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function sumPercentages(items: { percentage: number }[]): number {
  return items.reduce((sum, item) => sum + item.percentage, 0)
}

function parseAmount(value: string | undefined): number {
  if (!value || value.trim() === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function resolveFixedAmountEth(
  exactEthAmount: string | undefined,
  exactFiatAmount: string | undefined,
  fiatCurrency: FiatCurrency,
  priceMap: Partial<Record<FiatCurrency, number>>
): number {
  const eth = parseAmount(exactEthAmount)
  if (Number.isFinite(eth)) {
    return eth
  }

  const fiat = parseAmount(exactFiatAmount)
  const price = priceMap[fiatCurrency]
  if (Number.isFinite(fiat) && price && price > 0) {
    return fiat / price
  }

  return 0
}

function toRecipientRows(
  config: PayrollConfig,
  totalPay: number,
  priceMap: Partial<Record<FiatCurrency, number>>
): RecipientRow[] {
  const base = computeDistribution(config, totalPay)

  return base.map((row) => {
    const team = config.teams.find((item) => item.address === row.address)
    const employee = config.employees.find((item) => item.address === row.address)
    const source = row.role === 'team' ? team : employee

    const paymentType = source?.paymentType ?? 'percentage'
    const fiatCurrency = source?.fiatCurrency ?? 'CAD'
    const exactEthAmount = source?.exactEthAmount
    const exactFiatAmount = source?.exactFiatAmount

    const fixedAmount = resolveFixedAmountEth(
      exactEthAmount,
      exactFiatAmount,
      fiatCurrency,
      priceMap
    )

    const amount = paymentType === 'fixed' ? fixedAmount : row.amount

    const parentTeam = employee?.parentAddress
      ? config.teams.find((candidate) => candidate.address === employee.parentAddress)
      : undefined

    const timeZone =
      row.role === 'team'
        ? team?.timeZone || config.company?.timeZone || 'UTC'
        : parentTeam?.timeZone || config.company?.timeZone || 'UTC'

    return {
      address: row.address,
      name: row.name,
      role: row.role === 'team' ? 'team' : 'employee',
      percentage: source?.percentage ?? 0,
      paymentType,
      fiatCurrency,
      exactEthAmount,
      exactFiatAmount,
      amount,
      timeZone,
      started: employee?.started ?? team?.started ?? false,
      completedAt: employee?.completedAt ?? team?.completedAt
    }
  })
}

export default function DistributionView({
  config,
  onConfigChange,
  isEmployeeMode = false,
  companyBalance,
  loadingBalance,
  connectedAccount,
  supportedNetwork = false,
  onStartPayment,
  onNotify
}: Props) {
  const [activePaymentAddress, setActivePaymentAddress] = useState<string | null>(null)
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null)
  const [priceMap, setPriceMap] = useState<Partial<Record<FiatCurrency, number>>>({})

  const parsedBalance = companyBalance ? Number(companyBalance) : 0
  const totalPay = Number.isFinite(parsedBalance) ? parsedBalance : 0
  const hasValidBalance = Number.isFinite(parsedBalance) && parsedBalance > 0

  useEffect(() => {
    let active = true

    const fixedCurrencies = new Set<FiatCurrency>()
    config.teams.forEach((team) => {
      if ((team.paymentType ?? 'percentage') === 'fixed') {
        fixedCurrencies.add(team.fiatCurrency ?? 'CAD')
      }
    })
    config.employees.forEach((employee) => {
      if ((employee.paymentType ?? 'percentage') === 'fixed') {
        fixedCurrencies.add(employee.fiatCurrency ?? 'CAD')
      }
    })

    if (fixedCurrencies.size === 0) {
      setPriceMap({})
      return
    }

    const load = async () => {
      const nextMap: Partial<Record<FiatCurrency, number>> = {}
      await Promise.all(
        Array.from(fixedCurrencies).map(async (currency) => {
          try {
            const price = await fetchEthPrice(currency)
            nextMap[currency] = price
          } catch {
            nextMap[currency] = undefined
          }
        })
      )

      if (active) {
        setPriceMap(nextMap)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [config.teams, config.employees])

  const recipientRows = useMemo(
    () => toRecipientRows(config, totalPay, priceMap),
    [config, totalPay, priceMap]
  )

  const topLevelRecipients = config.company
    ? config.company.distributionMode === 'direct-to-employees'
      ? config.employees.filter((employee) => employee.parentAddress === config.company!.address)
      : [
          ...config.employees.filter((employee) => employee.parentAddress === config.company!.address),
          ...config.teams
        ]
    : []

  const allocation = sumPercentages(topLevelRecipients)

  const totalAmountToDistribute = recipientRows.reduce((sum, row) => {
    const safe = Number.isFinite(row.amount) ? row.amount : 0
    return sum + Math.max(0, safe)
  }, 0)

  const remainingAfterPayout = totalPay - totalAmountToDistribute

  const hasInvalidRecipientAmount = recipientRows.some((row) => {
    if (row.paymentType === 'percentage') {
      return !Number.isFinite(row.percentage) || row.percentage < 0
    }

    const hasEth = Boolean(row.exactEthAmount && row.exactEthAmount.trim() !== '')
    const hasFiat = Boolean(row.exactFiatAmount && row.exactFiatAmount.trim() !== '')

    if (hasEth) {
      const parsedEth = Number(row.exactEthAmount)
      if (!Number.isFinite(parsedEth) || parsedEth < 0) {
        return true
      }
    }

    if (hasFiat) {
      const parsedFiat = Number(row.exactFiatAmount)
      if (!Number.isFinite(parsedFiat) || parsedFiat < 0) {
        return true
      }

      if (!hasEth) {
        const price = priceMap[row.fiatCurrency]
        if (!price || price <= 0) {
          return true
        }
      }
    }

    return false
  })

  const hasPaymentAmount = totalAmountToDistribute > 0
  const payoutWithinBalance = totalAmountToDistribute <= totalPay

  const fiatCurrencyOptions: FiatCurrency[] = [
    'CAD',
    'USD',
    'EUR',
    'GBP',
    'AUD',
    'NZD',
    'JPY',
    'CHF',
    'SGD',
    'HKD',
    'INR',
    'PHP',
    'MXN',
    'BRL',
    'ZAR'
  ]

  const readinessChecks = [
    {
      key: 'wallet',
      label: 'Wallet connected',
      passed: Boolean(connectedAccount),
      failMessage: 'Connect your wallet before sending payments.'
    },
    {
      key: 'company',
      label: 'Company wallet configured',
      passed: Boolean(config.company?.address),
      failMessage: 'Company wallet is missing or invalid.'
    },
    {
      key: 'recipients',
      label: 'Recipients added',
      passed: recipientRows.length > 0,
      failMessage: 'Add at least one recipient.'
    },
    {
      key: 'payment',
      label: 'Payment amount entered',
      passed: hasPaymentAmount,
      failMessage: 'Enter at least one payout amount.'
    },
    {
      key: 'withinBalance',
      label: 'Total payout is within available balance',
      passed: payoutWithinBalance,
      failMessage: 'Total payout exceeds company balance.'
    },
    {
      key: 'validAmounts',
      label: 'Recipient payment amounts valid',
      passed: !hasInvalidRecipientAmount,
      failMessage: 'One or more payout amounts are invalid.'
    },
    {
      key: 'balance',
      label: 'Balance available',
      passed: hasValidBalance,
      failMessage: 'Company balance must be greater than 0.'
    },
    {
      key: 'network',
      label: 'Supported network',
      passed: supportedNetwork,
      failMessage: 'Switch to the supported network.'
    },
    {
      key: 'processing',
      label: 'Not currently processing',
      passed: activePaymentAddress === null,
      failMessage: 'Payment is currently processing.'
    }
  ]

  const firstFailedReadiness = readinessChecks.find((check) => !check.passed)

  const canExecutePayments = Boolean(
    onStartPayment && !isEmployeeMode && config.company && readinessChecks.every((check) => check.passed)
  )

  const executeDisabledReason = firstFailedReadiness?.failMessage ?? null

  const updateRecipientFiatCurrency = (row: RecipientRow, fiatCurrency: FiatCurrency) => {
    if (row.role === 'team') {
      onConfigChange({
        ...config,
        teams: config.teams.map((team) =>
          team.address === row.address ? { ...team, fiatCurrency } : team
        )
      })
      return
    }

    onConfigChange({
      ...config,
      employees: config.employees.map((employee) =>
        employee.address === row.address ? { ...employee, fiatCurrency } : employee
      )
    })
  }

  if (!connectedAccount) {
    return (
      <div className="card distribution-card">
        <h3 className="section-title">Payroll Distribution</h3>
        <p className="empty-state">Connect your wallet to start configuring Coin Cue Pay.</p>
      </div>
    )
  }

  if (!config.company) {
    return (
      <div className="card distribution-card">
        <h3 className="section-title">Payroll Distribution</h3>
        <p className="empty-state">
          No payroll plan yet. Add your company wallet and recipients to generate a payout preview.
        </p>
      </div>
    )
  }

  if (recipientRows.length === 0) {
    return (
      <div className="card distribution-card">
        <h3 className="section-title">Payroll Distribution</h3>
        <p className="empty-state">Add at least one recipient to preview payroll distribution.</p>
      </div>
    )
  }

  return (
    <div className="distribution-stack">
      <div className="card distribution-card">
        <h3 className="section-title">
          Distribution ({
            loadingBalance
              ? 'Loading...'
              : companyBalance
                ? `${companyBalance} ${config.company?.tokenType}`
                : 'No balance'
          })
        </h3>

        <div className="distribution-header-info">
          <div className="muted">
            <strong>Token:</strong> {config.company.tokenType}
          </div>
          <div className="badge badge-info">Total Percentage (Info): {allocation.toFixed(2)}%</div>
        </div>

        <table className="distribution-table" aria-label="Distribution recipients">
          <thead className="distribution-table-head">
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Wallet</th>
              <th scope="col">Share</th>
              <th scope="col">Fiat</th>
              <th scope="col">Payout</th>
              <th scope="col">Status</th>
              {!isEmployeeMode && <th scope="col">Action</th>}
            </tr>
          </thead>

          <tbody>
          {recipientRows.map((row, idx) => {
            const statusLabel = row.completedAt
              ? 'Completed'
              : activePaymentAddress === row.address || row.started
                ? 'In Progress'
                : 'Pending'

            const statusClass = row.completedAt
              ? 'badge-success'
              : activePaymentAddress === row.address || row.started
                ? 'badge-info'
                : 'badge-warning'

            const isOwnTeam =
              row.role === 'team' &&
              connectedAccount !== null &&
              connectedAccount !== undefined &&
              row.address.toLowerCase() === connectedAccount.toLowerCase()

            const rowDisabledReason = row.started
              ? 'Payment already started for this recipient. Use Start New Pay in configuration.'
              : isOwnTeam
                ? 'Teams cannot execute payment to their own wallet from this view.'
                : executeDisabledReason

            const isPaymentDisabled = Boolean(row.started || isOwnTeam || !canExecutePayments)

            const handleExecutePayment = async () => {
              if (!onStartPayment) return
              if (row.amount <= 0 || !Number.isFinite(row.amount)) {
                onNotify?.({
                  type: 'warning',
                  title: 'Amount required',
                  message: 'Enter a valid payout amount before sending payment.'
                })
                return
              }

              setActivePaymentAddress(row.address)
              try {
                await onStartPayment(row.address, row.timeZone, row.amount)
              } finally {
                setActivePaymentAddress(null)
              }
            }

            return (
              <Fragment key={`${row.address}-${idx}`}>
                <tr className={`distribution-row ${row.role === 'team' ? 'distribution-row-team' : 'distribution-row-employee'}`}>
                  <td className="distribution-cell distribution-name">
                    <strong>{row.name}</strong>
                    <span className="muted distribution-role">({row.role})</span>
                  </td>

                  <td className="distribution-cell distribution-wallet">
                    <span title={row.address}>{shortAddress(row.address)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-copy"
                      onClick={() => setExpandedAddress(expandedAddress === row.address ? null : row.address)}
                    >
                      View
                    </button>
                  </td>

                  <td className="distribution-cell">
                    {row.paymentType === 'fixed' ? 'Fixed' : `${row.percentage.toFixed(2)}%`}
                  </td>

                  <td className="distribution-cell distribution-fiat">
                    <span className="fiat-amount">
                      {row.paymentType === 'fixed'
                        ? `${row.amount.toFixed(2)}`
                        : priceMap[row.fiatCurrency]
                          ? `${(row.amount * priceMap[row.fiatCurrency]!).toFixed(2)}`
                          : 'Unavailable'}
                    </span>
                    <select
                      className="input-select fiat-cell-select"
                      value={row.fiatCurrency}
                      onChange={(event) =>
                        updateRecipientFiatCurrency(row, event.target.value as FiatCurrency)
                      }
                    >
                      {fiatCurrencyOptions.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="distribution-cell distribution-amount">
                    {Number.isFinite(row.amount) ? `${row.amount.toFixed(6)} ETH` : 'Invalid'}
                  </td>

                  <td className="distribution-cell">
                    <span className={`badge ${statusClass}`}>{statusLabel}</span>
                    {row.completedAt && <p className="muted status-note">{row.completedAt}</p>}
                  </td>

                  {!isEmployeeMode && (
                    <td className="distribution-cell">
                      <button
                        className="btn btn-primary btn-wide"
                        onClick={handleExecutePayment}
                        disabled={isPaymentDisabled}
                        title={rowDisabledReason ?? undefined}
                      >
                        {activePaymentAddress === row.address
                          ? 'Sending...'
                          : row.started
                            ? 'Payment Started'
                            : 'Confirm & Send Payment'}
                      </button>
                      {isPaymentDisabled && rowDisabledReason && (
                        <p className="action-helper status-warning">{rowDisabledReason}</p>
                      )}
                    </td>
                  )}
                </tr>

                {expandedAddress === row.address && (
                  <tr className="distribution-details-row">
                    <td colSpan={isEmployeeMode ? 6 : 7}>
                      <div className="address-review" role="note" aria-live="polite">
                        <p className="address-review-label">Full wallet address</p>
                        <code className="address-review-value">{row.address}</code>
                        <div className="row row-tight">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(row.address)
                                onNotify?.({
                                  type: 'success',
                                  title: 'Address copied',
                                  message: 'Wallet address copied to clipboard.'
                                })
                              } catch {
                                onNotify?.({
                                  type: 'error',
                                  title: 'Copy failed',
                                  message: 'Could not copy wallet address.'
                                })
                              }
                            }}
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setExpandedAddress(null)}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          </tbody>
        </table>
      </div>

      <div className="card preview-card">
        <h3 className="section-title">Total Payment Preview</h3>
        <div className="preview-grid">
          <div className="metric">
            <p className="label">Company balance (ETH)</p>
            <p className="value">{totalPay.toFixed(6)} ETH</p>
          </div>
          <div className="metric">
            <p className="label">Recipients</p>
            <p className="value">{recipientRows.length}</p>
          </div>
          <div className="metric">
            <p className="label">Total payout (ETH)</p>
            <p className="value">{totalAmountToDistribute.toFixed(6)} ETH</p>
          </div>
          <div className="metric">
            <p className="label">Remaining ETH balance</p>
            <p className={`value ${remainingAfterPayout >= 0 ? 'status-success' : 'status-danger'}`}>
              {remainingAfterPayout.toFixed(6)} ETH
            </p>
          </div>
          <div className="metric">
            <p className="label">Total percentage (info)</p>
            <p className="value">{allocation.toFixed(2)}%</p>
          </div>
        </div>

        <div className="readiness-checklist" role="status" aria-live="polite">
          <p className="readiness-title">Payment Readiness</p>
          {readinessChecks.map((check) => (
            <p key={check.key} className={check.passed ? 'status-success' : 'status-danger'}>
              {check.passed ? '✓' : '✗'} {check.label}
              {!check.passed && ` - ${check.failMessage}`}
            </p>
          ))}
        </div>

        {executeDisabledReason && !isEmployeeMode && (
          <div className="inline-alert inline-alert-warning" role="status">
            {executeDisabledReason}
          </div>
        )}
      </div>
    </div>
  )
}
