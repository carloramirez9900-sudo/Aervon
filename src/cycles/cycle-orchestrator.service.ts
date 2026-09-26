import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CycleStatus, TradingCycle, TradingCycleDocument } from '../database/schemas';
import { CycleService } from './cycle.service';
import { SimulatedTradingService } from './simulated-trading.service';
import { fromDecimal128 } from '../database/decimal128';
import { OperationalSettingsService } from '../config/operational-settings.service';

@Injectable()
export class CycleOrchestratorService {
  private readonly logger = new Logger(CycleOrchestratorService.name);
  private running = false;

  constructor(
    @InjectModel(TradingCycle.name) private readonly cycles: Model<TradingCycleDocument>,
    private readonly cycleService: CycleService,
    private readonly simulatedTrading: SimulatedTradingService,
    private readonly operationalSettings: OperationalSettingsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (this.running) return;
    if (await this.operationalSettings.isPaused('tradingPaused')) return;
    this.running = true;
    try {
      const now = new Date();

      // Always finish older running cycles first, including the one that ended at midnight.
      const runningCycles = await this.cycles.find({ status: CycleStatus.RUNNING }).sort({ startsAt: 1 });
      for (const running of runningCycles) {
        await this.simulatedTrading.planCycle(running._id);
        await this.simulatedTrading.advanceCycle(running._id, now);
        const latest = await this.cycles.findById(running._id);
        if (latest?.yieldRate && now >= latest.endsAt) {
          await this.cycleService.closeCycle(latest._id, fromDecimal128(latest.yieldRate));
        }
      }

      const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
      const sequence = Number(start.toISOString().slice(0, 10).replaceAll('-', ''));
      let cycle = await this.cycles.findOne({ sequence });

      // Do not invent a partial historical cycle on a fresh deployment started mid-day.
      if (!cycle && now.getTime() - start.getTime() > 5 * 60_000) {
        const nextStart = new Date(start.getTime() + 24 * 60 * 60_000);
        const nextSequence = Number(nextStart.toISOString().slice(0, 10).replaceAll('-', ''));
        await this.cycleService.createCycle(nextSequence, nextStart);
        return;
      }

      cycle = cycle ?? await this.cycleService.createCycle(sequence, start);
      if (cycle.status === CycleStatus.SCHEDULED && now >= cycle.startsAt && now < cycle.endsAt) {
        await this.cycleService.startCycle(cycle._id);
      }
      const fresh = await this.cycles.findById(cycle._id);
      if (fresh?.status === CycleStatus.RUNNING) {
        await this.simulatedTrading.planCycle(fresh._id);
        await this.simulatedTrading.advanceCycle(fresh._id, now);
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }
}
