import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { ModelsModule } from './database/models.module';
import { LedgerModule } from './ledger/ledger.module';
import { InvestmentsModule } from './investments/investments.module';
import { CyclesModule } from './cycles/cycles.module';
import { FundsModule } from './funds/funds.module';
import { MarketModule } from './market/market.module';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DepositsModule } from './deposits/deposits.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReferralsModule } from './referrals/referrals.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    DatabaseModule,
    ModelsModule,
    LedgerModule,
    InvestmentsModule,
    CyclesModule,
    FundsModule,
    MarketModule,
    AuthModule,
    DepositsModule,
    WithdrawalsModule,
    DashboardModule,
    ReferralsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
