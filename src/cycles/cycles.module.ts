import { Module } from '@nestjs/common';
import { ModelsModule } from '../database/models.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AuthModule } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { CycleService } from './cycle.service';
import { SimulatedTradingService } from './simulated-trading.service';
import { CycleOrchestratorService } from './cycle-orchestrator.service';
import { CycleController } from './cycle.controller';
import { OperationalSettingsModule } from '../config/operational-settings.module';

@Module({
  imports: [ModelsModule, LedgerModule, AuthModule, MarketModule, OperationalSettingsModule],
  controllers: [CycleController],
  providers: [CycleService, SimulatedTradingService, CycleOrchestratorService],
  exports: [CycleService, SimulatedTradingService],
})
export class CyclesModule {}
