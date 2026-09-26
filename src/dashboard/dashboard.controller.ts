import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async get(@Headers('authorization') authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    const payload = await this.auth.authenticateAccessToken(token);
    return this.dashboard.getDashboard(new Types.ObjectId(payload.sub));
  }
}
