import { Module } from '@nestjs/common';
import { MarketReferenceService } from './market-reference.service';

@Module({ providers: [MarketReferenceService], exports: [MarketReferenceService] })
export class MarketModule {}
