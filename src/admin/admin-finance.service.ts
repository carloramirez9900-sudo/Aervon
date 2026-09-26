import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BlockchainDeposit, BlockchainDepositDocument, DepositStatus, Withdrawal, WithdrawalDocument, WithdrawalStatus } from '../database/schemas';
import { fromDecimal128 } from '../database/decimal128';
import { WithdrawalService } from '../withdrawals/withdrawal.service';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminFinanceService {
  constructor(
    @InjectModel(BlockchainDeposit.name) private readonly deposits: Model<BlockchainDepositDocument>,
    @InjectModel(Withdrawal.name) private readonly withdrawals: Model<WithdrawalDocument>,
    private readonly withdrawalService: WithdrawalService,
    private readonly audit: AdminAuditService,
  ) {}

  async listDeposits(input:{page:number;limit:number;status?:DepositStatus;userId?:string;q?:string}) {
    const filter:any={};
    if(input.status) filter.status=input.status;
    if(input.userId && Types.ObjectId.isValid(input.userId)) filter.userId=new Types.ObjectId(input.userId);
    if(input.q?.trim()) filter.$or=[{txHash:{$regex:input.q.trim(),$options:'i'}},{toAddress:{$regex:input.q.trim(),$options:'i'}},{fromAddress:{$regex:input.q.trim(),$options:'i'}}];
    const skip=(input.page-1)*input.limit;
    const [rows,total]=await Promise.all([
      this.deposits.find(filter).sort({createdAt:-1}).skip(skip).limit(input.limit).lean(),
      this.deposits.countDocuments(filter),
    ]);
    return {items:rows.map((d:any)=>({id:d._id.toString(),userId:d.userId.toString(),amount:fromDecimal128(d.amount).toFixed(),status:d.status,txHash:d.txHash,fromAddress:d.fromAddress,toAddress:d.toAddress,blockNumber:d.blockNumber,confirmedAt:d.confirmedAt,creditedAt:d.creditedAt,sweepTxHash:d.sweepTxHash,sweptAt:d.sweptAt,lastError:d.lastError,createdAt:d.createdAt})),page:input.page,limit:input.limit,total,pages:Math.ceil(total/input.limit)};
  }

  async listWithdrawals(input:{page:number;limit:number;status?:WithdrawalStatus;userId?:string;q?:string}) {
    const filter:any={}; if(input.status) filter.status=input.status;
    if(input.userId && Types.ObjectId.isValid(input.userId)) filter.userId=new Types.ObjectId(input.userId);
    if(input.q?.trim()) filter.$or=[{txHash:{$regex:input.q.trim(),$options:'i'}},{destination:{$regex:input.q.trim(),$options:'i'}}];
    const skip=(input.page-1)*input.limit;
    const [rows,total]=await Promise.all([this.withdrawals.find(filter).sort({requestedAt:-1}).skip(skip).limit(input.limit).lean(),this.withdrawals.countDocuments(filter)]);
    return {items:rows.map((w:any)=>({id:w._id.toString(),userId:w.userId.toString(),amount:fromDecimal128(w.amount).toFixed(),status:w.status,destination:w.destination,txHash:w.txHash,nonce:w.nonce,gasLimit:w.gasLimit,gasPriceWei:w.gasPriceWei,estimatedGasCostWei:w.estimatedGasCostWei,failureReason:w.failureReason,attempts:w.attempts,requestedAt:w.requestedAt,broadcastedAt:w.broadcastedAt,confirmedAt:w.confirmedAt})),page:input.page,limit:input.limit,total,pages:Math.ceil(total/input.limit)};
  }

  async holdWithdrawal(input:{actorId:string;withdrawalId:string;reason:string;ip?:string|null;requestId?:string|null}) {
    if(!input.reason?.trim()) throw new BadRequestException('Reason is required');
    if(!Types.ObjectId.isValid(input.withdrawalId)) throw new NotFoundException('Withdrawal not found');
    const allowed=[WithdrawalStatus.QUEUED,WithdrawalStatus.WAITING_GAS,WithdrawalStatus.WAITING_LIQUIDITY,WithdrawalStatus.RESERVED];
    const row=await this.withdrawals.findOneAndUpdate(
      {_id:new Types.ObjectId(input.withdrawalId),status:{$in:allowed}},
      {$set:{status:WithdrawalStatus.SECURITY_HOLD,failureReason:input.reason,processingLeaseUntil:null}},
      {new:false},
    );
    if(!row) throw new BadRequestException('Withdrawal is already being processed or cannot be held');
    const before={status:row.status};
    await this.audit.record({actorUserId:input.actorId,action:'WITHDRAWAL_SECURITY_HOLD',targetType:'WITHDRAWAL',targetId:row._id.toHexString(),before,after:{status:WithdrawalStatus.SECURITY_HOLD},reason:input.reason,ip:input.ip,requestId:input.requestId});
    return {id:row._id.toHexString(),status:WithdrawalStatus.SECURITY_HOLD};
  }

  async releaseHold(input:{actorId:string;withdrawalId:string;reason:string;ip?:string|null;requestId?:string|null}) {
    if(!input.reason?.trim()) throw new BadRequestException('Reason is required');
    if(!Types.ObjectId.isValid(input.withdrawalId)) throw new NotFoundException('Withdrawal not found');
    const row=await this.withdrawals.findOneAndUpdate(
      {_id:new Types.ObjectId(input.withdrawalId),status:WithdrawalStatus.SECURITY_HOLD},
      {$set:{status:WithdrawalStatus.QUEUED,failureReason:null,processingLeaseUntil:null}},
      {new:true},
    );
    if(!row) throw new BadRequestException('Withdrawal is not on security hold');
    await this.audit.record({actorUserId:input.actorId,action:'WITHDRAWAL_HOLD_RELEASED',targetType:'WITHDRAWAL',targetId:row._id.toHexString(),before:{status:WithdrawalStatus.SECURITY_HOLD},after:{status:row.status},reason:input.reason,ip:input.ip,requestId:input.requestId});
    return {id:row._id.toHexString(),status:row.status};
  }

  async cancelWithdrawal(input:{actorId:string;withdrawalId:string;reason:string;ip?:string|null;requestId?:string|null}) {
    if(!input.reason?.trim()) throw new BadRequestException('Reason is required');
    if(!Types.ObjectId.isValid(input.withdrawalId)) throw new NotFoundException('Withdrawal not found');
    const cancellable=[WithdrawalStatus.RESERVED,WithdrawalStatus.QUEUED,WithdrawalStatus.WAITING_GAS,WithdrawalStatus.WAITING_LIQUIDITY,WithdrawalStatus.SECURITY_HOLD];
    // Claim cancellation atomically so the worker cannot move the same withdrawal to PROCESSING concurrently.
    const row=await this.withdrawals.findOneAndUpdate(
      {_id:new Types.ObjectId(input.withdrawalId),status:{$in:cancellable}},
      {$set:{status:WithdrawalStatus.SECURITY_HOLD,failureReason:`Admin cancellation in progress: ${input.reason}`,processingLeaseUntil:null}},
      {new:false},
    );
    if(!row) throw new BadRequestException('Withdrawal is already being processed, signed, broadcasted, confirmed, or otherwise not cancellable');
    const before={status:row.status};
    await this.withdrawalService.releaseReservation(row, `Admin cancelled: ${input.reason}`);
    await this.withdrawals.updateOne({_id:row._id,status:WithdrawalStatus.FAILED},{$set:{status:WithdrawalStatus.CANCELLED,failureReason:input.reason,processingLeaseUntil:null}});
    await this.audit.record({actorUserId:input.actorId,action:'WITHDRAWAL_CANCELLED',targetType:'WITHDRAWAL',targetId:row._id.toHexString(),before,after:{status:WithdrawalStatus.CANCELLED},reason:input.reason,ip:input.ip,requestId:input.requestId});
    return {id:row._id.toHexString(),status:WithdrawalStatus.CANCELLED};
  }
}
