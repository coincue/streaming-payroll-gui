import { describe, expect, it } from 'vitest'
import { clamp, computePayroll, round2 } from './payroll'

describe('payroll math', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1.234)).toBe(1.23)
    expect(round2(1.235)).toBe(1.24)
  })

  it('clamps values', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('computes gross, taxes, net', () => {
    const r = computePayroll({ name: 'A', hours: 40, rate: 25, taxRate: 0.2 })
    expect(r.gross).toBe(1000)
    expect(r.taxes).toBe(200)
    expect(r.net).toBe(800)
  })
})
