import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TelegramUpdate } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  private async access(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    return this.auth.authenticateAccessToken(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/start')
  startRegistration(@Body() body: { phone?: string; referralCode?: string }) {
    if (!body.phone) throw new BadRequestException('Phone is required');
    return this.auth.startRegistration({ phone: body.phone, referralCode: body.referralCode });
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('register/status')
  registrationStatus(@Body() body: { registrationToken?: string }) {
    if (!body.registrationToken) throw new BadRequestException('registrationToken is required');
    return this.auth.registrationStatus(body.registrationToken);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/complete')
  completeRegistration(@Body() body: { registrationToken?: string; password?: string; preferredLanguage?: 'en' | 'es' }, @Req() req: Request) {
    if (!body.registrationToken || !body.password) throw new BadRequestException('registrationToken and password are required');
    return this.auth.completeRegistration(
      { registrationToken: body.registrationToken, password: body.password, preferredLanguage: body.preferredLanguage },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() body: { phone?: string; password?: string }, @Req() req: Request) {
    if (!body.phone || !body.password) throw new BadRequestException('Phone and password are required');
    return this.auth.login({ phone: body.phone, password: body.password }, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() body: { refreshToken?: string }, @Req() req: Request) {
    if (!body.refreshToken) throw new UnauthorizedException('refreshToken is required');
    return this.auth.refresh(body.refreshToken, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@Body() body: { refreshToken?: string }): Promise<void> {
    if (body.refreshToken) await this.auth.logout(body.refreshToken);
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    return this.access(authorization);
  }

  @Get('profile')
  async profile(@Headers('authorization') authorization?: string) {
    const payload = await this.access(authorization);
    return this.auth.profile(payload.sub);
  }

  @Patch('preferences/language')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async updateLanguage(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { language?: string },
  ) {
    const payload = await this.access(authorization);
    if (body.language !== 'en' && body.language !== 'es') {
      throw new BadRequestException('language must be en or es');
    }
    return this.auth.updateLanguage(payload.sub, body.language);
  }

  @Get('sessions')
  async sessions(@Headers('authorization') authorization?: string) {
    const payload = await this.access(authorization);
    return this.auth.listSessions(payload.sub, payload.sid);
  }

  @HttpCode(204)
  @Delete('sessions/:id')
  async revokeSession(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<void> {
    const payload = await this.access(authorization);
    if (payload.sid === id) throw new BadRequestException('Use logout to close the current session');
    await this.auth.revokeSession(payload.sub, id);
  }

  @HttpCode(204)
  @Post('sessions/revoke-others')
  async revokeOthers(@Headers('authorization') authorization?: string): Promise<void> {
    const payload = await this.access(authorization);
    await this.auth.revokeOtherSessions(payload.sub, payload.sid);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('password/change')
  async changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { currentPassword?: string; newPassword?: string },
    @Req() req: Request,
  ) {
    const payload = await this.access(authorization);
    if (!body.currentPassword || !body.newPassword) throw new BadRequestException('Current and new password are required');
    return this.auth.changePassword(payload.sub, { currentPassword: body.currentPassword, newPassword: body.newPassword }, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @HttpCode(200)
  @Post('telegram/webhook')
  async telegramWebhook(
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (!expected || secretHeader !== expected) throw new UnauthorizedException();
    await this.auth.handleTelegramUpdate(update);
    return { ok: true };
  }
}
