# Core implementation v0.3

## Transaction boundaries

Financial mutations run inside MongoDB sessions with snapshot read concern and majority write concern. Each financial event uses an idempotency key.

### Confirmed BEP-20 deposit

`FundsService.creditConfirmedDeposit()` posts:

- DEBIT `PLATFORM_TREASURY`
- CREDIT `USER_AVAILABLE`

The BSC transaction hash is the idempotency source. The future chain listener must call this service only after validating the canonical USDT contract and the required confirmation policy.

### Activate trading

`InvestmentService.activate()` moves:

- DEBIT `USER_AVAILABLE`
- CREDIT `USER_ACTIVE_PRINCIPAL`

The position is `PENDING` until the next complete global cycle.

### Manual compound

`InvestmentService.requestCompound()` moves:

- DEBIT `USER_AVAILABLE`
- CREDIT `USER_PENDING_COMPOUND`

At the next cycle start the pending amount moves to active principal before the participation snapshot is created.

### Cycle settlement

A cycle can settle only when exactly 5 unified simulated trades are `CLOSED`. The product yield rate must be inside the configured 3.5%-5% range.

For each participation:

- product profit is calculated from the participation principal snapshot and the one global cycle yield rate;
- manual mode credits `USER_AVAILABLE`;
- automatic compound mode credits `USER_PENDING_COMPOUND` for the next cycle;
- when a stop is pending, profit is credited to `USER_AVAILABLE`, never compounded;
- a direct referrer receives 3% of the referred user's product profit in `USER_AVAILABLE`;
- after cycle 10 the principal becomes withdrawal-eligible;
- if stop was requested, active principal is released to available after settlement.

Each participant is settled in its own MongoDB transaction so a large cycle can be retried safely without one oversized cluster transaction.

## Unified market records

`MarketTradeService.openTrade()` persists the operation at the time it is opened. A market snapshot includes `observedAt`, exchange, symbol, timeframe, candle timestamps, OHLCV, and is hashed with SHA-256. `observedAt` must be within 15 seconds of `openedAt`.

`MarketTradeService.closeTrade()` calculates PnL from the stored entry price and the exit snapshot. The trade PnL is not forced to equal the product yield.

## HTTP exposure

No financial mutation endpoint is exposed yet. This is deliberate. Authentication, authorization, rate limiting, CSRF/session strategy, and admin permissions must exist before these services are reachable from public HTTP routes.

## Verification status

The source tree was passed through the globally available TypeScript transpiler and all TypeScript files parsed without syntax errors. Full `npm test` / `npm run build` verification still requires project dependencies to be installed. In the current execution environment, `npm install --no-audit --no-fund` timed out before dependencies were available, so no claim is made that the Nest application has completed a full dependency-aware build here.
