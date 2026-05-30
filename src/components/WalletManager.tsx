import { useEffect, useRef, useState } from 'react'
import type {
  PayrollConfig,
  CompanyWallet,
  TeamWallet,
  EmployeeWallet,
  FiatCurrency
} from '../lib/wallets'
import { getTokenBalance } from '../lib/balance'
import { getNetworkByChainId } from '../lib/networks'
import { getChainId } from '../lib/eth'
import { fetchEthPrice } from '../lib/ethPrice'
import { isAddress } from 'ethers'
import {
  downloadCSV,
  exportPaymentHistoryToCSV,
  exportPayrollDataToCSV,
  importPaymentHistoryFromCSV,
  importPayrollDataFromCSV,
  mergePaymentHistory,
  type PaymentHistoryRecord
} from '../lib/csvBackup'

const timeZones = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Singapore',
  'Asia/Tokyo'
]

const fiatCurrencies: FiatCurrency[] = [
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

type Props = {
  config: PayrollConfig
  onChange: (config: PayrollConfig) => void
  paymentHistory: PaymentHistoryRecord[]
  onPaymentHistoryChange: (history: PaymentHistoryRecord[]) => void
  onNotify?: (notice: { type: 'success' | 'warning' | 'error'; title: string; message: string } | null) => void
}

type FormMode = 'none' | 'add-company' | 'add-team' | 'add-employee' | 'edit-company' | 'edit-team' | 'edit-employee'

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function WalletManager({
  config,
  onChange,
  paymentHistory,
  onPaymentHistoryChange,
  onNotify
}: Props) {
  const [formMode, setFormMode] = useState<FormMode>('none')
  const [editIndex, setEditIndex] = useState<number>(-1)
  const [employeeEditMode, setEmployeeEditMode] = useState<'normal' | 'new-pay'>('normal')
  const [employeeOriginal, setEmployeeOriginal] = useState<EmployeeWallet | null>(null)
  const [teamEditMode, setTeamEditMode] = useState<'normal' | 'new-pay'>('normal')
  const [teamOriginal, setTeamOriginal] = useState<TeamWallet | null>(null)
  const [companyBalance, setCompanyBalance] = useState<string>('0')
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null)
  const [teamEthPrice, setTeamEthPrice] = useState<number | null>(null)
  const [employeeEthPrice, setEmployeeEthPrice] = useState<number | null>(null)
  const [teamPriceLoading, setTeamPriceLoading] = useState(false)
  const [employeePriceLoading, setEmployeePriceLoading] = useState(false)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [showOverviewModal, setShowOverviewModal] = useState(false)
  const [showBackupInfoModal, setShowBackupInfoModal] = useState(false)
  const [companyNetworkName, setCompanyNetworkName] = useState<string>('—')
  const [uploadingPayroll, setUploadingPayroll] = useState(false)
  const [uploadingPaymentHistory, setUploadingPaymentHistory] = useState(false)
  const payrollUploadRef = useRef<HTMLInputElement | null>(null)
  const paymentHistoryUploadRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const fetchBalance = async () => {
      if (!config.company) {
        setCompanyNetworkName('—')
        return
      }
      setLoadingBalance(true)
      try {
        const chainId = await getChainId()
        const network = chainId ? getNetworkByChainId(parseInt(chainId, 16)) : null
        setCompanyNetworkName(network?.name ?? '—')
        const usdcAddress = network?.usdcAddress || ''
        const balance = await getTokenBalance(
          config.company.address,
          usdcAddress,
          config.company.tokenType
        )
        setCompanyBalance(balance)
      } catch (error) {
        console.error('Error fetching balance:', error)
        setCompanyNetworkName('—')
      } finally {
        setLoadingBalance(false)
      }
    }
    fetchBalance()
  }, [config.company?.address, config.company?.tokenType])
  
  // Company form state
  const [companyForm, setCompanyForm] = useState({
    name: '',
    address: '',
    distributionMode: 'direct-to-employees' as 'direct-to-employees' | 'via-teams',
    tokenType: 'USDC' as 'ETH' | 'USDC',
    timeZone: 'UTC'
  })

  // Team form state
  const [teamForm, setTeamForm] = useState({
    name: '',
    address: '',
    paymentType: 'percentage' as 'percentage' | 'fixed',
    percentage: 0,
    fiatCurrency: 'CAD' as FiatCurrency,
    exactEthAmount: '',
    exactFiatAmount: '',
    timeZone: 'UTC'
  })

  // Employee form state
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    address: '',
    paymentType: 'percentage' as 'percentage' | 'fixed',
    percentage: 0,
    fiatCurrency: 'CAD' as FiatCurrency,
    exactEthAmount: '',
    exactFiatAmount: '',
    parentAddress: ''
  })

  const hasCompany = !!config.company
  const isDirect = config.company?.distributionMode === 'direct-to-employees'

  useEffect(() => {
    if (!(formMode === 'add-team' || formMode === 'edit-team')) return
    let active = true

    const load = async () => {
      setTeamPriceLoading(true)
      try {
        const price = await fetchEthPrice(teamForm.fiatCurrency)
        if (active) {
          setTeamEthPrice(price)
        }
      } catch {
        if (active) {
          setTeamEthPrice(null)
        }
      } finally {
        if (active) {
          setTeamPriceLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [formMode, teamForm.fiatCurrency])

  useEffect(() => {
    if (!(formMode === 'add-employee' || formMode === 'edit-employee')) return
    let active = true

    const load = async () => {
      setEmployeePriceLoading(true)
      try {
        const price = await fetchEthPrice(employeeForm.fiatCurrency)
        if (active) {
          setEmployeeEthPrice(price)
        }
      } catch {
        if (active) {
          setEmployeeEthPrice(null)
        }
      } finally {
        if (active) {
          setEmployeePriceLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [formMode, employeeForm.fiatCurrency])

  const handleShowAddCompany = () => {
    setCompanyForm({
      name: '',
      address: '',
      distributionMode: 'direct-to-employees',
      tokenType: 'USDC',
      timeZone: 'UTC'
    })
    setFormMode('add-company')
  }

  const handleShowEditCompany = () => {
    if (!config.company) return
    setCompanyForm({
      name: config.company.name,
      address: config.company.address,
      distributionMode: config.company.distributionMode,
      tokenType: config.company.tokenType,
      timeZone: config.company.timeZone || 'UTC'
    })
    setFormMode('edit-company')
  }

  const handleSaveCompany = () => {
    if (!companyForm.name || !companyForm.address) {
      onNotify?.({
        type: 'warning',
        title: 'Incomplete company setup',
        message: 'Company name and wallet address are required.'
      })
      return
    }
    const company: CompanyWallet = {
      role: 'company',
      name: companyForm.name,
      address: companyForm.address,
      distributionMode: companyForm.distributionMode,
      tokenType: companyForm.tokenType,
      timeZone: companyForm.timeZone
    }
    onChange({ ...config, company })
    onNotify?.(null)
    setFormMode('none')
  }

  const handleShowAddTeam = () => {
    setTeamForm({
      name: '',
      address: '',
      paymentType: 'percentage',
      percentage: 0,
      fiatCurrency: 'CAD',
      exactEthAmount: '',
      exactFiatAmount: '',
      timeZone: companyForm.timeZone
    })
    setFormMode('add-team')
  }

  const handleShowEditTeam = (index: number) => {
    const team = config.teams[index]
    setTeamOriginal(team)
    setTeamEditMode('normal')
    setTeamForm({
      name: team.name,
      address: team.address,
      paymentType: team.paymentType ?? 'percentage',
      percentage: team.percentage,
      fiatCurrency: team.fiatCurrency ?? 'CAD',
      exactEthAmount: team.exactEthAmount ?? '',
      exactFiatAmount: team.exactFiatAmount ?? '',
      timeZone: team.timeZone || config.company?.timeZone || 'UTC'
    })
    setEditIndex(index)
    setFormMode('edit-team')
  }

  const handleStartNewPayTeam = (index: number) => {
    const team = config.teams[index]
    setTeamOriginal(team)
    setTeamEditMode('new-pay')
    setTeamForm({
      name: team.name,
      address: team.address,
      paymentType: team.paymentType ?? 'percentage',
      percentage: team.percentage,
      fiatCurrency: team.fiatCurrency ?? 'CAD',
      exactEthAmount: team.exactEthAmount ?? '',
      exactFiatAmount: team.exactFiatAmount ?? '',
      timeZone: team.timeZone || config.company?.timeZone || 'UTC'
    })
    setEditIndex(index)
    setFormMode('edit-team')
  }

  const handleSaveTeam = () => {
    if (!teamForm.name || !teamForm.address || !config.company) {
      onNotify?.({
        type: 'warning',
        title: 'Incomplete team setup',
        message: 'Team name, wallet address, and company wallet are required.'
      })
      return
    }
    const prev = formMode === 'edit-team' ? config.teams[editIndex] : undefined
    const team: TeamWallet = {
      role: 'team',
      name: teamForm.name,
      address: teamForm.address,
      companyAddress: config.company.address,
      paymentType: teamForm.paymentType,
      percentage: teamForm.percentage,
      fiatCurrency: teamForm.fiatCurrency,
      exactEthAmount: teamForm.exactEthAmount,
      exactFiatAmount: teamForm.exactFiatAmount,
      timeZone: teamForm.timeZone,
      started: teamEditMode === 'new-pay' ? false : (prev?.started ?? false),
      completedAt: teamEditMode === 'new-pay' ? undefined : prev?.completedAt
    }
    if (formMode === 'add-team') {
      onChange({ ...config, teams: [...config.teams, team] })
    } else {
      const updated = [...config.teams]
      updated[editIndex] = team
      onChange({ ...config, teams: updated })
    }
    onNotify?.(null)
    setFormMode('none')
    setEditIndex(-1)
    setTeamEditMode('normal')
    setTeamOriginal(null)
  }

  const handleShowAddEmployee = () => {
    const parentAddr = isDirect && config.company ? config.company.address : ''
    setEmployeeForm({
      name: '',
      address: '',
      paymentType: 'percentage',
      percentage: 0,
      fiatCurrency: 'CAD',
      exactEthAmount: '',
      exactFiatAmount: '',
      parentAddress: parentAddr
    })
    setFormMode('add-employee')
  }

  const handleShowEditEmployee = (index: number) => {
    const emp = config.employees[index]
    setEmployeeOriginal(emp)
    setEmployeeEditMode('normal')
    setEmployeeForm({
      name: emp.name,
      address: emp.address,
      paymentType: emp.paymentType ?? 'percentage',
      percentage: emp.percentage,
      fiatCurrency: emp.fiatCurrency ?? 'CAD',
      exactEthAmount: emp.exactEthAmount ?? '',
      exactFiatAmount: emp.exactFiatAmount ?? '',
      parentAddress: emp.parentAddress
    })
    setEditIndex(index)
    setFormMode('edit-employee')
  }

  const handleStartNewPayEmployee = (index: number) => {
    const emp = config.employees[index]
    setEmployeeOriginal(emp)
    setEmployeeEditMode('new-pay')
    setEmployeeForm({
      name: emp.name,
      address: emp.address,
      paymentType: emp.paymentType ?? 'percentage',
      percentage: emp.percentage,
      fiatCurrency: emp.fiatCurrency ?? 'CAD',
      exactEthAmount: emp.exactEthAmount ?? '',
      exactFiatAmount: emp.exactFiatAmount ?? '',
      parentAddress: emp.parentAddress
    })
    setEditIndex(index)
    setFormMode('edit-employee')
  }

  const handleSaveEmployee = () => {
    if (!employeeForm.name || !employeeForm.address) {
      onNotify?.({
        type: 'warning',
        title: 'Incomplete employee setup',
        message: 'Employee name and wallet address are required.'
      })
      return
    }
    const prev = formMode === 'edit-employee' ? config.employees[editIndex] : undefined
    const employee: EmployeeWallet = {
      role: 'employee',
      name: employeeForm.name,
      address: employeeForm.address,
      paymentType: employeeForm.paymentType,
      percentage: employeeForm.percentage,
      parentAddress: employeeForm.parentAddress,
      fiatCurrency: employeeForm.fiatCurrency,
      exactEthAmount: employeeForm.exactEthAmount,
      exactFiatAmount: employeeForm.exactFiatAmount,
      started: employeeEditMode === 'new-pay' ? false : (prev?.started ?? false),
      completedAt: employeeEditMode === 'new-pay' ? undefined : prev?.completedAt
    }
    if (formMode === 'add-employee') {
      onChange({ ...config, employees: [...config.employees, employee] })
    } else {
      const updated = [...config.employees]
      updated[editIndex] = employee
      onChange({ ...config, employees: updated })
    }
    onNotify?.(null)
    setFormMode('none')
    setEditIndex(-1)
    setEmployeeEditMode('normal')
    setEmployeeOriginal(null)
  }

  const handleRemoveTeam = (addr: string) => {
    onChange({ ...config, teams: config.teams.filter((t) => t.address !== addr) })
  }

  const handleRemoveEmployee = (addr: string) => {
    onChange({ ...config, employees: config.employees.filter((e) => e.address !== addr) })
  }

  const handleTeamEthChange = (value: string) => {
    const eth = Number(value)
    setTeamForm((prev) => ({
      ...prev,
      exactEthAmount: value,
      exactFiatAmount:
        value.trim() === ''
          ? ''
          : Number.isFinite(eth) && teamEthPrice
            ? (eth * teamEthPrice).toFixed(2)
            : prev.exactFiatAmount
    }))
  }

  const handleTeamFiatChange = (value: string) => {
    const fiat = Number(value)
    setTeamForm((prev) => ({
      ...prev,
      exactFiatAmount: value,
      exactEthAmount:
        value.trim() === ''
          ? ''
          : Number.isFinite(fiat) && teamEthPrice && teamEthPrice > 0
            ? (fiat / teamEthPrice).toFixed(6)
            : prev.exactEthAmount
    }))
  }

  const handleEmployeeEthChange = (value: string) => {
    const eth = Number(value)
    setEmployeeForm((prev) => ({
      ...prev,
      exactEthAmount: value,
      exactFiatAmount:
        value.trim() === ''
          ? ''
          : Number.isFinite(eth) && employeeEthPrice
            ? (eth * employeeEthPrice).toFixed(2)
            : prev.exactFiatAmount
    }))
  }

  const handleEmployeeFiatChange = (value: string) => {
    const fiat = Number(value)
    setEmployeeForm((prev) => ({
      ...prev,
      exactFiatAmount: value,
      exactEthAmount:
        value.trim() === ''
          ? ''
          : Number.isFinite(fiat) && employeeEthPrice && employeeEthPrice > 0
            ? (fiat / employeeEthPrice).toFixed(6)
            : prev.exactEthAmount
    }))
  }

  const handleSavePayrollData = () => {
    const payrollFilename = 'coincue-payroll-save.csv'
    const payrollCsv = exportPayrollDataToCSV(config)
    downloadCSV(payrollFilename, payrollCsv)

    const paymentHistoryFilename = 'coincue-payment-history.csv'
    const paymentHistoryCsv = exportPaymentHistoryToCSV(paymentHistory)
    downloadCSV(paymentHistoryFilename, paymentHistoryCsv)

    onNotify?.({
      type: 'success',
      title: 'Payroll data saved successfully.',
      message: 'Payroll data and payment history files have been downloaded.'
    })
  }

  const handlePayrollUpload = async (file: File | undefined) => {
    if (!file) {
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onNotify?.({
        type: 'error',
        title: 'Invalid CSV file. Required columns are missing.',
        message: 'Only .csv files are supported for restore.'
      })
      return
    }

    setUploadingPayroll(true)
    try {
      const result = await importPayrollDataFromCSV(file)
      onChange(result.config)

      if (result.warnings.length > 0) {
        onNotify?.({
          type: 'warning',
          title: 'Payroll data restored successfully.',
          message:
            'Some rows could not be imported because the wallet address or amount was invalid.'
        })
      } else {
        onNotify?.({
          type: 'success',
          title: 'Payroll data restored successfully.',
          message: 'Wallets, names, and payout settings were restored from CSV.'
        })
      }
      setShowRestoreModal(false)
    } catch (error) {
      onNotify?.({
        type: 'error',
        title: 'Invalid CSV file. Required columns are missing.',
        message: error instanceof Error ? error.message : 'Could not import payroll data.'
      })
    } finally {
      setUploadingPayroll(false)
      if (payrollUploadRef.current) {
        payrollUploadRef.current.value = ''
      }
    }
  }

  const handlePaymentHistoryUpload = async (file: File | undefined) => {
    if (!file) {
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onNotify?.({
        type: 'error',
        title: 'Invalid CSV file. Required columns are missing.',
        message: 'Only .csv files are supported for restore.'
      })
      return
    }

    setUploadingPaymentHistory(true)
    try {
      const parsed = await importPaymentHistoryFromCSV(file)
      const merged = mergePaymentHistory(paymentHistory, parsed.history)
      onPaymentHistoryChange(merged.merged)

      if (merged.duplicatesSkipped > 0) {
        onNotify?.({
          type: 'warning',
          title: 'Payment history uploaded successfully.',
          message: 'Duplicate payment history records were skipped.'
        })
      } else if (parsed.warnings.length > 0) {
        onNotify?.({
          type: 'warning',
          title: 'Payment history uploaded successfully.',
          message:
            'Some rows could not be imported because the wallet address or amount was invalid.'
        })
      } else {
        onNotify?.({
          type: 'success',
          title: 'Payment history uploaded successfully.',
          message: 'Imported history has been merged with existing records.'
        })
      }
    } catch (error) {
      onNotify?.({
        type: 'error',
        title: 'Invalid CSV file. Required columns are missing.',
        message: error instanceof Error ? error.message : 'Could not import payment history data.'
      })
    } finally {
      setUploadingPaymentHistory(false)
      if (paymentHistoryUploadRef.current) {
        paymentHistoryUploadRef.current.value = ''
      }
    }
  }

  const overviewEntries = [
    ...config.teams.map((team) => ({
      id: `team-${team.address}`,
      type: 'Team' as const,
      name: team.name,
      walletAddress: team.address,
      paymentMode: (team.paymentType ?? 'percentage') === 'fixed' ? 'Exact' : 'Percentage',
      percentage: team.percentage,
      exactEthAmount: team.exactEthAmount ?? '',
      fiatAmount: team.exactFiatAmount ?? '',
      fiatCurrency: team.fiatCurrency ?? 'CAD',
      parentAddress: team.companyAddress,
      timeZone: team.timeZone ?? 'UTC'
    })),
    ...config.employees.map((employee) => ({
      id: `employee-${employee.address}`,
      type: 'Employee' as const,
      name: employee.name,
      walletAddress: employee.address,
      paymentMode: (employee.paymentType ?? 'percentage') === 'fixed' ? 'Exact' : 'Percentage',
      percentage: employee.percentage,
      exactEthAmount: employee.exactEthAmount ?? '',
      fiatAmount: employee.exactFiatAmount ?? '',
      fiatCurrency: employee.fiatCurrency ?? 'CAD',
      parentAddress: employee.parentAddress,
      timeZone: config.company?.timeZone ?? 'UTC'
    }))
  ]

  const teamCount = config.teams.length
  const employeeCount = config.employees.length
  const totalRecipients = overviewEntries.length
  const globalPayoutModeLabel = config.paymentMode === 'exact' ? 'Exact' : 'Percentage'

  const getParentLabel = (parentAddress: string) => {
    const normalizedParentAddress = parentAddress.trim().toLowerCase()
    if (!normalizedParentAddress) {
      return '—'
    }

    const company = config.company
    if (company && company.address.toLowerCase() === normalizedParentAddress) {
      return `${company.name} (Company) - ${company.address}`
    }

    const team = config.teams.find(
      (candidate) => candidate.address.toLowerCase() === normalizedParentAddress
    )
    if (team) {
      return `${team.name} (Team) - ${team.address}`
    }

    return parentAddress
  }

  const percentageModeEntries = overviewEntries.filter((entry) => entry.paymentMode === 'Percentage')
  const exactModeEntries = overviewEntries.filter((entry) => entry.paymentMode === 'Exact')

  const totalPercentageAllocated = percentageModeEntries.reduce((sum, entry) => {
    return sum + (Number.isFinite(entry.percentage) ? entry.percentage : 0)
  }, 0)

  const totalExactEthAmount = exactModeEntries.reduce((sum, entry) => {
    const parsed = Number(entry.exactEthAmount)
    return Number.isFinite(parsed) && parsed > 0 ? sum + parsed : sum
  }, 0)

  const fiatCurrenciesInUse = Array.from(
    new Set(overviewEntries.map((entry) => entry.fiatCurrency).filter(Boolean))
  )
  const selectedFiatCurrency =
    fiatCurrenciesInUse.length === 1
      ? fiatCurrenciesInUse[0]
      : fiatCurrenciesInUse.length > 1
        ? `Mixed (${fiatCurrenciesInUse.join(', ')})`
        : config.fiatCurrency

  const totalFiatAmount = exactModeEntries.reduce((sum, entry) => {
    const parsed = Number(entry.fiatAmount)
    return Number.isFinite(parsed) && parsed > 0 ? sum + parsed : sum
  }, 0)

  const hasPercentageMismatch =
    percentageModeEntries.length > 0 && Math.abs(totalPercentageAllocated - 100) > 0.01

  const getEntryWarnings = (entry: (typeof overviewEntries)[number]) => {
    const warnings: string[] = []
    if (!entry.name.trim()) {
      warnings.push('Missing name.')
    }
    if (!entry.walletAddress.trim()) {
      warnings.push('Missing wallet address.')
    } else if (!isAddress(entry.walletAddress)) {
      warnings.push('Wallet address may be invalid.')
    }

    if (entry.paymentMode === 'Percentage') {
      if (!Number.isFinite(entry.percentage) || entry.percentage <= 0) {
        warnings.push('This entry is missing a payout amount.')
      }
    } else {
      const exactEth = Number(entry.exactEthAmount)
      const fiat = Number(entry.fiatAmount)
      const hasEth = entry.exactEthAmount.trim() !== ''
      const hasFiat = entry.fiatAmount.trim() !== ''

      if (!hasEth && !hasFiat) {
        warnings.push('This entry is missing a payout amount.')
      }
      if (hasEth && (!Number.isFinite(exactEth) || exactEth <= 0)) {
        warnings.push('Exact ETH amount is invalid.')
      }
      if (hasFiat && (!Number.isFinite(fiat) || fiat <= 0)) {
        warnings.push('Fiat amount is invalid.')
      }
    }

    return warnings
  }

  return (
    <div className="manager-sections">
      <div className="row between manager-header-row">
        <h3 className="section-title manager-title">Configuration</h3>
        <div className="row row-tight backup-actions-row">
          <button className="btn" onClick={() => setShowOverviewModal(true)}>
            Overview
          </button>
          <button className="btn" onClick={handleSavePayrollData}>
            Save Payroll Data
          </button>
          <button className="btn" onClick={() => setShowRestoreModal(true)}>
            Upload Data
          </button>
          <button
            type="button"
            className="btn btn-ghost info-icon-button"
            aria-label="Backup and restore information"
            title="Backup & Restore information"
            onClick={() => setShowBackupInfoModal(true)}
          >
            i
          </button>
        </div>
      </div>

      {showOverviewModal && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowOverviewModal(false)}>
          <section
            className="card restore-modal overview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Payroll Configuration Overview"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row between">
              <strong>Payroll Configuration Overview</strong>
              <div className="row row-tight">
                <button type="button" className="btn" onClick={handleSavePayrollData}>
                  Save Payroll Data
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowOverviewModal(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overview-summary-grid">
              <article className="overview-stat-card">
                <p className="overview-stat-label">Total Recipients</p>
                <p className="overview-stat-value">{totalRecipients}</p>
              </article>
              <article className="overview-stat-card">
                <p className="overview-stat-label">Teams</p>
                <p className="overview-stat-value">{teamCount}</p>
              </article>
              <article className="overview-stat-card">
                <p className="overview-stat-label">Employees</p>
                <p className="overview-stat-value">{employeeCount}</p>
              </article>
              <article className="overview-stat-card">
                <p className="overview-stat-label">Current Payout Mode</p>
                <p className="overview-stat-value">{globalPayoutModeLabel}</p>
              </article>
              <article className="overview-stat-card">
                <p className="overview-stat-label">Total Allocation</p>
                <p className="overview-stat-value">{totalPercentageAllocated.toFixed(2)}%</p>
              </article>
              <article className="overview-stat-card">
                <p className="overview-stat-label">Total Exact ETH</p>
                <p className="overview-stat-value">{totalExactEthAmount.toFixed(6)}</p>
              </article>
              <article className="overview-stat-card">
                <p className="overview-stat-label">Currency</p>
                <p className="overview-stat-value">{selectedFiatCurrency || '—'}</p>
              </article>
              <article className="overview-stat-card">
                <p className="overview-stat-label">Total Fiat Amount</p>
                <p className="overview-stat-value">
                  {totalFiatAmount > 0 ? totalFiatAmount.toFixed(2) : '—'}
                </p>
              </article>
              <article className="overview-stat-card">
                <p className="overview-stat-label">Company Wallet</p>
                <p className="overview-stat-value">{config.company ? 'Connected' : 'Not Connected'}</p>
              </article>
            </div>

            {hasPercentageMismatch && (
              <div className="inline-alert inline-alert-warning" role="status">
                Percentage total is not 100%. Review recipient allocations before sending payments.
              </div>
            )}

            <div className="overview-company-section">
              <div className="row between">
                <strong className="overview-company-title">Company Wallet</strong>
                <span className="overview-badge overview-badge-company">Company Wallet</span>
              </div>

              {!config.company ? (
                <div className="overview-empty-state">
                  <p>No company wallet connected.</p>
                  <p className="muted">
                    Connect or configure a company wallet to display it in the payroll overview.
                  </p>
                </div>
              ) : (
                <article className="overview-entry-card overview-entry-card-company">
                  <div className="overview-entry-address-row">
                    <div className="overview-address-content">
                      <p className="overview-address-label">Company Wallet Address</p>
                      <code className="overview-address-value">{config.company.address}</code>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-copy"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(config.company!.address)
                          onNotify?.({
                            type: 'success',
                            title: 'Address copied',
                            message: 'Company wallet address copied to clipboard.'
                          })
                        } catch {
                          onNotify?.({
                            type: 'error',
                            title: 'Copy failed',
                            message: 'Could not copy company wallet address.'
                          })
                        }
                      }}
                    >
                      Copy
                    </button>
                  </div>

                  <div className="overview-entry-config-row">
                    <p className="overview-entry-line">
                      <strong>Name:</strong> {config.company.name || '—'}
                    </p>
                    <p className="overview-entry-line">
                      <strong>Role:</strong> Company Wallet
                    </p>
                    <p className="overview-entry-line">
                      <strong>Network:</strong> {companyNetworkName}
                    </p>
                    <p className="overview-entry-line">
                      <strong>Balance:</strong>{' '}
                      {loadingBalance
                        ? 'Loading...'
                        : `${companyBalance} ${config.company.tokenType}`}
                    </p>
                    <p className="overview-entry-line">
                      <strong>Status:</strong> Root Wallet
                    </p>
                    <p className="overview-entry-line">
                      <strong>Distribution:</strong>{' '}
                      {config.company.distributionMode === 'direct-to-employees'
                        ? 'Direct to Employees'
                        : 'Via Teams'}
                    </p>
                    <p className="overview-entry-line">
                      <strong>Token:</strong> {config.company.tokenType}
                    </p>
                    <p className="overview-entry-line">
                      <strong>Time Zone:</strong> {config.company.timeZone || '—'}
                    </p>
                  </div>
                </article>
              )}
            </div>

            {overviewEntries.length === 0 ? (
              <div className="overview-empty-state">
                <p>No payroll recipients configured yet.</p>
                <p className="muted">
                  Add a team or employee wallet first, then return here to review the full payroll
                  configuration.
                </p>
              </div>
            ) : (
              <div className="overview-entries">
                {overviewEntries.map((entry) => {
                  const warnings = getEntryWarnings(entry)
                  return (
                    <article className="overview-entry-card" key={entry.id}>
                      <div className="overview-entry-address-row">
                        <div className="overview-address-content">
                          <p className="overview-address-label">Wallet Address</p>
                          <code className="overview-address-value">{entry.walletAddress || '—'}</code>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-copy"
                          onClick={async () => {
                            if (!entry.walletAddress) {
                              return
                            }
                            try {
                              await navigator.clipboard.writeText(entry.walletAddress)
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
                      </div>

                      <div className="overview-entry-config-row">
                        <div className="overview-entry-meta">
                          <span className="overview-badge">{entry.type}</span>
                          <span className="overview-badge overview-badge-mode">{entry.paymentMode}</span>
                        </div>
                        <p className="overview-entry-line">
                          <strong>Name:</strong> {entry.name || '—'}
                        </p>
                        <p className="overview-entry-line">
                          <strong>Share:</strong>{' '}
                          {entry.paymentMode === 'Percentage' ? `${entry.percentage}%` : '—'}
                        </p>
                        <p className="overview-entry-line">
                          <strong>Exact ETH:</strong>{' '}
                          {entry.exactEthAmount && entry.exactEthAmount.trim() !== ''
                            ? entry.exactEthAmount
                            : '—'}
                        </p>
                        <p className="overview-entry-line">
                          <strong>Fiat:</strong>{' '}
                          {entry.fiatAmount && entry.fiatAmount.trim() !== '' ? entry.fiatAmount : '—'}
                        </p>
                        <p className="overview-entry-line">
                          <strong>Currency:</strong> {entry.fiatCurrency || '—'}
                        </p>
                        <p className="overview-entry-line">
                          <strong>Parent:</strong> {getParentLabel(entry.parentAddress)}
                        </p>
                        <p className="overview-entry-line">
                          <strong>Time Zone:</strong> {entry.timeZone || '—'}
                        </p>
                      </div>

                      {warnings.length > 0 && (
                        <div className="overview-entry-warning" role="status">
                          {warnings.map((warning) => (
                            <p key={`${entry.id}-${warning}`}>{warning}</p>
                          ))}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="manager-top-grid">
        {/* Company Section */}
        <section className="card manager-section-card">
          <div className="row between">
            <strong>Company Wallet</strong>
            {!hasCompany && formMode !== 'add-company' && (
              <button className="btn btn-primary" onClick={handleShowAddCompany}>
                Set Company
              </button>
            )}
            {hasCompany && formMode === 'none' && (
              <button className="btn" onClick={handleShowEditCompany}>
                Edit
              </button>
            )}
          </div>

          {/* Company Form */}
          {(formMode === 'add-company' || formMode === 'edit-company') && (
            <div className="grid form-grid form-grid-tight">
              <div className="field">
                <label>Company Name</label>
                <input
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="field">
                <label>Wallet Address</label>
                <input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  placeholder="0x..."
                />
              </div>
              <div className="field">
                <label>Token Type</label>
                <select
                  value={companyForm.tokenType}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, tokenType: e.target.value as 'ETH' | 'USDC' })
                  }
                  className="input-select"
                >
                  <option value="ETH">ETH</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>
              <div className="field">
                <label>Distribution Mode</label>
                <select
                  value={companyForm.distributionMode}
                  onChange={(e) =>
                    setCompanyForm({
                      ...companyForm,
                      distributionMode: e.target.value as 'direct-to-employees' | 'via-teams'
                    })
                  }
                  className="input-select"
                >
                  <option value="direct-to-employees">Direct to Employees</option>
                  <option value="via-teams">Via Teams</option>
                </select>
              </div>
              <div className="field">
                <label>Company Time Zone</label>
                <select
                  value={companyForm.timeZone}
                  onChange={(e) => setCompanyForm({ ...companyForm, timeZone: e.target.value })}
                  className="input-select"
                >
                  {timeZones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row form-actions-full">
                <button className="btn btn-primary" onClick={handleSaveCompany}>
                  {formMode === 'add-company' ? 'Save Company' : 'Update Company'}
                </button>
                <button className="btn" onClick={() => setFormMode('none')}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Company Read-Only Display */}
          {hasCompany && formMode === 'none' && (
            <div className="config-summary">
              <div>
                <strong>{config.company!.name}</strong> ({shortAddress(config.company!.address)})
                <button
                  type="button"
                  className="btn btn-ghost btn-copy wallet-inline-view"
                  onClick={() => setExpandedAddress(expandedAddress === config.company!.address ? null : config.company!.address)}
                >
                  View
                </button>
              </div>
              <div className="muted">
                Token: {config.company!.tokenType} | Distribution: {config.company!.distributionMode === 'direct-to-employees' ? 'Direct to Employees' : 'Via Teams'} | TZ: {config.company!.timeZone}
              </div>
              <div className="muted summary-spacer">
                Balance: {loadingBalance ? 'Loading...' : `${companyBalance} ${config.company!.tokenType}`}
              </div>
              {expandedAddress === config.company!.address && (
                <div className="address-review" role="note" aria-live="polite">
                  <p className="address-review-label">Full wallet address</p>
                  <code className="address-review-value">{config.company!.address}</code>
                </div>
              )}
            </div>
          )}
        </section>

        <div className="manager-right-stack">
          {/* Teams */}
          <section className="card manager-section-card">
        <div className="row between">
          <div>
            <strong>Teams</strong>
          </div>
          {hasCompany && !isDirect && formMode === 'none' && (
            <button className="btn" onClick={handleShowAddTeam}>
              Add Team
            </button>
          )}
        </div>

        {!hasCompany ? (
          <p className="empty-state summary-spacer">Set a company wallet to start configuring teams.</p>
        ) : isDirect ? (
          <p className="empty-state summary-spacer">Team payouts are disabled in direct-to-employees mode.</p>
        ) : (
          <>
            {/* Team Form */}
            {(formMode === 'add-team' || formMode === 'edit-team') && (
              <div className="grid form-grid form-grid-tight">
              <div className="field">
                <label>Team Name</label>
                <input
                  value={teamForm.name}
                  onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                  placeholder="Engineering"
                />
              </div>
              <div className="field">
                <label>Wallet Address</label>
                <input
                  value={teamForm.address}
                  onChange={(e) => setTeamForm({ ...teamForm, address: e.target.value })}
                  placeholder="0x..."
                />
              </div>
              <div className={`field ${teamForm.paymentType === 'fixed' ? 'field-disabled' : ''}`}>
                <label>Pay Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={teamForm.percentage}
                  onChange={(e) => setTeamForm({ ...teamForm, percentage: Number(e.target.value) })}
                  disabled={teamForm.paymentType === 'fixed'}
                />
              </div>
              <div className="row row-tight form-actions-full">
                <span className="muted">Payment Type</span>
                <button
                  type="button"
                  className={`btn payment-type-button ${teamForm.paymentType === 'percentage' ? 'btn-primary' : ''}`}
                  onClick={() => setTeamForm({ ...teamForm, paymentType: 'percentage' })}
                >
                  Percentage
                </button>
                <button
                  type="button"
                  className={`btn payment-type-button ${teamForm.paymentType === 'fixed' ? 'btn-primary' : ''}`}
                  onClick={() => setTeamForm({ ...teamForm, paymentType: 'fixed' })}
                >
                  Fixed
                </button>
              </div>
              {teamForm.paymentType === 'fixed' && (
                <>
                  <div className="field">
                    <label>Fiat Currency</label>
                    <select
                      className="input-select"
                      value={teamForm.fiatCurrency}
                      onChange={(e) => setTeamForm({ ...teamForm, fiatCurrency: e.target.value as FiatCurrency })}
                    >
                      {fiatCurrencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Fixed Pay Amount (ETH, optional)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.000001}
                      value={teamForm.exactEthAmount}
                      onChange={(e) => handleTeamEthChange(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Fixed Pay Amount ({teamForm.fiatCurrency}, optional)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={teamForm.exactFiatAmount}
                      onChange={(e) => handleTeamFiatChange(e.target.value)}
                    />
                    <small className="muted">
                      {teamPriceLoading
                        ? 'Loading ETH conversion...'
                        : teamEthPrice
                          ? `1 ETH = ${teamEthPrice.toFixed(2)} ${teamForm.fiatCurrency}`
                          : 'ETH conversion unavailable. You can still enter ETH directly.'}
                    </small>
                  </div>
                </>
              )}
              <div className="field">
                <label>Team Time Zone</label>
                <select
                  value={teamForm.timeZone}
                  onChange={(e) => setTeamForm({ ...teamForm, timeZone: e.target.value })}
                  className="input-select"
                >
                  {timeZones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row form-actions-full">
                <button className="btn btn-primary" onClick={handleSaveTeam}>
                  {formMode === 'add-team'
                    ? 'Save Team'
                    : teamEditMode === 'new-pay'
                      ? (teamOriginal && teamOriginal.percentage !== teamForm.percentage
                          ? 'Confirm Changes'
                          : 'Confirm')
                      : 'Update Team'}
                </button>
                <button className="btn" onClick={() => setFormMode('none')}>
                  Cancel
                </button>
              </div>
            </div>
            )}

            {/* Teams List */}
            {formMode === 'none' && config.teams.length === 0 && (
              <p className="empty-state summary-spacer">No teams yet. Add a team to split payroll by department or pod.</p>
            )}
            {formMode === 'none' && config.teams.map((t, idx) => (
              <div key={t.address}>
                <div className="row between list-row">
                  <div>
                    {t.name} ({t.percentage}%) - {shortAddress(t.address)} {t.timeZone ? `| TZ: ${t.timeZone}` : ''}
                  </div>
                  <div className="row row-tight">
                    <button
                      type="button"
                      className="btn btn-ghost btn-copy"
                      onClick={() => setExpandedAddress(expandedAddress === t.address ? null : t.address)}
                    >
                      View
                    </button>
                    {t.completedAt && (
                      <button className="btn" onClick={() => handleStartNewPayTeam(idx)}>
                        Start New Pay
                      </button>
                    )}
                    <button className="btn" onClick={() => handleShowEditTeam(idx)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" onClick={() => handleRemoveTeam(t.address)}>
                      Remove
                    </button>
                  </div>
                </div>
                {expandedAddress === t.address && (
                  <div className="address-review" role="note" aria-live="polite">
                    <p className="address-review-label">Full wallet address</p>
                    <code className="address-review-value">{t.address}</code>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
          </section>

          {/* Employees */}
          <section className="card manager-section-card">
        <div className="row between">
          <div>
            <strong>Employees</strong>
          </div>
          {hasCompany && formMode === 'none' && (
            <button className="btn" onClick={handleShowAddEmployee}>
              Add Employee
            </button>
          )}
        </div>

        {!hasCompany ? (
          <p className="empty-state summary-spacer">Set a company wallet to start configuring employees.</p>
        ) : (
          <>
            {/* Employee Form */}
            {(formMode === 'add-employee' || formMode === 'edit-employee') && (
              <div className="grid form-grid form-grid-tight">
              <div className="field">
                <label>Employee Name</label>
                <input
                  value={employeeForm.name}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="field">
                <label>Wallet Address</label>
                <input
                  value={employeeForm.address}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })}
                  placeholder="0x..."
                />
              </div>
              <div className={`field ${employeeForm.paymentType === 'fixed' ? 'field-disabled' : ''}`}>
                <label>Pay Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={employeeForm.percentage}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, percentage: Number(e.target.value) })}
                  disabled={employeeForm.paymentType === 'fixed'}
                />
              </div>
              <div className="row row-tight form-actions-full">
                <span className="muted">Payment Type</span>
                <button
                  type="button"
                  className={`btn payment-type-button ${employeeForm.paymentType === 'percentage' ? 'btn-primary' : ''}`}
                  onClick={() => setEmployeeForm({ ...employeeForm, paymentType: 'percentage' })}
                >
                  Percentage
                </button>
                <button
                  type="button"
                  className={`btn payment-type-button ${employeeForm.paymentType === 'fixed' ? 'btn-primary' : ''}`}
                  onClick={() => setEmployeeForm({ ...employeeForm, paymentType: 'fixed' })}
                >
                  Fixed
                </button>
              </div>
              {employeeForm.paymentType === 'fixed' && (
                <>
                  <div className="field">
                    <label>Fiat Currency</label>
                    <select
                      className="input-select"
                      value={employeeForm.fiatCurrency}
                      onChange={(e) =>
                        setEmployeeForm({ ...employeeForm, fiatCurrency: e.target.value as FiatCurrency })
                      }
                    >
                      {fiatCurrencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Fixed Pay Amount (ETH, optional)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.000001}
                      value={employeeForm.exactEthAmount}
                      onChange={(e) => handleEmployeeEthChange(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Fixed Pay Amount ({employeeForm.fiatCurrency}, optional)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={employeeForm.exactFiatAmount}
                      onChange={(e) => handleEmployeeFiatChange(e.target.value)}
                    />
                    <small className="muted">
                      {employeePriceLoading
                        ? 'Loading ETH conversion...'
                        : employeeEthPrice
                          ? `1 ETH = ${employeeEthPrice.toFixed(2)} ${employeeForm.fiatCurrency}`
                          : 'ETH conversion unavailable. You can still enter ETH directly.'}
                    </small>
                  </div>
                </>
              )}
              {!isDirect && (
                <div className="field">
                  <label>Parent (Team or Company)</label>
                  <select
                    value={employeeForm.parentAddress}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, parentAddress: e.target.value })}
                    className="input-select"
                  >
                    <option value="">Select parent...</option>
                    {config.company && (
                      <option value={config.company.address}>{config.company.name} (Company)</option>
                    )}
                    {config.teams.map((t) => (
                      <option key={t.address} value={t.address}>
                        {t.name} (Team)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="row form-actions-full">
                <button className="btn btn-primary" onClick={handleSaveEmployee}>
                  {formMode === 'add-employee'
                    ? 'Save Employee'
                    : employeeEditMode === 'new-pay'
                      ? (employeeOriginal && employeeOriginal.percentage !== employeeForm.percentage
                          ? 'Confirm Changes'
                          : 'Confirm')
                      : 'Update Employee'}
                </button>
                <button className="btn" onClick={() => setFormMode('none')}>
                  Cancel
                </button>
              </div>
            </div>
            )}

            {/* Employees List */}
            {formMode === 'none' && config.employees.length === 0 && (
              <p className="empty-state summary-spacer">No employees yet. Add at least one recipient to preview payroll distribution.</p>
            )}
            {formMode === 'none' && config.employees.map((e, idx) => (
              <div key={e.address}>
                <div className="row between list-row">
                  <div>
                    {e.name} ({e.percentage}%) - {shortAddress(e.address)}
                  </div>
                  <div className="row row-tight">
                    <button
                      type="button"
                      className="btn btn-ghost btn-copy"
                      onClick={() => setExpandedAddress(expandedAddress === e.address ? null : e.address)}
                    >
                      View
                    </button>
                    {e.completedAt && (
                      <button className="btn" onClick={() => handleStartNewPayEmployee(idx)}>
                        Start New Pay
                      </button>
                    )}
                    <button className="btn" onClick={() => handleShowEditEmployee(idx)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" onClick={() => handleRemoveEmployee(e.address)}>
                      Remove
                    </button>
                  </div>
                </div>
                {expandedAddress === e.address && (
                  <div className="address-review" role="note" aria-live="polite">
                    <p className="address-review-label">Full wallet address</p>
                    <code className="address-review-value">{e.address}</code>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
          </section>

        </div>
      </div>

      {showBackupInfoModal && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowBackupInfoModal(false)}>
          <section
            className="card restore-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Backup and Restore Information"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row between">
              <strong>Backup &amp; Restore</strong>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowBackupInfoModal(false)}
              >
                Close
              </button>
            </div>

            <p className="muted">
              Save Payroll Data downloads your full payroll setup, including recipients, wallet
              addresses, payout settings, and payroll configuration.
            </p>
            <p className="muted">
              Upload Data opens the restore panel where you can import your payroll save CSV and,
              optionally, a payment history CSV.
            </p>
            <p className="muted">
              Save Payroll Data also downloads your full merged payment history as a separate CSV
              file. Imported history never triggers payments automatically; you still review and
              confirm payments manually.
            </p>
          </section>
        </div>
      )}

      {showRestoreModal && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowRestoreModal(false)}>
          <section
            className="card restore-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Restore Data"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row between">
              <strong>Restore Data</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setShowRestoreModal(false)}>
                Close
              </button>
            </div>

            <p className="muted">
              Upload your main payroll save file to restore wallets, names, and payout settings.
              Payment history is optional and can be uploaded separately.
            </p>

            <div className="restore-actions">
              <input
                ref={payrollUploadRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden-file-input"
                onChange={(event) => {
                  void handlePayrollUpload(event.target.files?.[0])
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploadingPayroll}
                onClick={() => payrollUploadRef.current?.click()}
              >
                {uploadingPayroll ? 'Uploading...' : 'Upload Payroll Save File'}
              </button>

              <input
                ref={paymentHistoryUploadRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden-file-input"
                onChange={(event) => {
                  void handlePaymentHistoryUpload(event.target.files?.[0])
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={uploadingPaymentHistory}
                onClick={() => paymentHistoryUploadRef.current?.click()}
              >
                {uploadingPaymentHistory ? 'Uploading...' : 'Upload Payment History File'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
