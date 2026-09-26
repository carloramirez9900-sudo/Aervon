import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UserStatus, DepositStatus, WithdrawalStatus } from '../database/schemas';
import { AdminGuard } from './admin.guard';
import { RequireAdminRoles } from './admin.decorators';
import { AdminRole } from './admin.types';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUsersService } from './admin-users.service';
import { AdminFinanceService } from './admin-finance.service';
import { AdminOperationsService } from './admin-operations.service';
import { AdminAuditService } from './admin-audit.service';

function pageOf(value?: string) { const n=Number(value??1); return Number.isInteger(n)&&n>0?n:1; }
function limitOf(value?: string) { const n=Number(value??25); return Number.isInteger(n)&&n>0?Math.min(n,100):25; }
function admin(req: any) { if(!req.adminUser) throw new BadRequestException('Admin context missing'); return req.adminUser as {id:string;roles:AdminRole[]}; }
function requestId(req: Request) { const v=req.headers['x-request-id']; return Array.isArray(v)?v[0]:v ?? null; }

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly users: AdminUsersService,
    private readonly finance: AdminFinanceService,
    private readonly operations: AdminOperationsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('me')
  me(@Req() req: Request) { return { ...admin(req) }; }

  @Get('dashboard')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.OPERATIONS,AdminRole.FINANCE,AdminRole.SUPPORT,AdminRole.AUDITOR)
  dashboardOverview(){ return this.dashboard.overview(); }

  @Get('users')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.SUPPORT,AdminRole.FINANCE,AdminRole.AUDITOR)
  usersList(@Query('page') page?:string,@Query('limit') limit?:string,@Query('q') q?:string,@Query('status') status?:UserStatus,@Query('adminOnly') adminOnly?:string){
    return this.users.list({page:pageOf(page),limit:limitOf(limit),q,status,adminOnly:adminOnly==='true'});
  }

  @Get('users/:id')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.SUPPORT,AdminRole.FINANCE,AdminRole.AUDITOR)
  userDetail(@Param('id') id:string){ return this.users.detail(id); }

  @Patch('users/:id/status')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.SUPPORT)
  userStatus(@Req() req:Request,@Param('id') id:string,@Body() body:{status?:UserStatus;reason?:string}){
    if(!body.status || !Object.values(UserStatus).includes(body.status)) throw new BadRequestException('Valid status is required');
    const a=admin(req); return this.users.setStatus({actorId:a.id,actorRoles:a.roles,targetId:id,status:body.status,reason:body.reason??'',ip:req.ip,requestId:requestId(req)});
  }

  @Patch('users/:id/roles')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN)
  userRoles(@Req() req:Request,@Param('id') id:string,@Body() body:{roles?:AdminRole[];reason?:string}){
    if(!Array.isArray(body.roles)) throw new BadRequestException('roles must be an array');
    return this.users.setRoles({actorId:admin(req).id,targetId:id,roles:body.roles,reason:body.reason??'',ip:req.ip,requestId:requestId(req)});
  }

  @Post('users/:id/adjustments')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.FINANCE)
  adjust(@Req() req:Request,@Headers('idempotency-key') idempotencyKey:string|undefined,@Param('id') id:string,@Body() body:{amount?:string;direction?:'CREDIT'|'DEBIT';reason?:string}){
    if(!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    if(!body.amount || !body.direction || !['CREDIT','DEBIT'].includes(body.direction)) throw new BadRequestException('amount and direction are required');
    return this.users.adjustBalance({actorId:admin(req).id,targetId:id,amount:body.amount,direction:body.direction,reason:body.reason??'',idempotencyKey:idempotencyKey.trim(),ip:req.ip,requestId:requestId(req)});
  }

  @Get('deposits')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.FINANCE,AdminRole.OPERATIONS,AdminRole.AUDITOR)
  deposits(@Query('page') page?:string,@Query('limit') limit?:string,@Query('status') status?:DepositStatus,@Query('userId') userId?:string,@Query('q') q?:string){
    return this.finance.listDeposits({page:pageOf(page),limit:limitOf(limit),status,userId,q});
  }

  @Get('withdrawals')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.FINANCE,AdminRole.OPERATIONS,AdminRole.AUDITOR)
  withdrawals(@Query('page') page?:string,@Query('limit') limit?:string,@Query('status') status?:WithdrawalStatus,@Query('userId') userId?:string,@Query('q') q?:string){
    return this.finance.listWithdrawals({page:pageOf(page),limit:limitOf(limit),status,userId,q});
  }

  @Post('withdrawals/:id/hold')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.FINANCE)
  holdWithdrawal(@Req() req:Request,@Param('id') id:string,@Body() body:{reason?:string}){ return this.finance.holdWithdrawal({actorId:admin(req).id,withdrawalId:id,reason:body.reason??'',ip:req.ip,requestId:requestId(req)}); }

  @Post('withdrawals/:id/release-hold')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.FINANCE)
  releaseWithdrawal(@Req() req:Request,@Param('id') id:string,@Body() body:{reason?:string}){ return this.finance.releaseHold({actorId:admin(req).id,withdrawalId:id,reason:body.reason??'',ip:req.ip,requestId:requestId(req)}); }

  @Post('withdrawals/:id/cancel')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.FINANCE)
  cancelWithdrawal(@Req() req:Request,@Param('id') id:string,@Body() body:{reason?:string}){ return this.finance.cancelWithdrawal({actorId:admin(req).id,withdrawalId:id,reason:body.reason??'',ip:req.ip,requestId:requestId(req)}); }

  @Get('cycles')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.OPERATIONS,AdminRole.AUDITOR)
  cycles(@Query('page') page?:string,@Query('limit') limit?:string,@Query('status') status?:string){ return this.operations.cyclesList({page:pageOf(page),limit:limitOf(limit),status}); }

  @Get('investments')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.OPERATIONS,AdminRole.FINANCE,AdminRole.AUDITOR)
  investments(@Query('page') page?:string,@Query('limit') limit?:string,@Query('status') status?:string){ return this.operations.investmentsList({page:pageOf(page),limit:limitOf(limit),status}); }

  @Get('referrals/summary')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.FINANCE,AdminRole.SUPPORT,AdminRole.AUDITOR)
  referrals(){ return this.operations.referralsSummary(); }

  @Get('settings')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.OPERATIONS,AdminRole.AUDITOR)
  settings(){ return this.operations.getSettings(); }

  @Patch('settings/operational/:key')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.OPERATIONS)
  operationalSetting(@Req() req:Request,@Param('key') key:string,@Body() body:{value?:boolean;reason?:string}){
    if(typeof body.value!=='boolean') throw new BadRequestException('Boolean value is required');
    return this.operations.setOperationalSetting({actorId:admin(req).id,key,value:body.value,reason:body.reason??'',ip:req.ip,requestId:requestId(req)});
  }

  @Get('audit')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN,AdminRole.AUDITOR)
  auditLogs(@Query('page') page?:string,@Query('limit') limit?:string,@Query('action') action?:string,@Query('targetType') targetType?:string,@Query('actorUserId') actorUserId?:string){ return this.audit.list({page:pageOf(page),limit:limitOf(limit),action,targetType,actorUserId}); }
}
