import { Module } from '@nestjs/common';
import { ModelsModule } from '../database/models.module';
import { OperationalSettingsService } from './operational-settings.service';
@Module({ imports:[ModelsModule], providers:[OperationalSettingsService], exports:[OperationalSettingsService] })
export class OperationalSettingsModule {}
