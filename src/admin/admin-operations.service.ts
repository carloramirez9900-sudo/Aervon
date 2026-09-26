import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { CycleParticipation, CycleParticipationDocument, InvestmentPosition, InvestmentPositionDocument, PlatformSetting, PlatformSettingDocument, ReferralCommission, ReferralCommissionDocument, TradingCycle, TradingCycleDocument, UnifiedTrade, UnifiedTradeDocument } from '../database/schemas';
import { fromDecimal128 } from '../database/decimal128';
import { loadProductConfig } from '../config/product.config';
import { AdminAuditService } from './admin-audit.service';

const OPERATIONAL_KEYS = new Set(['tradingPaused','depositsPaused','withdrawalsPaused']);

@Injectable()
export class AdminOperationsService {
  constructor(
    @InjectModel(TradingCycle.name) private readonly cycles: Model<TradingCycleDocument>,
    @InjectModel(UnifiedTrade.name) private readonly trades: Model<UnifiedTradeDocument>,
    @InjectModel(CycleParticipation.name) private readonly participations: Model<CycleParticipationDocument>,
    @InjectModel(InvestmentPosition.name) private readonly investments: Model<InvestmentPositionDocument>,
    @InjectModel(ReferralCommission.name) private readonly commissions: Model<ReferralCommissionDocument>,
    @InjectModel(PlatformSetting.name) private readonly settings: Model<PlatformSettingDocument>,
    private readonly audit: AdminAuditService,
    private readonly config: ConfigService,
  ) {}

  async cyclesList(input:{page:number;limit:number;status?:string}) {
    const filter:any={}; if(input.status) filter.status=input.status;
    const skip=(input.page-1)*input.limit;
    const [rows,total]=await Promise.all([this.cycles.find(filter).sort({startsAt:-1}).skip(skip).limit(input.limit).lean(),this.cycles.countDocuments(filter)]);
    const items=[] as any[];
    for(const c of rows as any[]) {
      const [tradeRows,participants]=await Promise.all([this.trades.find({cycleId:c._id}).sort({sequence:1}).lean(),this.participations.countDocuments({cycleId:c._id})]);
      items.push({id:c._id.toString(),sequence:c.sequence,status:c.status,startsAt:c.startsAt,endsAt:c.endsAt,yieldRate:c.yieldRate?fromDecimal128(c.yieldRate).toFixed():null,expectedTradeCount:c.expectedTradeCount,participants,trades:tradeRows.map((t:any)=>({id:t._id.toString(),sequence:t.sequence,symbol:t.symbol,side:t.side,status:t.status,executionMode:t.executionMode,scheduledOpenAt:t.scheduledOpenAt,scheduledCloseAt:t.scheduledCloseAt,entryPrice:t.entryPrice?fromDecimal128(t.entryPrice).toFixed():null,exitPrice:t.exitPrice?fromDecimal128(t.exitPrice).toFixed():null,pnlRate:t.pnlRate?fromDecimal128(t.pnlRate).toFixed():null}))});
    }
    return {items,page:input.page,limit:input.limit,total,pages:Math.ceil(total/input.limit)};
  }

  async investmentsList(input:{page:number;limit:number;status?:string}) {
    const filter:any={}; if(input.status) filter.status=input.status; const skip=(input.page-1)*input.limit;
    const [rows,total]=await Promise.all([this.investments.find(filter).sort({updatedAt:-1}).skip(skip).limit(input.limit).lean(),this.investments.countDocuments(filter)]);
    return {items:rows.map((r:any)=>({id:r._id.toString(),userId:r.userId.toString(),status:r.status,startsAt:r.startsAt,completedCycles:r.completedCycles,principalWithdrawalEligible:r.principalWithdrawalEligible,activationRequestedAt:r.activationRequestedAt,stopRequestedAt:r.stopRequestedAt,stoppedAt:r.stoppedAt})),page:input.page,limit:input.limit,total,pages:Math.ceil(total/input.limit)};
  }

  async referralsSummary() {
    const rows=await this.commissions.find({}).select('amount referrerId referredUserId createdAt').lean();
    let total='0';
    let sum=new Decimal(0); for(const r of rows as any[]) sum=sum.plus(fromDecimal128(r.amount)); total=sum.toFixed();
    return {commissionRate:loadProductConfig().REFERRAL_COMMISSION_RATE,totalCommissionsUsdt:total,commissionEvents:rows.length,uniqueReferrers:new Set(rows.map((r:any)=>r.referrerId.toString())).size,uniqueReferredUsers:new Set(rows.map((r:any)=>r.referredUserId.toString())).size};
  }

  async getSettings() {
    const env=loadProductConfig(); const rows=await this.settings.find({}).lean(); const map=Object.fromEntries(rows.map((r:any)=>[r.key,r.value]));
    return {
      operational:{tradingPaused:Boolean(map.tradingPaused),depositsPaused:Boolean(map.depositsPaused),withdrawalsPaused:Boolean(map.withdrawalsPaused)},
      financialRules:{minDepositUsdt:env.MIN_DEPOSIT_USDT,minWithdrawalUsdt:env.MIN_WITHDRAWAL_USDT,minimumPrincipalCycles:env.MIN_PRINCIPAL_CYCLES,tradesPerCycle:env.TRADES_PER_CYCLE,cycleHours:env.CYCLE_HOURS,referralCommissionRate:env.REFERRAL_COMMISSION_RATE,dailyYieldMinRate:env.DAILY_YIELD_MIN_RATE,dailyYieldMaxRate:env.DAILY_YIELD_MAX_RATE,source:'DEPLOYMENT_ENV_READ_ONLY'},
    };
  }

  async setOperationalSetting(input:{actorId:string;key:string;value:boolean;reason:string;ip?:string|null;requestId?:string|null}) {
    if(!OPERATIONAL_KEYS.has(input.key)) throw new BadRequestException('Unsupported operational setting');
    if(!input.reason?.trim()) throw new BadRequestException('Reason is required');
    const current=await this.settings.findOne({key:input.key}); const before=current?{value:current.value,version:current.version}:null;
    const row=await this.settings.findOneAndUpdate({key:input.key},{$set:{value:input.value,updatedBy:new Types.ObjectId(input.actorId)},$setOnInsert:{version:0},$inc:{version:1}}, {upsert:true,new:true,setDefaultsOnInsert:true});
    await this.audit.record({actorUserId:input.actorId,action:'OPERATIONAL_SETTING_CHANGED',targetType:'PLATFORM_SETTING',targetId:input.key,before,after:{value:row.value,version:row.version},reason:input.reason,ip:input.ip,requestId:input.requestId});
    return {key:row.key,value:row.value,version:row.version};
  }

  async isPaused(key:'tradingPaused'|'depositsPaused'|'withdrawalsPaused'):Promise<boolean>{ const row=await this.settings.findOne({key}).lean(); return Boolean(row?.value); }
}
