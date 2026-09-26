import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type AdminAuditLogDocument = HydratedDocument<AdminAuditLog>;
export type PlatformSettingDocument = HydratedDocument<PlatformSetting>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'admin_audit_logs' })
export class AdminAuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true }) actorUserId!: Types.ObjectId | null;
  @Prop({ required: true, index: true }) action!: string;
  @Prop({ required: true, index: true }) targetType!: string;
  @Prop({ default: null, index: true }) targetId!: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) before!: Record<string, unknown> | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) after!: Record<string, unknown> | null;
  @Prop({ default: null }) reason!: string | null;
  @Prop({ default: null }) ipHash!: string | null;
  @Prop({ default: null, index: true }) requestId!: string | null;
}
export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);
AdminAuditLogSchema.index({ createdAt: -1 });
AdminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

@Schema({ timestamps: true, collection: 'platform_settings' })
export class PlatformSetting {
  @Prop({ required: true, unique: true, index: true }) key!: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) value!: unknown;
  @Prop({ required: true, default: 1, min: 1 }) version!: number;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) updatedBy!: Types.ObjectId | null;
}
export const PlatformSettingSchema = SchemaFactory.createForClass(PlatformSetting);
