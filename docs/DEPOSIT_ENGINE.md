# Deposit Engine — USDT BEP-20

## Implemented flow

1. Authenticated user requests `GET /deposits/address`.
2. The backend allocates one unique HD derivation index and address for that user.
3. `DepositMonitorService` scans only the configured USDT token contract on BNB Smart Chain (chainId 56).
4. Transfer events are uniquely identified by `(txHash, logIndex)`.
5. Deposits wait for `BSC_REQUIRED_CONFIRMATIONS` and the transaction receipt/block hash is checked before crediting.
6. Confirmed deposits are credited to the internal double-entry ledger idempotently.
7. The minimum is 5 USDT. Confirmed sub-minimum transfers remain `BELOW_MINIMUM`; once confirmed pending transfers for the user total at least 5 USDT, they are credited individually and idempotently.
8. Credited deposits enter `SWEEP_PENDING`.
9. Gas Station tops the deposit address up with BNB only when required for the token transfer.
10. Sweeper transfers the address's USDT balance to `BSC_TREASURY_ADDRESS` and marks only the deposits present in that sweep batch as `SWEPT`.

## Collections

- `deposit_addresses`
- `blockchain_deposits`
- `chain_cursors`
- `wallet_index_counters`
- existing `ledger_*` collections

## Security model

MongoDB stores `userId`, public deposit address, derivation index and blockchain events. It does **not** store deposit private keys.

From v1.9, the public API **requires** `BSC_DEPOSIT_XPUB` and cannot derive private keys. A separate private Railway signer holds the matching mnemonic, restricts signing to the configured USDT token and Treasury, and persists signatures idempotently. See `docs/V1.9_ISOLATED_DEPOSIT_SIGNER.md`. A software-isolated signer is not an HSM. The existing gas and withdrawal wallet keys still require separate hardening.

`BSC_USDT_CONTRACT` is mandatory and must be set to the token contract the operator has independently verified for BNB Smart Chain. The code never trusts token symbol/name.

## Endpoints

- `GET /deposits/address` — authenticated; returns the user's unique BSC USDT deposit address.
- `GET /deposits/history` — authenticated; returns up to 100 recent deposit records.

## Production requirements before enabling real funds

- Set and independently verify `BSC_USDT_CONTRACT`.
- Set `BSC_DEPOSIT_START_BLOCK` before the monitor begins processing production deposits.
- Use a reliable BSC RPC provider and monitoring/alerting.
- Configure and test the private isolated signer using `docs/V1.9_ISOLATED_DEPOSIT_SIGNER.md`; for meaningful funds use KMS/HSM/MPC and independent security review.
- Fund Gas Wallet with a limited BNB operating balance only.
- Keep Treasury separate from Gas Wallet and withdrawal hot wallet.
- Test on BSC testnet or a controlled fork before mainnet.
