import { useEffect, useState } from 'react'
import type { PayrollConfig, CompanyWallet, TeamWallet, EmployeeWallet } from '../lib/wallets'
import { validatePercentages } from '../lib/wallets'
import { getTokenBalance } from '../lib/balance'
import { getNetworkByChainId } from '../lib/networks'
import { getChainId } from '../lib/eth'

const timeZones = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Singapore',
  'Asia/Tokyo'
]

type Props = {
  config: PayrollConfig
  onChange: (config: PayrollConfig) => void
}

type FormMode = 'none' | 'add-company' | 'add-team' | 'add-employee' | 'edit-company' | 'edit-team' | 'edit-employee'

export default function WalletManager({ config, onChange }: Props) {
  const [formMode, setFormMode] = useState<FormMode>('none')
  const [editIndex, setEditIndex] = useState<number>(-1)
  const [employeeEditMode, setEmployeeEditMode] = useState<'normal' | 'new-pay'>('normal')
  const [employeeOriginal, setEmployeeOriginal] = useState<EmployeeWallet | null>(null)
  const [teamEditMode, setTeamEditMode] = useState<'normal' | 'new-pay'>('normal')
  const [teamOriginal, setTeamOriginal] = useState<TeamWallet | null>(null)
  const [companyBalance, setCompanyBalance] = useState<string>('0')
  const [loadingBalance, setLoadingBalance] = useState(false)

  useEffect(() => {
    const fetchBalance = async () => {
      if (!config.company) return
      setLoadingBalance(true)
      try {
        const chainId = await getChainId()
        const network = chainId ? getNetworkByChainId(parseInt(chainId, 16)) : null
        const usdcAddress = network?.usdcAddress || ''
        const balance = await getTokenBalance(
          config.company.address,
          usdcAddress,
          config.company.tokenType
        )
        setCompanyBalance(balance)
      } catch (error) {
        console.error('Error fetching balance:', error)
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
    percentage: 0,
    timeZone: 'UTC'
  })

  // Employee form state
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    address: '',
    percentage: 0,
    parentAddress: ''
  })

  const hasCompany = !!config.company
  const isDirect = config.company?.distributionMode === 'direct-to-employees'
  const teamsValid = isDirect || validatePercentages(config.teams)
  const employeesValid = config.employees.length === 0 || validatePercentages(config.employees)

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
      alert('Name and address are required')
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
    setFormMode('none')
  }

  const handleShowAddTeam = () => {
    setTeamForm({ name: '', address: '', percentage: 0, timeZone: companyForm.timeZone })
    setFormMode('add-team')
  }

  const handleShowEditTeam = (index: number) => {
    const team = config.teams[index]
    setTeamOriginal(team)
    setTeamEditMode('normal')
    setTeamForm({ name: team.name, address: team.address, percentage: team.percentage, timeZone: team.timeZone || config.company?.timeZone || 'UTC' })
    setEditIndex(index)
    setFormMode('edit-team')
  }

  const handleStartNewPayTeam = (index: number) => {
    const team = config.teams[index]
    setTeamOriginal(team)
    setTeamEditMode('new-pay')
    setTeamForm({ name: team.name, address: team.address, percentage: team.percentage, timeZone: team.timeZone || config.company?.timeZone || 'UTC' })
    setEditIndex(index)
    setFormMode('edit-team')
  }

  const handleSaveTeam = () => {
    if (!teamForm.name || !teamForm.address || !config.company) {
      alert('Name and address are required')
      return
    }
    const prev = formMode === 'edit-team' ? config.teams[editIndex] : undefined
    const team: TeamWallet = {
      role: 'team',
      name: teamForm.name,
      address: teamForm.address,
      companyAddress: config.company.address,
      percentage: teamForm.percentage,
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
    setFormMode('none')
    setEditIndex(-1)
    setTeamEditMode('normal')
    setTeamOriginal(null)
  }

  const handleShowAddEmployee = () => {
    const parentAddr = isDirect && config.company ? config.company.address : ''
    setEmployeeForm({ name: '', address: '', percentage: 0, parentAddress: parentAddr })
    setFormMode('add-employee')
  }

  const handleShowEditEmployee = (index: number) => {
    const emp = config.employees[index]
    setEmployeeOriginal(emp)
    setEmployeeEditMode('normal')
    setEmployeeForm({
      name: emp.name,
      address: emp.address,
      percentage: emp.percentage,
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
      percentage: emp.percentage,
      parentAddress: emp.parentAddress
    })
    setEditIndex(index)
    setFormMode('edit-employee')
  }

  const handleSaveEmployee = () => {
    if (!employeeForm.name || !employeeForm.address) {
      alert('Name and address are required')
      return
    }
    const prev = formMode === 'edit-employee' ? config.employees[editIndex] : undefined
    const employee: EmployeeWallet = {
      role: 'employee',
      name: employeeForm.name,
      address: employeeForm.address,
      percentage: employeeForm.percentage,
      parentAddress: employeeForm.parentAddress,
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

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Wallet Configuration</h3>

      {/* Company Section */}
      <section style={{ marginBottom: '1rem' }}>
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
          <div className="grid form-grid" style={{ gap: '.75rem', marginTop: '.75rem' }}>
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
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}
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
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}
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
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}
              >
                {timeZones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ gap: '.5rem', gridColumn: '1 / -1' }}>
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
          <div style={{ marginTop: '.5rem', fontSize: '.9rem' }}>
            <div>
              <strong>{config.company!.name}</strong> ({config.company!.address.slice(0, 10)}...)
            </div>
            <div className="muted">
              Token: {config.company!.tokenType} | Distribution: {config.company!.distributionMode === 'direct-to-employees' ? 'Direct to Employees' : 'Via Teams'} | TZ: {config.company!.timeZone}
            </div>
            <div className="muted" style={{ marginTop: '.25rem' }}>
              Balance: {loadingBalance ? 'Loading...' : `${companyBalance} ${config.company!.tokenType}`}
            </div>
          </div>
        )}
      </section>

      {/* Teams */}
      {hasCompany && !isDirect && (
        <section style={{ marginBottom: '1rem' }}>
          <div className="row between">
            <strong>Teams {!teamsValid && <span style={{ color: 'var(--danger)' }}>(% ≠ 100)</span>}</strong>
            {formMode === 'none' && (
              <button className="btn" onClick={handleShowAddTeam}>
                Add Team
              </button>
            )}
          </div>

          {/* Team Form */}
          {(formMode === 'add-team' || formMode === 'edit-team') && (
            <div className="grid form-grid" style={{ gap: '.75rem', marginTop: '.75rem' }}>
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
              <div className="field">
                <label>Pay Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={teamForm.percentage}
                  onChange={(e) => setTeamForm({ ...teamForm, percentage: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Team Time Zone</label>
                <select
                  value={teamForm.timeZone}
                  onChange={(e) => setTeamForm({ ...teamForm, timeZone: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}
                >
                  {timeZones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ gap: '.5rem', gridColumn: '1 / -1' }}>
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
          {formMode === 'none' && config.teams.map((t, idx) => (
            <div key={t.address} className="row between" style={{ marginTop: '.5rem', fontSize: '.9rem' }}>
              <div>
                {t.name} ({t.percentage}%) - {t.address.slice(0, 10)}... {t.timeZone ? `| TZ: ${t.timeZone}` : ''}
              </div>
              <div className="row" style={{ gap: '.25rem' }}>
                {t.completedAt && (
                  <button className="btn" onClick={() => handleStartNewPayTeam(idx)}>
                    Start New Pay
                  </button>
                )}
                <button className="btn" onClick={() => handleShowEditTeam(idx)}>
                  Edit
                </button>
                <button className="btn" onClick={() => handleRemoveTeam(t.address)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Employees */}
      {hasCompany && (
        <section style={{ marginBottom: '1rem' }}>
          <div className="row between">
            <strong>
              Employees {!employeesValid && <span style={{ color: 'var(--danger)' }}>(% ≠ 100)</span>}
            </strong>
            {formMode === 'none' && (
              <button className="btn" onClick={handleShowAddEmployee}>
                Add Employee
              </button>
            )}
          </div>

          {/* Employee Form */}
          {(formMode === 'add-employee' || formMode === 'edit-employee') && (
            <div className="grid form-grid" style={{ gap: '.75rem', marginTop: '.75rem' }}>
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
              <div className="field">
                <label>Pay Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={employeeForm.percentage}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, percentage: Number(e.target.value) })}
                />
              </div>
              {!isDirect && (
                <div className="field">
                  <label>Parent (Team or Company)</label>
                  <select
                    value={employeeForm.parentAddress}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, parentAddress: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}
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
              <div className="row" style={{ gap: '.5rem', gridColumn: '1 / -1' }}>
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
          {formMode === 'none' && config.employees.map((e, idx) => (
            <div key={e.address} className="row between" style={{ marginTop: '.5rem', fontSize: '.9rem' }}>
              <div>
                {e.name} ({e.percentage}%) - {e.address.slice(0, 10)}...
              </div>
              <div className="row" style={{ gap: '.25rem' }}>
                {e.completedAt && (
                  <button className="btn" onClick={() => handleStartNewPayEmployee(idx)}>
                    Start New Pay
                  </button>
                )}
                <button className="btn" onClick={() => handleShowEditEmployee(idx)}>
                  Edit
                </button>
                <button className="btn" onClick={() => handleRemoveEmployee(e.address)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
