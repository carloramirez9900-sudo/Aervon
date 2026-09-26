import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { DepositService } from './deposit.service';
@Controller('deposits')
export class DepositController {
  constructor(private readonly deposits: DepositService, private readonly auth: AuthService) {}
  private async userId(authz?:string){ const token=authz?.startsWith('Bearer ')?authz.slice(7):null; if(!token) throw new UnauthorizedException(); const p=await this.auth.authenticateAccessToken(token); return new Types.ObjectId(p.sub); }
  @Get('address') async address(@Headers('authorization') a?:string){ return this.deposits.getOrCreateAddress(await this.userId(a)); }
  @Get('history') async history(@Headers('authorization') a?:string){ return this.deposits.listForUser(await this.userId(a)); }
}
