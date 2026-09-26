import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { FundsService } from './funds.service';

@Module({ imports: [LedgerModule], providers: [FundsService], exports: [FundsService] })
export class FundsModule {}
