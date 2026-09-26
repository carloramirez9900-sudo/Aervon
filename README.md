# Unified Investment Platform — Backend Core

Backend base del producto acordado. Esta versión usa **MongoDB Atlas + Mongoose**. Todavía no incluye registro/login ni panel de administración; esos módulos se agregarán después sobre este dominio.

## Reglas codificadas

- USDT sobre BNB Smart Chain (BEP-20) como red inicial.
- Depósito mínimo configurable: 5 USDT.
- Retiro mínimo configurable: 10 USDT.
- Activación de trading entra en el siguiente ciclo completo.
- Ciclo global de 24 horas con 5 operaciones unificadas.
- Todos los participantes del mismo ciclo reciben la misma tasa global de rendimiento del producto.
- Rango configurado: 3.5% a 5% por ciclo diario.
- Ganancias pasan a saldo disponible al cierre.
- Reinversión manual o automática se incorpora al principal del siguiente ciclo.
- Principal elegible para retiro después de 10 ciclos completos; no se libera a mitad de un ciclo activo.
- Referidos: un nivel, 3% de la ganancia del referido, acreditado como saldo disponible.
- Ledger de doble entrada como fuente de verdad.
- Las operaciones de mercado son paper/representativas y se registran prospectivamente con snapshots verificables; no se fabrican retrospectivamente para igualar el rendimiento del producto.

## Base de datos

MongoDB Atlas mediante Mongoose. Los importes financieros persistidos usan BSON `Decimal128` y los cálculos de dominio usan `decimal.js`.

Las escrituras del ledger deben ejecutarse mediante transacciones MongoDB multi-documento, con `writeConcern: majority` e idempotency keys. Atlas soporta las transacciones requeridas.

## Arranque local

```bash
cp .env.example .env
npm install
npm test
npm run build
npm run start:dev
```

Configura en `.env`:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.example.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=unified_investment
```

En Atlas debes:

1. Crear un cluster.
2. Crear un usuario de base de datos de aplicación con privilegios mínimos necesarios.
3. Autorizar la IP del servidor en Network Access.
4. Copiar la connection string SRV en `MONGODB_URI`.
5. No guardar credenciales reales dentro del repositorio.

## Persistencia

Los esquemas están en:

```text
src/database/schemas/
```

Colecciones principales:

```text
users
ledger_accounts
ledger_transactions
ledger_entries
trading_cycles
unified_trades
cycle_participations
referral_commissions
withdrawals
```

## Próximas capas

1. Servicios transaccionales del ledger y orquestación de cierre de ciclo.
2. Adaptador BSC para depósitos/retiros y monitor de gas BNB.
3. Market data adapter (exchange) y scheduler de las 5 operaciones.
4. Registro/login y seguridad de cuenta.
5. Panel del usuario.
6. Panel administrativo y Risk Engine.

## Core transaccional implementado en v0.3

- `FundsService.creditConfirmedDeposit`: acredita un depósito confirmado usando `txHash` como idempotency key.
- `InvestmentService.activate`: mueve saldo disponible a principal activo y programa entrada para el próximo ciclo completo.
- `InvestmentService.requestCompound`: mueve ganancias disponibles a reinversión pendiente.
- `InvestmentService.requestStop`: exige 10 ciclos completos y libera el principal inmediatamente si no hay ciclo activo, o al cierre del ciclo actual.
- `CycleService.startCycle`: incorpora posiciones elegibles y aplica la reinversión pendiente antes de fijar el principal del ciclo.
- `CycleService.closeCycle`: exige exactamente 5 operaciones simuladas cerradas, acredita el yield global, paga el 3% al referido y actualiza el bloqueo del principal.
- `MarketTradeService`: abre/cierra operaciones representativas usando snapshots de mercado registrados prospectivamente y calcula el PnL a partir del entry/exit real del snapshot.

Estos servicios son de dominio/aplicación y todavía no se exponen como endpoints públicos. Es intencional: registro/login, autorización y panel admin se implementarán antes de permitir mutaciones financieras por HTTP.

## Authentication v0.4

Registration and login are implemented with phone number + Telegram verification.

Main endpoints:

- `POST /auth/register/start`
- `POST /auth/register/status`
- `POST /auth/register/complete`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/telegram/webhook`

See `docs/AUTH_IMPLEMENTATION.md` for the full flow and security rules.

## v0.5 — USDT BEP-20 deposits

The backend now includes a unique HD-derived BSC deposit address per user, on-chain USDT Transfer monitoring, configurable confirmations, idempotent ledger crediting, sub-minimum accumulation, BNB gas top-up and automatic sweeping to Treasury. See `docs/DEPOSIT_ENGINE.md` before enabling real funds.


## v0.6 Automatic withdrawals
Automatic USDT BEP-20 withdrawals are implemented with ledger reservation, liquidity/gas waiting states, signed-transaction recovery, MongoDB signer locking, and on-chain confirmation reconciliation. See `docs/WITHDRAWAL_ENGINE.md`.

## v0.7 simulated unified trading cycle

The backend now includes an autonomous 24-hour UTC cycle engine with exactly 5 **simulated** unified trades per cycle. The engine allocates the configured cycle yield across those five simulated trades, persists varied scheduled open/close times, records public market reference prices, exposes OPEN/CLOSED history, and settles the cycle through the existing ledger.

This phase intentionally does **not** expose platform-wide capital totals or user-count metrics.

Authenticated endpoints:

- `GET /trading/current`
- `GET /trading/history?limit=50`

The API explicitly identifies these records as simulated execution. Public exchange prices are reference data, not exchange fills.

## v0.8 — 5 trades and user PnL in USDT

The cycle engine is fixed to 5 simulated unified trades per 24-hour cycle. Authenticated trading responses include the global trade PnL rate plus the user's individual `pnlUsdt`, calculated from the principal captured for that user's cycle participation. No total-platform capital or total-user counters are exposed in this phase.

## v0.9 — Consolidated user dashboard

Authenticated endpoint `GET /dashboard` returns the user-scoped balances, lifetime earnings, principal-lock progress, current 24h cycle, all 5 cycle trades with per-user USDT PnL, and recent closed trades. Global platform capital and global user-count metrics remain disabled in this phase. See `docs/V0.9_DASHBOARD_API.md`.

## AERVON frontend (v1.0)

A mobile-first React/Vite frontend is included in `frontend/` with login, Telegram registration flow and the user dashboard. See `docs/V1.0_FRONTEND.md`.

## Administration backend (v1.4)

The backend includes RBAC-protected `/admin/*` APIs for operations, finance, support and audit workflows. Administrator access is revalidated against MongoDB on every admin request, including session revocation state. See `docs/V1.4_ADMIN_BACKEND.md` for roles, endpoints, first-admin bootstrap and safety constraints.


## v1.9 — Private deposit signer

Deposit address generation uses only an XPUB in the public API. The HD mnemonic resides exclusively in a separate Railway-private signer, with a narrow Treasury-only USDT signing policy and durable signed-transaction recovery. **Do not enable real funds until build, integration tests, security review and full key isolation are complete.** See `docs/V1.9_ISOLATED_DEPOSIT_SIGNER.md`.
