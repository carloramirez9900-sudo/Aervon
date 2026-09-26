import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { ReferralService } from './referral.service';

@Controller('referrals')
export class ReferralController {
  constructor(private readonly referrals: ReferralService, private readonly auth: AuthService) {}

  @Get('summary')
  async summary(@Headers('authorization') authz?: string) {
    const token = authz?.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    const payload = await this.auth.authenticateAccessToken(token);
    return this.referrals.getSummary(new Types.ObjectId(payload.sub));
  }
}
