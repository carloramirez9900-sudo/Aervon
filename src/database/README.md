# MongoDB Atlas persistence

MongoDB Atlas is configured through `MONGODB_URI` and `MONGODB_DB_NAME`.

## Financial integrity rules

- Atlas must run as a replica set / Atlas cluster because ledger posting will use MongoDB multi-document transactions.
- Monetary fields use BSON `Decimal128`; do not use JavaScript `number` for persisted USDT amounts or rates.
- `ledger_transactions.idempotencyKey` is unique to prevent duplicate financial postings.
- `ledger_entries` are append-only by application policy. Corrections must be compensating transactions, never in-place edits.
- A complete financial posting must create the transaction header and all debit/credit entries in one MongoDB session transaction.
- Indexes enforce one participation per user/cycle, one trade sequence per cycle, and one referral commission per referred user/cycle.

Do not connect the application with an Atlas user that has cluster-administration permissions. Use a dedicated least-privilege database user for the application.
