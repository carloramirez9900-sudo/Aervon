import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformSetting, PlatformSettingDocument } from '../database/schemas';

export type OperationalSettingKey = 'tradingPaused' | 'depositsPaused' | 'withdrawalsPaused';

@Injectable()
export class OperationalSettingsService {
  constructor(@InjectModel(PlatformSetting.name) private readonly settings: Model<PlatformSettingDocument>) {}
  async isPaused(key: OperationalSettingKey): Promise<boolean> {
    const row = await this.settings.findOne({ key }).lean();
    return Boolean(row?.value);
  }
}
