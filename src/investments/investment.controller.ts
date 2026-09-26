import { BadRequestException, Body, Controller, Get, Headers, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { CompoundMode } from '../database/schemas';
import { InvestmentService } from './investment.service';

@Controller('investments')
export class InvestmentController {
  constructor(
    private readonly investments: InvestmentService,
    private readonly auth: AuthService,
  ) {}

  private async userId(authz?: string) {
    const token = authz?.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    const payload = await this.auth.authenticateAccessToken(token);
    return new Types.ObjectId(payload.sub);
  }

  private commandId(idempotencyKey?: string) {
    const value = idempotencyKey?.trim();
    if (!value || value.length < 8 || value.length > 160) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    return value;
  }

  @Get('me')
  async me(@Headers('authorization') authz?: string) {
    return this.investments.getOverview(await this.userId(authz));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('activate')
  async activate(
    @Headers('authorization') authz: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { amount?: string },
  ) {
    if (!body.amount) throw new BadRequestException('amount is required');
    try {
      return await this.investments.activate(
        await this.userId(authz),
        new Decimal(body.amount),
        this.commandId(idempotencyKey),
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unable to activate trading');
    }
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('compound')
  async compound(
    @Headers('authorization') authz: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { amount?: string },
  ) {
    if (!body.amount) throw new BadRequestException('amount is required');
    try {
      await this.investments.requestCompound(
        await this.userId(authz),
        new Decimal(body.amount),
        this.commandId(idempotencyKey),
      );
      return this.investments.getOverview(await this.userId(authz));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unable to schedule compound');
    }
  }

  @Patch('compound-mode')
  async compoundMode(
    @Headers('authorization') authz: string | undefined,
    @Body() body: { mode?: CompoundMode },
  ) {
    if (!body.mode || !Object.values(CompoundMode).includes(body.mode)) {
      throw new BadRequestException('mode must be MANUAL or AUTOMATIC');
    }
    return this.investments.setCompoundMode(await this.userId(authz), body.mode);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('stop')
  async stop(
    @Headers('authorization') authz: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    try {
      return await this.investments.requestStop(
        await this.userId(authz),
        this.commandId(idempotencyKey),
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unable to stop trading');
    }
  }
}
