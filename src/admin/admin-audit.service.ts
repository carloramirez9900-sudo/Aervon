import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminAuditLog, AdminAuditLogDocument } from '../database/schemas';
import { sha256 } from '../auth/auth.crypto';

@Injectable()
export class AdminAuditService {
  constructor(@InjectModel(AdminAuditLog.name) private readonly logs: Model<AdminAuditLogDocument>) {}

  async record(input: {
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string | null;
    ip?: string | null;
    requestId?: string | null;
  }) {
    return this.logs.create({
      actorUserId: input.actorUserId && Types.ObjectId.isValid(input.actorUserId) ? new Types.ObjectId(input.actorUserId) : null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason?.trim().slice(0, 1000) ?? null,
      ipHash: input.ip ? sha256(input.ip) : null,
      requestId: input.requestId ?? null,
    });
  }

  async list(input: { page: number; limit: number; action?: string; targetType?: string; actorUserId?: string }) {
    const filter: any = {};
    if (input.action) filter.action = input.action;
    if (input.targetType) filter.targetType = input.targetType;
    if (input.actorUserId && Types.ObjectId.isValid(input.actorUserId)) filter.actorUserId = new Types.ObjectId(input.actorUserId);
    const skip = (input.page - 1) * input.limit;
    const [items, total] = await Promise.all([
      this.logs.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).lean(),
      this.logs.countDocuments(filter),
    ]);
    return { items, page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) };
  }
}
