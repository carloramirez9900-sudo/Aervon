# Automatic USDT BEP-20 Withdrawal Engine (v0.6)

## Rules
- Asset/network: USDT on BNB Smart Chain (BEP-20).
- Minimum withdrawal: `MIN_WITHDRAWAL_USDT` (default 10 USDT).
- Only `USER_AVAILABLE` can be withdrawn. Active principal remains outside available balance until the investment engine releases it after the minimum-cycle rules.
- The platform pays gas. No fixed BNB floor is required: each withdrawal is sent if the operational wallet has enough BNB for that transaction's estimated gas plus the configured margin.
- No fixed USDT reserve is required: a withdrawal is sent when the operational wallet has enough USDT to cover that withdrawal.

## State flow
`REQUESTED -> RESERVED -> QUEUED -> PROCESSING`

From processing:
- insufficient USDT -> `WAITING_LIQUIDITY`
- insufficient BNB -> `WAITING_GAS`
- transaction prepared -> `SIGNED`
- raw transaction accepted/already known -> `BROADCASTED -> CONFIRMING -> CONFIRMED`
- reverted transaction -> `FAILED` and reserved ledger funds return to `USER_AVAILABLE`

Waiting withdrawals are retried automatically.

## Accounting
At request time the amount is reserved:
- decrease `USER_AVAILABLE`
- increase `USER_WITHDRAWAL_PENDING`

At on-chain confirmation:
- debit `USER_WITHDRAWAL_PENDING` (reduce platform liability)
- credit `PLATFORM_TREASURY` (reduce treasury asset)

If a transaction reverts before any token transfer occurs, the reservation is reversed to `USER_AVAILABLE`.

## Idempotency and double-payment protection
- The API accepts an `Idempotency-Key` header.
- Ledger reserve/finalization entries use deterministic idempotency keys.
- The engine signs the exact EVM transaction before broadcast and stores its transaction hash and signed raw payload. If the process stops after signing, it rebroadcasts the *same* transaction rather than creating a second payment.
- A MongoDB signer lease serializes signing across multiple backend instances so that one operational wallet does not allocate the same nonce concurrently.
- The operational withdrawal wallet must not be used manually or by another application; exclusive nonce ownership is required.

## Gas handling
For every withdrawal:
1. Estimate the BEP-20 transfer gas.
2. Read the current BSC gas price.
3. Compute estimated native cost.
4. Add `BSC_WITHDRAWAL_GAS_MARGIN_BPS` (default 1500 = 15%).
5. Compare against the wallet's actual BNB balance.

If the balance is insufficient, status becomes `WAITING_GAS`; no transaction is signed.

## Liquidity handling
If wallet USDT is below the requested amount, status becomes `WAITING_LIQUIDITY`. The user's ledger reservation remains intact and the worker retries later.

## Confirmation
A successful receipt is not finalized immediately. The worker waits for `BSC_WITHDRAWAL_CONFIRMATIONS` (default 12, falling back to `BSC_REQUIRED_CONFIRMATIONS`).

## API
Authenticated endpoints:
- `POST /withdrawals`
  - body: `{ "amount": "25.00", "destination": "0x..." }`
  - optional header: `Idempotency-Key`
- `GET /withdrawals`
- `GET /withdrawals/:id`

## Production key management
`BSC_WITHDRAWAL_PRIVATE_KEY` is supported for the initial implementation. Before holding significant real funds, move signing to KMS/HSM/MPC or a dedicated isolated signer without changing the withdrawal state machine or ledger semantics.
