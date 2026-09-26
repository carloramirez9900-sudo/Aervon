import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { WithdrawalService } from './withdrawal.service';

@Controller('withdrawals')
export class WithdrawalController {
  constructor(private readonly withdrawals: WithdrawalService, private readonly auth: AuthService) {}

  private async userId(authz?: string) {
    const token = authz?.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    const payload = await this.auth.authenticateAccessToken(token);
    return new Types.ObjectId(payload.sub);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async request(
    @Headers('authorization') authz: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { amount?: string; destination?: string },
  ) {
    if (!body.amount || !body.destination) throw new BadRequestException('amount and destination are required');
    return this.withdrawals.request(await this.userId(authz), { amount: body.amount, destination: body.destination, idempotencyKey });
  }

  @Get()
  async list(@Headers('authorization') authz?: string) {
    return this.withdrawals.list(await this.userId(authz));
  }

  @Get(':id')
  async get(@Headers('authorization') authz: string | undefined, @Param('id') id: string) {
    return this.withdrawals.get(await this.userId(authz), id);
  }
}
