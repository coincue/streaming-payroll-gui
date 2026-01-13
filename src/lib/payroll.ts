export type PayrollInput = {
  name: string
  hours: number
  rate: number
  taxRate: number // 0..1
}

export type PayrollResult = {
  gross: number
  taxes: number
  net: number
}

export function computePayroll(input: PayrollInput): PayrollResult {
  const hours = clamp(input.hours, 0, 1000)
  const rate = clamp(input.rate, 0, 10000)
  const taxRate = clamp(input.taxRate, 0, 1)
  const gross = round2(hours * rate)
  const taxes = round2(gross * taxRate)
  const net = round2(gross - taxes)
  return { gross, taxes, net }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min))
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
