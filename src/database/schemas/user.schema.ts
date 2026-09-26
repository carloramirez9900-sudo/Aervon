import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AdminRole } from '../../admin/admin.types';

export type UserDocument = HydratedDocument<User>;

export enum CompoundMode {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, index: true, trim: true })
  phoneE164!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ required: true, unique: true, index: true })
  telegramUserId!: string;

  @Prop({ default: null, trim: true })
  telegramUsername!: string | null;

  @Prop({ required: true })
  phoneVerifiedAt!: Date;

  @Prop({ required: true })
  telegramVerifiedAt!: Date;

  @Prop({ required: true, type: String, enum: UserStatus, default: UserStatus.ACTIVE, index: true })
  status!: UserStatus;

  @Prop({ required: true, unique: true, index: true, trim: true, uppercase: true })
  referralCode!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  referrerId!: Types.ObjectId | null;

  @Prop({ type: String, enum: CompoundMode, default: CompoundMode.MANUAL })
  compoundMode!: CompoundMode;

  @Prop({ type: String, enum: ['en', 'es'], default: 'en' })
  preferredLanguage!: 'en' | 'es';

  @Prop({ default: null })
  lastLoginAt!: Date | null;

  @Prop({ type: [String], enum: AdminRole, default: [], index: true })
  adminRoles!: AdminRole[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ referrerId: 1, createdAt: -1 });
