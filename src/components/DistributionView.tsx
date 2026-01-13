
import type { PayrollConfig } from '../lib/wallets'
import { computeDistribution } from '../lib/wallets'

type Props = {
  config: PayrollConfig
  isEmployeeMode?: boolean
  companyBalance?: string
  loadingBalance?: boolean
  connectedAccount?: string | null
  onStartPayment?: (employeeAddress: string, timeZone: string, amount: number) => void
}

export default function DistributionView({
  config,
  isEmployeeMode = false,
  companyBalance,
  loadingBalance,
  connectedAccount,
  onStartPayment
}: Props) {
  // Use companyBalance as the total to distribute
  const totalPay = companyBalance ? parseFloat(companyBalance) : 0
  const distribution = computeDistribution(config, totalPay)

  if (distribution.length === 0) {
    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p className="muted">Configure company and recipients to see distribution.</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>
        Distribution ({
          loadingBalance
            ? 'Loading...'
            : companyBalance
              ? `${companyBalance} ${config.company?.tokenType}`
              : 'No balance'
        })
      </h3>
      {distribution.length > 0 && config.company && (
        <div className="muted" style={{ fontSize: '.9rem', marginBottom: '1rem' }}>
          <strong>Token:</strong> {config.company.tokenType}
        </div>
      )}
      <div className="grid" style={{ gap: '.5rem' }}>
        {distribution.map((d, idx) => {
          const employeeData = config.employees.find((e) => e.address === d.address)
          const teamData = config.teams.find((t) => t.address === d.address)
          const isStarted = employeeData?.started ?? teamData?.started ?? false
          const completedAt = employeeData?.completedAt ?? teamData?.completedAt
          const parentTeam = employeeData?.parentAddress
            ? config.teams.find((t) => t.address === employeeData.parentAddress)
            : undefined
          const timeZone = d.role === 'team' 
            ? (teamData?.timeZone || config.company?.timeZone || 'UTC')
            : (parentTeam?.timeZone || config.company?.timeZone || 'UTC')
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '.5rem',
                background: d.role === 'team' ? 'var(--bg)' : 'transparent',
                borderLeft: d.role === 'employee' ? '3px solid var(--primary)' : 'none',
                paddingLeft: d.role === 'employee' ? '1rem' : '.5rem'
              }}
            >
              <div>
                <strong>{d.name}</strong>
                <span className="muted" style={{ marginLeft: '.5rem', fontSize: '.85rem' }}>
                  ({d.role})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ fontWeight: 600 }}>
                  {companyBalance ? `${d.amount.toFixed(2)} ${config.company?.tokenType}` : '$0'}
                </div>
                {(d.role === 'employee' || d.role === 'team') && !isEmployeeMode && (() => {
                  // Check if connected account matches this team's address (prevent teams from paying themselves)
                  const isOwnTeam = d.role === 'team' && connectedAccount !== null && connectedAccount !== undefined && 
                    d.address.toLowerCase() === connectedAccount.toLowerCase()
                  
                  return (
                    <div className="row" style={{ gap: '.35rem' }}>
                      {completedAt ? (
                        <span className="muted" style={{ fontSize: '.85rem' }}>
                          Done on {completedAt}
                        </span>
                      ) : (
                        <button
                          className={`btn ${isStarted ? 'btn-success' : 'btn-primary'}`}
                          onClick={() => onStartPayment?.(d.address, timeZone, d.amount)}
                          disabled={isStarted || isOwnTeam}
                          style={{
                            padding: '.25rem .5rem',
                            fontSize: '.85rem',
                            minWidth: '120px',
                            background: isStarted ? 'var(--success, #10b981)' : undefined,
                            opacity: isOwnTeam ? 0.5 : 1,
                            cursor: isOwnTeam ? 'not-allowed' : undefined
                          }}
                        >
                          {isStarted ? '✓ Started' : 'Execute Payment'}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
