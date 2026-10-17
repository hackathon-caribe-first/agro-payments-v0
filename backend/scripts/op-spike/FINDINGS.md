# Open Payments testnet spike: findings

Run: `cd backend/scripts/op-spike && pnpm install && pnpm spike` (see `.env.example`). Fill after running.

| ID | Hypothesis | Result | Evidence | Adapter implication |
|---|---|---|---|---|
| a | Outgoing grant with `debitAmount` and no interval enforces a hard cap; over-cap payment is rejected | TBD (confirmed / refuted) | TBD (paste log) | TBD |
| b | Revoking the grant (`grant.cancel`) blocks later payments | TBD (confirmed / refuted) | TBD | TBD |
| c | Fixed `receiveAmount` quote fits in the cap; debit may differ from receive (fees/FX) | TBD (confirmed / refuted) | TBD (debit vs receive) | TBD |
| d | Interaction `hash` follows GNAP; which grant endpoint form (with/without trailing `/`) the AS uses | TBD | TBD (spike logs both) | TBD |

## Notes
- Wallet, asset code/scale: TBD
- Settlement latency / polling needs (en_cola -> completado): TBD
