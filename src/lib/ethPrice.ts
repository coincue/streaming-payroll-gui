import type { FiatCurrency } from './wallets'

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=cad,usd,eur,gbp,aud,nzd,jpy,chf,sgd,hkd,inr,php,mxn,brl,zar'

export async function fetchEthPrice(currency: FiatCurrency): Promise<number> {
  const response = await fetch(COINGECKO_URL)
  if (!response.ok) {
    throw new Error('Failed to fetch ETH price')
  }

  const data = (await response.json()) as {
    ethereum?: Record<string, number>
  }

  const key = currency.toLowerCase()
  const value = data?.ethereum?.[key]
  if (!value || !Number.isFinite(value)) {
    throw new Error(`ETH price unavailable for ${currency}`)
  }

  return value
}
