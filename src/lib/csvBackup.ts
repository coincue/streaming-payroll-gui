import { isAddress } from 'ethers'
import { createDefaultConfig } from './wallets'
import type {
  CompanyWallet,
  EmployeeWallet,
  FiatCurrency,
  PayrollConfig,
  TeamWallet
} from './wallets'

const FIAT_CURRENCIES: FiatCurrency[] = [
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

const PAYROLL_HEADERS = [
  'type',
  'role',
  'name',
  'walletAddress',
  'parentAddress',
  'companyAddress',
  'distributionMode',
  'tokenType',
  'timeZone',
  'paymentType',
  'percentageShare',
  'exactEthAmount',
  'fiatAmount',
  'fiatCurrency',
  'paymentMode',
  'notes',
  'started',
  'completedAt'
] as const

const PAYMENT_HISTORY_HEADERS = [
  'dateTime',
  'recipientName',
  'walletAddress',
  'ethAmount',
  'fiatAmount',
  'fiatCurrency',
  'transactionHash',
  'blockExplorerUrl',
  'status',
  'paymentMode'
] as const

const REQUIRED_PAYROLL_COLUMNS = ['type', 'name', 'walletaddress'] as const

const REQUIRED_PAYMENT_HISTORY_COLUMNS = [
  'datetime',
  'recipientname',
  'walletaddress',
  'ethamount',
  'status',
  'paymentmode'
] as const

export type PaymentRecordStatus = 'pending' | 'confirmed' | 'failed'
export type PaymentRecordMode = 'percentage' | 'exact'

export type PaymentHistoryRecord = {
  dateTime: string
  recipientName: string
  walletAddress: string
  ethAmount: string
  fiatAmount?: string
  fiatCurrency?: string
  transactionHash: string
  blockExplorerUrl: string
  status: PaymentRecordStatus
  paymentMode: PaymentRecordMode
}

type CsvRow = Record<string, string>

export function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function escapeCSVValue(value: unknown): string {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) {
    return text
  }
  return `"${text.replace(/"/g, '""')}"`
}

export function parseCSV(csvText: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i]

    if (inQuotes) {
      if (char === '"') {
        const next = csvText[i + 1]
        if (next === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    if (char === '\r') {
      continue
    }

    field += char
  }

  row.push(field)
  rows.push(row)

  return rows.filter((entry) => entry.some((col) => col.trim() !== ''))
}

export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function exportPayrollDataToCSV(config: PayrollConfig): string {
  const lines: string[] = [PAYROLL_HEADERS.join(',')]

  if (config.factory) {
    lines.push(
      toCsvLine([
        'factory',
        'factory',
        config.factory.name,
        config.factory.address,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Optional wallet metadata',
        '',
        ''
      ])
    )
  }

  if (config.company) {
    lines.push(
      toCsvLine([
        'company',
        'company',
        config.company.name,
        config.company.address,
        '',
        '',
        config.company.distributionMode,
        config.company.tokenType,
        config.company.timeZone,
        '',
        '',
        '',
        '',
        '',
        '',
        'Company wallet configuration',
        '',
        ''
      ])
    )
  }

  for (const team of config.teams) {
    lines.push(
      toCsvLine([
        'recipient',
        'team',
        team.name,
        team.address,
        '',
        team.companyAddress,
        '',
        '',
        team.timeZone ?? '',
        team.paymentType ?? 'percentage',
        String(team.percentage),
        team.exactEthAmount ?? '',
        team.exactFiatAmount ?? '',
        team.fiatCurrency ?? 'CAD',
        '',
        'Team member',
        String(Boolean(team.started)),
        team.completedAt ?? ''
      ])
    )
  }

  for (const employee of config.employees) {
    lines.push(
      toCsvLine([
        'recipient',
        'employee',
        employee.name,
        employee.address,
        employee.parentAddress,
        '',
        '',
        '',
        '',
        employee.paymentType ?? 'percentage',
        String(employee.percentage),
        employee.exactEthAmount ?? '',
        employee.exactFiatAmount ?? '',
        employee.fiatCurrency ?? 'CAD',
        '',
        'Team member',
        String(Boolean(employee.started)),
        employee.completedAt ?? ''
      ])
    )
  }

  lines.push(
    toCsvLine([
      'config',
      'config',
      'Payroll configuration',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      config.fiatCurrency,
      config.paymentMode,
      'Global payroll configuration',
      '',
      ''
    ])
  )

  return lines.join('\n')
}

export async function importPayrollDataFromCSV(file: File): Promise<{
  config: PayrollConfig
  warnings: string[]
}> {
  const csvText = await file.text()
  const rows = parseCSV(csvText)
  if (rows.length === 0) {
    throw new Error('Invalid CSV file. Required columns are missing.')
  }

  const headers = normalizeHeaders(rows[0])
  validateRequiredColumns(headers, REQUIRED_PAYROLL_COLUMNS)

  let company: CompanyWallet | null = null
  let factoryName = ''
  let factoryAddress = ''
  const teams: TeamWallet[] = []
  const employees: EmployeeWallet[] = []
  const warnings: string[] = []
  let paymentMode: 'percentage' | 'exact' = 'percentage'
  let fiatCurrency: FiatCurrency = 'CAD'

  for (let i = 1; i < rows.length; i += 1) {
    const row = toObjectRow(headers, rows[i])
    const type = normalizeText(row.type).toLowerCase()
    const role = resolvePayrollRole(row)

    if (!type) {
      continue
    }

    if (type === 'config') {
      const mode = normalizeText(row.paymentmode).toLowerCase()
      if (mode === 'percentage' || mode === 'exact') {
        paymentMode = mode
      }
      const configCurrency = asFiatCurrency(row.fiatcurrency)
      if (configCurrency) {
        fiatCurrency = configCurrency
      }
      continue
    }

    if (type === 'factory') {
      if (isAddressLike(row.walletaddress)) {
        factoryAddress = normalizeText(row.walletaddress)
        factoryName = normalizeText(row.name) || 'Factory Wallet'
      } else {
        warnings.push(`Row ${i + 1}: skipped invalid factory wallet address.`)
      }
      continue
    }

    if (type === 'company') {
      const walletAddress = normalizeText(row.walletaddress)
      const name = normalizeText(row.name)
      if (!name || !isAddressLike(walletAddress)) {
        warnings.push(`Row ${i + 1}: skipped invalid company row.`)
        continue
      }

      company = {
        role: 'company',
        name,
        address: walletAddress,
        distributionMode:
          normalizeText(row.distributionmode) === 'via-teams'
            ? 'via-teams'
            : 'direct-to-employees',
        tokenType: normalizeText(row.tokentype) === 'ETH' ? 'ETH' : 'USDC',
        timeZone: normalizeText(row.timezone) || 'UTC'
      }
      continue
    }

    if (type === 'recipient' && role === 'team') {
      const parsed = parseRecipientRow(i + 1, row, 'team')
      if (typeof parsed === 'string') {
        warnings.push(parsed)
        continue
      }

      teams.push({
        role: 'team',
        name: parsed.name,
        address: parsed.walletAddress,
        companyAddress: normalizeText(row.companyaddress),
        percentage: parsed.percentage,
        paymentType: parsed.paymentType,
        fiatCurrency: parsed.fiatCurrency,
        exactEthAmount: parsed.exactEthAmount,
        exactFiatAmount: parsed.fiatAmount,
        timeZone: normalizeText(row.timezone) || 'UTC',
        started: parsed.started,
        completedAt: parsed.completedAt
      })
      continue
    }

    if (type === 'recipient' && role === 'employee') {
      const parsed = parseRecipientRow(i + 1, row, 'employee')
      if (typeof parsed === 'string') {
        warnings.push(parsed)
        continue
      }

      employees.push({
        role: 'employee',
        name: parsed.name,
        address: parsed.walletAddress,
        parentAddress: normalizeText(row.parentaddress),
        percentage: parsed.percentage,
        paymentType: parsed.paymentType,
        fiatCurrency: parsed.fiatCurrency,
        exactEthAmount: parsed.exactEthAmount,
        exactFiatAmount: parsed.fiatAmount,
        started: parsed.started,
        completedAt: parsed.completedAt
      })
      continue
    }

    warnings.push(`Row ${i + 1}: skipped because the row type is unsupported.`)
  }

  if (!company) {
    throw new Error('Invalid CSV file. Required columns are missing.')
  }

  const companyAddress = company.address

  const normalizedTeams = teams.map((team) => ({
    ...team,
    companyAddress: team.companyAddress || companyAddress
  }))

  const validParentAddresses = new Set<string>([
    companyAddress.toLowerCase(),
    ...normalizedTeams.map((team) => team.address.toLowerCase())
  ])

  const normalizedEmployees = employees.map((employee, index) => {
    const parentAddress = employee.parentAddress || companyAddress
    if (!validParentAddresses.has(parentAddress.toLowerCase())) {
      warnings.push(
        `Row ${index + 1}: employee parent was not found, defaulted to company wallet.`
      )
    }
    return {
      ...employee,
      parentAddress: validParentAddresses.has(parentAddress.toLowerCase())
        ? parentAddress
        : companyAddress
    }
  })

  const config = createDefaultConfig()

  return {
    config: {
      ...config,
      factory: factoryAddress
        ? {
            role: 'factory',
            name: factoryName || 'Factory Wallet',
            address: factoryAddress
          }
        : null,
      company,
      teams: normalizedTeams,
      employees: normalizedEmployees,
      paymentMode,
      fiatCurrency
    },
    warnings
  }
}

export function exportPaymentHistoryToCSV(history: PaymentHistoryRecord[]): string {
  const lines = [PAYMENT_HISTORY_HEADERS.join(',')]

  for (const item of history) {
    lines.push(
      toCsvLine([
        item.dateTime,
        item.recipientName,
        item.walletAddress,
        item.ethAmount,
        item.fiatAmount ?? '',
        item.fiatCurrency ?? '',
        item.transactionHash,
        item.blockExplorerUrl,
        item.status,
        item.paymentMode
      ])
    )
  }

  return lines.join('\n')
}

export async function importPaymentHistoryFromCSV(file: File): Promise<{
  history: PaymentHistoryRecord[]
  warnings: string[]
}> {
  const csvText = await file.text()
  const rows = parseCSV(csvText)
  if (rows.length === 0) {
    throw new Error('Invalid CSV file. Required columns are missing.')
  }

  const headers = normalizeHeaders(rows[0])
  validateRequiredColumns(headers, REQUIRED_PAYMENT_HISTORY_COLUMNS)

  const imported: PaymentHistoryRecord[] = []
  const warnings: string[] = []

  for (let i = 1; i < rows.length; i += 1) {
    const row = toObjectRow(headers, rows[i])
    const dateTime = normalizeText(row.datetime)
    const recipientName = normalizeText(row.recipientname)
    const walletAddress = normalizeText(row.walletaddress)
    const ethAmount = normalizeText(row.ethamount)
    const transactionHash = normalizeText(row.transactionhash)
    const blockExplorerUrl = normalizeText(row.blockexplorerurl)
    const status = normalizeText(row.status).toLowerCase()
    const paymentMode = normalizeText(row.paymentmode).toLowerCase()

    if (!dateTime || !recipientName || !isAddressLike(walletAddress)) {
      warnings.push(`Row ${i + 1}: skipped because required fields are invalid.`)
      continue
    }

    const eth = Number(ethAmount)
    if (!Number.isFinite(eth) || eth < 0) {
      warnings.push(`Row ${i + 1}: skipped because ETH amount is invalid.`)
      continue
    }

    if (status !== 'pending' && status !== 'confirmed' && status !== 'failed') {
      warnings.push(`Row ${i + 1}: skipped because payment status is invalid.`)
      continue
    }

    if (paymentMode !== 'percentage' && paymentMode !== 'exact') {
      warnings.push(`Row ${i + 1}: skipped because payment mode is invalid.`)
      continue
    }

    const fiatAmount = normalizeText(row.fiatamount)
    if (fiatAmount) {
      const fiatParsed = Number(fiatAmount)
      if (!Number.isFinite(fiatParsed) || fiatParsed < 0) {
        warnings.push(`Row ${i + 1}: skipped because fiat amount is invalid.`)
        continue
      }
    }

    const fiatCurrency = asFiatCurrency(row.fiatcurrency)
    if (normalizeText(row.fiatcurrency) && !fiatCurrency) {
      warnings.push(`Row ${i + 1}: skipped because fiat currency is invalid.`)
      continue
    }

    imported.push({
      dateTime,
      recipientName,
      walletAddress,
      ethAmount: ethAmount,
      fiatAmount: fiatAmount || undefined,
      fiatCurrency: fiatCurrency ?? undefined,
      transactionHash,
      blockExplorerUrl,
      status,
      paymentMode
    })
  }

  return {
    history: imported,
    warnings
  }
}

export function mergePaymentHistory(
  existing: PaymentHistoryRecord[],
  imported: PaymentHistoryRecord[]
): {
  merged: PaymentHistoryRecord[]
  duplicatesSkipped: number
} {
  const merged = [...existing]
  let duplicatesSkipped = 0

  const txHashes = new Set<string>()
  const fallbackKeys = new Set<string>()

  for (const item of existing) {
    const txHash = item.transactionHash.trim().toLowerCase()
    if (txHash) {
      txHashes.add(txHash)
    }
    fallbackKeys.add(getFallbackDuplicateKey(item))
  }

  for (const item of imported) {
    const txHash = item.transactionHash.trim().toLowerCase()
    if (txHash) {
      if (txHashes.has(txHash)) {
        duplicatesSkipped += 1
        continue
      }
      txHashes.add(txHash)
      merged.push(item)
      fallbackKeys.add(getFallbackDuplicateKey(item))
      continue
    }

    const fallbackKey = getFallbackDuplicateKey(item)
    if (fallbackKeys.has(fallbackKey)) {
      duplicatesSkipped += 1
      continue
    }

    fallbackKeys.add(fallbackKey)
    merged.push(item)
  }

  return {
    merged,
    duplicatesSkipped
  }
}

export function getExplorerUrlForChain(chainId: number | null, transactionHash: string): string {
  if (!transactionHash) {
    return ''
  }
  if (chainId === 8453) {
    return `https://basescan.org/tx/${transactionHash}`
  }
  if (chainId === 84532) {
    return `https://sepolia.basescan.org/tx/${transactionHash}`
  }
  return ''
}

function toCsvLine(values: unknown[]): string {
  return values.map((value) => escapeCSVValue(value)).join(',')
}

function normalizeHeaders(row: string[]): string[] {
  return row.map((header) => normalizeText(header).toLowerCase())
}

function validateRequiredColumns(headers: string[], required: readonly string[]): void {
  const missing = required.filter((column) => !headers.includes(column))
  if (missing.length > 0) {
    throw new Error('Invalid CSV file. Required columns are missing.')
  }
}

function toObjectRow(headers: string[], row: string[]): CsvRow {
  const result: CsvRow = {}
  headers.forEach((header, index) => {
    result[header] = normalizeText(row[index])
  })
  return result
}

function resolvePayrollRole(row: CsvRow): 'team' | 'employee' | '' {
  const role = normalizeText(row.role).toLowerCase()
  if (role === 'team' || role === 'employee') {
    return role
  }

  const type = normalizeText(row.type).toLowerCase()
  if (type === 'team' || type === 'employee') {
    return type
  }

  return ''
}

function parseRecipientRow(
  rowNumber: number,
  row: CsvRow,
  role: 'team' | 'employee'
):
  | {
      name: string
      walletAddress: string
      paymentType: 'percentage' | 'fixed'
      percentage: number
      exactEthAmount: string
      fiatAmount: string
      fiatCurrency: FiatCurrency
      started: boolean
      completedAt?: string
    }
  | string {
  const name = normalizeText(row.name)
  const walletAddress = normalizeText(row.walletaddress)
  if (!name || !isAddressLike(walletAddress)) {
    return `Row ${rowNumber}: skipped because wallet address or name is invalid.`
  }

  const paymentType = normalizeText(row.paymenttype).toLowerCase() === 'fixed'
    ? 'fixed'
    : 'percentage'
  const percentageRaw = normalizeText(row.percentageshare)
  const percentage = percentageRaw ? Number(percentageRaw) : 0
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    return `Row ${rowNumber}: skipped because percentage is invalid.`
  }

  const exactEthAmount = normalizeText(row.exactethamount)
  if (exactEthAmount) {
    const eth = Number(exactEthAmount)
    if (!Number.isFinite(eth) || eth < 0) {
      return `Row ${rowNumber}: skipped because ETH amount is invalid.`
    }
  }

  const fiatAmount = normalizeText(row.fiatamount)
  if (fiatAmount) {
    const fiat = Number(fiatAmount)
    if (!Number.isFinite(fiat) || fiat < 0) {
      return `Row ${rowNumber}: skipped because fiat amount is invalid.`
    }
  }

  const fiatCurrency = asFiatCurrency(row.fiatcurrency) ?? 'CAD'

  const started = normalizeText(row.started).toLowerCase() === 'true'
  const completedAt = normalizeText(row.completedat) || undefined

  return {
    name,
    walletAddress,
    paymentType,
    percentage,
    exactEthAmount,
    fiatAmount,
    fiatCurrency,
    started: role === 'team' ? started : started,
    completedAt
  }
}

function asFiatCurrency(value: string): FiatCurrency | null {
  const currency = normalizeText(value).toUpperCase() as FiatCurrency
  return FIAT_CURRENCIES.includes(currency) ? currency : null
}

function getFallbackDuplicateKey(record: PaymentHistoryRecord): string {
  return `${record.dateTime.trim()}|${record.walletAddress.trim().toLowerCase()}|${record.ethAmount.trim()}`
}

function isAddressLike(value: string): boolean {
  return isAddress(normalizeText(value))
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim()
}