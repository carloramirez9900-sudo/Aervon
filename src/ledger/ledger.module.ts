import { Module } from '@nestjs/common';
import { ModelsModule } from '../database/models.module';
import { LedgerService } from './ledger.service';

@Module({
  imports: [ModelsModule],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
