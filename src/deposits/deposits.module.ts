import { Module } from '@nestjs/common';
import { ModelsModule } from '../database/models.module';
import { FundsModule } from '../funds/funds.module';
import { AuthModule } from '../auth/auth.module';
import { DepositController } from './deposit.controller';
import { DepositService } from './deposit.service';
import { DepositMonitorService } from './deposit-monitor.service';
import { DepositSweepService } from './deposit-sweep.service';
import { DepositSigningClientService } from './deposit-signing-client.service';
import { WalletDerivationService } from './wallet-derivation.service';
import { OperationalSettingsModule } from '../config/operational-settings.module';
@Module({imports:[ModelsModule,FundsModule,AuthModule,OperationalSettingsModule],controllers:[DepositController],providers:[DepositService,DepositMonitorService,DepositSweepService,DepositSigningClientService,WalletDerivationService],exports:[DepositService]})
export class DepositsModule{}
