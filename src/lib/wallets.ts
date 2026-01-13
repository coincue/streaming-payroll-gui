export type WalletRole = 'factory' | 'company' | 'team' | 'employee'

export type FactoryWallet = {
  role: 'factory'
  address: string
  name: string
}

export type CompanyWallet = {
  role: 'company'
  address: string
  name: string
  distributionMode: 'direct-to-employees' | 'via-teams'
  tokenType: 'ETH' | 'USDC'
  timeZone: string
}

export type TeamWallet = {
  role: 'team'
  address: string
  name: string
  companyAddress: string
  percentage: number // 0-100, share of company funds
  timeZone?: string
  started?: boolean // Whether payment distribution has been started for this team
  completedAt?: string // ISO string of completion time in company/team time zone
}

export type EmployeeWallet = {
  role: 'employee'
  address: string
  name: string
  parentAddress: string // company or team
  percentage: number // 0-100, share of parent funds
  started: boolean // Whether payment distribution has been started for this employee
  hours?: number
  rate?: number
  completedAt?: string // ISO string of completion time in company/team time zone
}

export type Wallet = FactoryWallet | CompanyWallet | TeamWallet | EmployeeWallet

export type PayrollConfig = {
  factory: FactoryWallet | null
  company: CompanyWallet | null
  teams: TeamWallet[]
  employees: EmployeeWallet[]
}

export function createDefaultConfig(): PayrollConfig {
  return {
    factory: null,
    company: null,
    teams: [],
    employees: []
  }
}

export function validatePercentages(items: { percentage: number }[]): boolean {
  const total = items.reduce((sum, item) => sum + item.percentage, 0)
  return Math.abs(total - 100) < 0.01
}

export function distributeAmount(
  totalAmount: number,
  recipients: { address: string; percentage: number; name: string }[]
): { address: string; name: string; amount: number }[] {
  return recipients.map((r) => ({
    address: r.address,
    name: r.name,
    amount: (totalAmount * r.percentage) / 100
  }))
}

export function computeDistribution(config: PayrollConfig, totalPay: number) {
  const result: { address: string; name: string; role: WalletRole; amount: number }[] = []

  if (!config.company) return result

  if (config.company.distributionMode === 'direct-to-employees') {
    // Company -> Employees
    const companyEmployees = config.employees.filter(
      (e) => e.parentAddress === config.company!.address
    )
    const dist = distributeAmount(totalPay, companyEmployees)
    dist.forEach((d) => result.push({ ...d, role: 'employee' }))
  } else {
    // Company -> Teams -> Employees
    const teamDist = distributeAmount(totalPay, config.teams)
    teamDist.forEach((td) => {
      result.push({ ...td, role: 'team' })
      const teamEmployees = config.employees.filter((e) => e.parentAddress === td.address)
      const empDist = distributeAmount(td.amount, teamEmployees)
      empDist.forEach((ed) => result.push({ ...ed, role: 'employee' }))
    })
  }

  return result
}
