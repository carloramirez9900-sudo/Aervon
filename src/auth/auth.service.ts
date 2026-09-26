import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import {
  AuthSession,
  AuthSessionDocument,
  User,
  UserDocument,
  UserStatus,
  VerificationChallenge,
  VerificationChallengeDocument,
  VerificationChallengeStatus,
} from '../database/schemas';
import { generateReferralCode, randomToken, sha256 } from './auth.crypto';
import { normalizePhone } from './phone';
import { AuthRequestMetadata, TelegramUpdate } from './auth.types';
import { TelegramService } from './telegram.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(VerificationChallenge.name) private readonly challenges: Model<VerificationChallengeDocument>,
    @InjectModel(AuthSession.name) private readonly sessions: Model<AuthSessionDocument>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly telegram: TelegramService,
  ) {}

  async startRegistration(input: { phone: string; referralCode?: string | null }) {
    const phoneE164 = normalizePhone(input.phone);
    if (await this.users.exists({ phoneE164 })) throw new ConflictException('Phone number is already registered');

    let referralCode: string | null = null;
    if (input.referralCode) {
      referralCode = input.referralCode.trim().toUpperCase();
      if (!(await this.users.exists({ referralCode }))) throw new BadRequestException('Invalid referral code');
    }

    const token = randomToken(32);
    const ttlMinutes = Number(this.config.get<string>('REGISTRATION_CHALLENGE_TTL_MINUTES') ?? 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.challenges.create({
      tokenHash: sha256(token),
      phoneE164,
      referralCode,
      status: VerificationChallengeStatus.PENDING_TELEGRAM,
      expiresAt,
    });

    return {
      registrationToken: token,
      telegramDeepLink: this.telegram.getDeepLink(token),
      expiresAt,
    };
  }

  async registrationStatus(registrationToken: string) {
    const challenge = await this.getUsableChallenge(registrationToken);
    return {
      status: challenge.status,
      telegramVerified: challenge.status === VerificationChallengeStatus.TELEGRAM_VERIFIED,
      expiresAt: challenge.expiresAt,
    };
  }

  async completeRegistration(input: { registrationToken: string; password: string; preferredLanguage?: 'en' | 'es' }, meta: AuthRequestMetadata) {
    this.validatePassword(input.password);
    if (input.preferredLanguage !== undefined && input.preferredLanguage !== 'en' && input.preferredLanguage !== 'es') {
      throw new BadRequestException('Unsupported language');
    }
    const challenge = await this.getUsableChallenge(input.registrationToken);
    if (challenge.status !== VerificationChallengeStatus.TELEGRAM_VERIFIED || !challenge.telegramUserId || !challenge.verifiedAt) {
      throw new BadRequestException('Telegram verification is required');
    }

    if (await this.users.exists({ phoneE164: challenge.phoneE164 })) throw new ConflictException('Phone number is already registered');
    if (await this.users.exists({ telegramUserId: challenge.telegramUserId })) throw new ConflictException('Telegram account is already registered');

    const referrer = challenge.referralCode
      ? await this.users.findOne({ referralCode: challenge.referralCode }).select('_id')
      : null;

    const passwordHash = await bcrypt.hash(input.password, 12);
    let referralCode = generateReferralCode();
    while (await this.users.exists({ referralCode })) referralCode = generateReferralCode();

    const user = await this.users.create({
      phoneE164: challenge.phoneE164,
      passwordHash,
      telegramUserId: challenge.telegramUserId,
      telegramUsername: challenge.telegramUsername,
      phoneVerifiedAt: challenge.verifiedAt,
      telegramVerifiedAt: challenge.verifiedAt,
      status: UserStatus.ACTIVE,
      referralCode,
      referrerId: referrer?._id ?? null,
      preferredLanguage: input.preferredLanguage ?? 'en',
    });

    challenge.status = VerificationChallengeStatus.COMPLETED;
    challenge.usedAt = new Date();
    await challenge.save();

    return this.issueTokens(user, meta);
  }

  async login(input: { phone: string; password: string }, meta: AuthRequestMetadata) {
    const phoneE164 = normalizePhone(input.phone);
    const user = await this.users.findOne({ phoneE164 }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account is not active');

    user.lastLoginAt = new Date();
    await user.save();
    return this.issueTokens(user, meta);
  }

  async refresh(refreshToken: string, meta: AuthRequestMetadata) {
    const hash = sha256(refreshToken);
    const now = new Date();
    // Rotate atomically: only one concurrent refresh can consume a token.
    const session = await this.sessions.findOneAndUpdate(
      { refreshTokenHash: hash, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { revokedAt: now, lastUsedAt: now } },
      { new: false },
    );
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account is not active');

    return this.issueTokens(user, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sessions.updateOne({ refreshTokenHash: sha256(refreshToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  async profile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account not found');
    return {
      id: user._id.toHexString(),
      phoneE164: user.phoneE164,
      status: user.status,
      phoneVerifiedAt: user.phoneVerifiedAt,
      telegram: {
        verified: Boolean(user.telegramVerifiedAt),
        verifiedAt: user.telegramVerifiedAt,
        username: user.telegramUsername,
        userId: user.telegramUserId,
      },
      referralCode: user.referralCode,
      compoundMode: user.compoundMode,
      preferredLanguage: user.preferredLanguage ?? 'en',
      lastLoginAt: user.lastLoginAt,
    };
  }

  async updateLanguage(userId: string, language: 'en' | 'es') {
    if (language !== 'en' && language !== 'es') throw new BadRequestException('Unsupported language');
    const user = await this.users.findByIdAndUpdate(userId, { $set: { preferredLanguage: language } }, { new: true });
    if (!user) throw new UnauthorizedException('Account not found');
    return { preferredLanguage: user.preferredLanguage };
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const rows = await this.sessions.find({ userId: new Types.ObjectId(userId), revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastUsedAt: -1 }).lean();
    return rows.map((session: any) => ({
      id: session._id.toString(),
      current: currentSessionId ? session._id.toString() === currentSessionId : false,
      userAgent: session.userAgent ?? null,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt ?? null,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) throw new BadRequestException('Invalid session id');
    await this.sessions.updateOne(
      { _id: new Types.ObjectId(sessionId), userId: new Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  async revokeOtherSessions(userId: string, currentSessionId?: string): Promise<void> {
    const filter: any = { userId: new Types.ObjectId(userId), revokedAt: null };
    if (currentSessionId && Types.ObjectId.isValid(currentSessionId)) filter._id = { $ne: new Types.ObjectId(currentSessionId) };
    await this.sessions.updateMany(filter, { $set: { revokedAt: new Date() } });
  }

  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
    meta: AuthRequestMetadata,
  ) {
    this.validatePassword(input.newPassword);
    if (input.currentPassword === input.newPassword) throw new BadRequestException('New password must be different');
    const user = await this.users.findById(userId).select('+passwordHash');
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    await user.save();
    await this.sessions.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return this.issueTokens(user, meta);
  }

  async handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.from || message.chat.type !== 'private') return;

    if (message.text?.startsWith('/start ')) {
      const token = message.text.slice('/start '.length).trim();
      const challenge = await this.findChallengeByToken(token);
      if (!challenge || challenge.status !== VerificationChallengeStatus.PENDING_TELEGRAM) return;
      if (challenge.expiresAt.getTime() <= Date.now()) return;
      if (await this.users.exists({ telegramUserId: String(message.from.id) })) return;
      challenge.telegramUserId = String(message.from.id);
      challenge.telegramUsername = message.from.username ?? null;
      await challenge.save();
      await this.telegram.requestContact(message.chat.id);
      return;
    }

    if (message.contact) {
      if (!message.contact.user_id || message.contact.user_id !== message.from.id) return;
      let phoneE164: string;
      try {
        phoneE164 = normalizePhone(message.contact.phone_number.startsWith('+') ? message.contact.phone_number : `+${message.contact.phone_number}`);
      } catch {
        return;
      }
      const challenge = await this.challenges.findOne({
        phoneE164,
        telegramUserId: String(message.from.id),
        status: VerificationChallengeStatus.PENDING_TELEGRAM,
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });
      if (!challenge) return;

      challenge.verifiedAt = new Date();
      challenge.status = VerificationChallengeStatus.TELEGRAM_VERIFIED;
      await challenge.save();
      await this.telegram.sendVerified(message.chat.id);
    }
  }

  verifyAccessToken(token: string): Promise<{ sub: string; phone: string; sid?: string }> {
    return this.jwt.verifyAsync(token, { secret: this.accessSecret() });
  }

  async authenticateAccessToken(token: string): Promise<{ sub: string; phone: string; sid: string }> {
    let payload: { sub: string; phone: string; sid?: string };
    try {
      payload = await this.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (!Types.ObjectId.isValid(payload.sub) || !payload.sid || !Types.ObjectId.isValid(payload.sid)) {
      throw new UnauthorizedException('Invalid access token');
    }

    const [session, user] = await Promise.all([
      this.sessions.exists({
        _id: new Types.ObjectId(payload.sid),
        userId: new Types.ObjectId(payload.sub),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }),
      this.users.findById(payload.sub).select('status phoneE164').lean(),
    ]);
    if (!session) throw new UnauthorizedException('Session is no longer active');
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account is not active');

    return { sub: payload.sub, phone: user.phoneE164, sid: payload.sid };
  }

  private async issueTokens(user: UserDocument, meta: AuthRequestMetadata) {
    const accessTtlSeconds = Number(this.config.get<string>('JWT_ACCESS_TTL_SECONDS') ?? 900);
    const refreshTtlDays = Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    const refreshToken = randomToken(48);
    const session = await this.sessions.create({
      userId: user._id,
      refreshTokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtlDays * 86_400_000),
      ipHash: meta.ip ? sha256(meta.ip) : null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    });
    const sessionId = session._id.toHexString();
    const accessToken = await this.jwt.signAsync(
      { sub: user._id.toHexString(), phone: user.phoneE164, sid: sessionId },
      { secret: this.accessSecret(), expiresIn: accessTtlSeconds },
    );
    return {
      accessToken,
      refreshToken,
      sessionId,
      tokenType: 'Bearer',
      expiresIn: accessTtlSeconds,
      user: {
        id: user._id.toHexString(),
        phoneE164: user.phoneE164,
        referralCode: user.referralCode,
        compoundMode: user.compoundMode,
        preferredLanguage: user.preferredLanguage ?? 'en',
      },
    };
  }

  private async getUsableChallenge(token: string) {
    const challenge = await this.findChallengeByToken(token);
    if (!challenge) throw new BadRequestException('Invalid registration challenge');
    if (challenge.expiresAt.getTime() <= Date.now()) throw new BadRequestException('Registration challenge expired');
    if (challenge.status === VerificationChallengeStatus.COMPLETED) throw new BadRequestException('Registration challenge already used');
    return challenge;
  }

  private findChallengeByToken(token: string) {
    return this.challenges.findOne({ tokenHash: sha256(token) });
  }

  private validatePassword(password: string): void {
    if (password.length < 10 || password.length > 128) throw new BadRequestException('Password must contain 10 to 128 characters');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new BadRequestException('Password must contain letters and numbers');
  }

  private accessSecret(): string {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret || secret.length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
    return secret;
  }
}
