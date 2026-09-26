import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../database/schemas';
import { normalizePhone } from '../auth/phone';
import { AdminAuditService } from './admin-audit.service';
import { AdminRole } from './admin.types';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly config: ConfigService,
    private readonly audit: AdminAuditService,
  ) {}

  async onModuleInit() {
    if (this.config.get<string>('ADMIN_BOOTSTRAP_ENABLED') !== 'true') return;
    const phoneRaw = this.config.get<string>('ADMIN_BOOTSTRAP_PHONE');
    if (!phoneRaw) return;
    const existingAdmins = await this.users.countDocuments({ adminRoles: { $exists: true, $ne: [] } });
    if (existingAdmins > 0) return;
    let phone: string;
    try { phone = normalizePhone(phoneRaw); } catch { this.logger.error('ADMIN_BOOTSTRAP_PHONE is invalid'); return; }
    const user = await this.users.findOne({ phoneE164: phone });
    if (!user) { this.logger.warn('Bootstrap admin account does not exist yet; register it first'); return; }
    user.adminRoles = [AdminRole.SUPER_ADMIN];
    await user.save();
    await this.audit.record({ action: 'ADMIN_BOOTSTRAPPED', targetType: 'USER', targetId: user._id.toHexString(), after: { adminRoles: user.adminRoles }, reason: 'One-time environment bootstrap' });
    this.logger.warn(`Bootstrapped first SUPER_ADMIN for ${phone}`);
  }
}
