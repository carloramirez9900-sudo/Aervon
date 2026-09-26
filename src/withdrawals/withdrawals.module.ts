import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModelsModule } from '../database/models.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WithdrawalChainService } from './withdrawal-chain.service';
import { WithdrawalController } from './withdrawal.controller';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalWorkerService } from './withdrawal-worker.service';
import { OperationalSettingsModule } from '../config/operational-settings.module';

@Module({
  imports: [ModelsModule, LedgerModule, AuthModule, OperationalSettingsModule],
  controllers: [WithdrawalController],
  providers: [WithdrawalService, WithdrawalChainService, WithdrawalWorkerService],
  exports: [WithdrawalService, WithdrawalChainService],
})
export class WithdrawalsModule {}
