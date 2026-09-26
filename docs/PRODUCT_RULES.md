# Product Rules — v0.1

## Financial model
- Asset/network: USDT on BNB Smart Chain (BEP-20).
- Minimum deposit: 5 USDT.
- Minimum withdrawal: 10 USDT.
- The external oil contract is not part of the software domain. It only funds platform treasury liquidity externally.
- User balances are represented by an internal double-entry ledger; no editable `users.balance` is authoritative.

## Unified trading cycles
- One global cycle lasts 24 hours.
- One cycle contains exactly 5 unified market operations.
- All users participating in the same cycle see the same operations, timestamps, sides, entry/exit data and strategy PnL.
- A user who activates trading joins the next complete cycle, never the current partial cycle.
- Market operations are prospective paper/representative trades based on real exchange market data. They must not be fabricated retrospectively to match credited product yield.
- Market strategy PnL and credited product yield remain separate values in the data model.

## Yield
- Configured global product yield per completed daily cycle: 3.5%–5%.
- Every eligible user in a given cycle receives the same rate, proportional to active principal.
- Cycle profit is credited to available balance after cycle completion.

## Principal
- Principal remains active across successive cycles until the user requests trading to stop.
- Principal becomes eligible for withdrawal only after 10 full completed cycles.
- If stop is requested during a running cycle, release occurs after that cycle closes.

## Compound interest
- Profit is not compounded automatically unless the user enables automatic compounding.
- Manual or automatic reinvestment moves available profit to pending compound.
- Pending compound is added to active principal only when the next cycle starts.

## Referrals
- One direct level only in v1.
- Referrer earns 3% of the referred user's realized cycle profit.
- The 3% commission does not reduce the referred user's profit.
- Referral commission is credited directly to the referrer's available balance.

## Withdrawals
- Minimum 10 USDT.
- Normal withdrawals are designed for automatic processing.
- Requests must be idempotent and pass balance, address/network, risk and hot-wallet liquidity checks.
- Withdrawal lifecycle: REQUESTED -> (RISK_HOLD | QUEUED) -> BROADCAST -> CONFIRMED, with FAILED/CANCELLED paths.
- Hot wallet needs BNB to pay BSC gas.

## Security invariants
- Private keys must never be stored in frontend code or plain database fields.
- Signing should be isolated behind KMS/HSM/external signer infrastructure.
- Financial operations use decimal arithmetic, never binary floating point.
- Every balance-changing event must create balanced ledger postings and an auditable reference.
