# OnChain Payroll

A minimal React + TypeScript + Vite app that simulates streaming payout of net payroll over time.

## Quickstart (Windows)

```powershell
# From the project root
npm install
npm run dev
```

Then open the printed local URL (e.g., http://localhost:5173).

## Scripts

- `dev`: start Vite dev server
- `build`: type-check and build production assets
- `preview`: preview the production build
- `test`: run unit tests with Vitest

## Features

- Enter name, hours, rate, and tax rate
- See computed gross, taxes, and net
- Start/stop simulated streaming of net pay over 60s
- Connect/Disconnect MetaMask wallet (EIP-1193)

## Notes

- All values are for demo purposes only. Replace placeholder logic with your actual rules.
- Disconnect clears app state and attempts permission revoke via `wallet_revokePermissions` when supported by MetaMask.
