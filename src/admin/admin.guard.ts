import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { User, UserDocument, UserStatus } from '../database/schemas';
import { ADMIN_ROLES_KEY, AdminRole } from './admin.types';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authorization = req.headers?.authorization as string | undefined;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    const payload = await this.auth.authenticateAccessToken(token);
    const user = await this.users.findById(payload.sub).select('phoneE164 status adminRoles');
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account is not active');
    const roles = (user.adminRoles ?? []) as AdminRole[];
    if (!roles.length) throw new ForbiddenException('Administrator access required');
    const required = this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (required.length && !roles.includes(AdminRole.SUPER_ADMIN) && !required.some((role: AdminRole) => roles.includes(role))) {
      throw new ForbiddenException('Insufficient administrator permissions');
    }
    req.adminUser = { id: user._id.toHexString(), phoneE164: user.phoneE164, roles, sid: payload.sid };
    return true;
  }
}
