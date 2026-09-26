import { Module } from '@nestjs/common';
import { ModelsModule } from '../database/models.module';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminAuditService } from './admin-audit.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminLedgerService } from './admin-ledger.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUsersService } from './admin-users.service';
import { AdminFinanceService } from './admin-finance.service';
import { AdminOperationsService } from './admin-operations.service';

@Module({
  imports:[ModelsModule,AuthModule,LedgerModule,WithdrawalsModule],
  controllers:[AdminController],
  providers:[AdminGuard,AdminAuditService,AdminBootstrapService,AdminLedgerService,AdminDashboardService,AdminUsersService,AdminFinanceService,AdminOperationsService],
  exports:[AdminAuditService],
})
export class AdminModule {}
