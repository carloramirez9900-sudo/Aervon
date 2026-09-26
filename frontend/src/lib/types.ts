export type AuthUser = {
  id: string;
  phoneE164: string;
  referralCode: string;
  compoundMode?: string;
  preferredLanguage?: 'en' | 'es';
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
};

export type Trade = {
  id: string;
  cycleId: string;
  sequence: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  timeframe: string;
  status: 'PLANNED' | 'OPEN' | 'CLOSED';
  executionMode: 'SIMULATED';
  scheduledOpenAt: string;
  scheduledCloseAt: string;
  openedAt: string | null;
  closedAt: string | null;
  entryPrice: string | null;
  exitPrice: string | null;
  pnlRate: string | null;
  pnlUsdt: string | null;
  principalAtCycle: string | null;
};

export type DashboardData = {
  currency: 'USDT';
  wallet: {
    totalBalance: string;
    availableBalance: string;
    activePrincipal: string;
    pendingCompound: string;
    withdrawalPending: string;
  };
  earnings: {
    totalYieldEarned: string;
    totalReferralEarned: string;
    totalEarnings: string;
  };
  investment: {
    status: string;
    activationRequestedAt: string | null;
    startsAt: string | null;
    completedCycles: number;
    minimumPrincipalCycles: number;
    cyclesRemaining: number;
    principalWithdrawalEligible: boolean;
    stopRequestedAt: string | null;
  };
  currentCycle: null | {
    id: string;
    sequence: number;
    startsAt: string;
    endsAt: string;
    status: string;
    expectedTradeCount: number;
    progress: { planned: number; open: number; closed: number; total: number };
    accumulatedPnlRate: string;
    accumulatedPnlUsdt: string | null;
    finalYieldRate: string | null;
    participation: null | { status: string; principal: string; profit: string | null };
    trades: Trade[];
  };
  recentTrades: Trade[];
  visibility: { showPlatformCapital: false; showPlatformUserCount: false };
  disclosure: string;
};

export type DepositAddress = {
  address: string;
  network: 'BSC';
  asset: 'USDT';
  minDeposit: string;
};

export type DepositItem = {
  id: string;
  txHash: string;
  amount: string;
  status: string;
  blockNumber: number;
  creditedAt: string | null;
  sweptAt: string | null;
};

export type WithdrawalItem = {
  id: string;
  amount: string;
  network: 'BSC';
  asset: 'USDT';
  destination: string;
  status: string;
  txHash?: string | null;
  failureReason?: string | null;
  requestedAt: string;
  broadcastedAt?: string | null;
  confirmedAt?: string | null;
};

export type TradingCurrentResponse = {
  cycle: null | {
    id: string;
    sequence: number;
    startsAt: string;
    endsAt: string;
    status: string;
    yieldRate: string | null;
    accumulatedPnlRate: string;
    accumulatedPnlUsdt: string | null;
    expectedTradeCount: number;
  };
  participation: null | {
    principal: string;
    status: string;
    profit: string | null;
  };
  summary?: { planned: number; open: number; closed: number };
  trades?: Trade[];
  disclosure?: string;
};

export type TradingHistoryResponse = {
  items: Trade[];
  disclosure: string;
};


export type InvestmentOverview = {
  compoundMode: 'MANUAL' | 'AUTOMATIC';
  availableBalance: string;
  activePrincipal: string;
  pendingCompound: string;
  position: {
    status: string;
    startsAt: string | null;
    completedCycles: number;
    minimumPrincipalCycles: number;
    cyclesRemaining: number;
    principalWithdrawalEligible: boolean;
    stopRequestedAt: string | null;
  };
};

export type ReferralSummary = {
  referralCode: string;
  commissionRate: string;
  directReferrals: number;
  activeReferrals: number;
  totalCommission: string;
  referrals: Array<{ id: string; phone: string; joinedAt: string | null; active: boolean }>;
  commissions: Array<{
    id: string; cycleId: string; referredUserId: string; referredPhone: string;
    baseProfit: string; rate: string; amount: string; createdAt: string | null;
  }>;
};


export type AccountProfile = {
  id: string;
  phoneE164: string;
  status: string;
  phoneVerifiedAt: string;
  telegram: { verified: boolean; verifiedAt: string | null; username: string | null; userId: string };
  referralCode: string;
  compoundMode: 'MANUAL' | 'AUTOMATIC';
  preferredLanguage: 'en' | 'es';
  lastLoginAt: string | null;
};

export type AccountSession = {
  id: string;
  current: boolean;
  userAgent: string | null;
  lastUsedAt: string;
  expiresAt: string;
  createdAt: string | null;
};

export type AdminRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'FINANCE' | 'SUPPORT' | 'AUDITOR';
export type AdminMe = { id: string; roles: AdminRole[] };
export type AdminPaged<T> = { items: T[]; page: number; limit: number; total: number; pages: number };
export type AdminDashboard = {
  users: { total: number; active: number; suspended: number; activeInvestments: number };
  finance: { depositsTodayUsdt: string; withdrawalsTodayUsdt: string; activePrincipalUsdt: string; availableBalanceUsdt: string; withdrawalReservedUsdt: string; referralCommissionsAllTimeUsdt: string };
  withdrawals: { pending: number; waitingLiquidity: number; waitingGas: number; securityHold: number };
  cycle: null | { id: string; sequence: number; status: string; startsAt: string; endsAt: string; expectedTrades: number; closedTrades: number; openTrades: number; accumulatedPnlRate: string; yieldRate: string | null };
  wallet: { configured: boolean; address: string | null; usdt: string | null; bnbWei: string | null; error: string | null };
  services: { mongodb: string; bscRpc: string; telegramConfigured: boolean };
  generatedAt: string;
};
export type AdminUserListItem = { id: string; phoneE164: string; telegramUsername?: string | null; status: string; referralCode: string; referrerId?: string | null; compoundMode?: string; lastLoginAt?: string | null; adminRoles?: AdminRole[]; createdAt?: string | null };
export type AdminDeposit = { id: string; userId: string; txHash: string; fromAddress?: string; toAddress?: string; amount: string; status: string; blockNumber?: number; confirmations?: number; createdAt?: string; confirmedAt?: string | null; creditedAt?: string | null; sweptAt?: string | null; sweepTxHash?: string | null };
export type AdminWithdrawal = { id: string; userId: string; amount: string; destination: string; status: string; txHash?: string | null; nonce?: number | null; gasLimit?: string | null; requestedAt?: string; broadcastedAt?: string | null; confirmedAt?: string | null; failureReason?: string | null };
export type AdminCycle = { id: string; sequence: number; status: string; startsAt: string; endsAt: string; yieldRate: string | null; expectedTradeCount: number; participants: number; trades: Array<{id:string;sequence:number;symbol:string;side:string;status:string;executionMode:string;scheduledOpenAt:string;scheduledCloseAt:string;entryPrice:string|null;exitPrice:string|null;pnlRate:string|null}> };
export type AdminInvestment = { id:string; userId:string; status:string; startsAt:string|null; completedCycles:number; principalWithdrawalEligible:boolean; activationRequestedAt:string|null; stopRequestedAt:string|null; stoppedAt:string|null };
export type AdminSettings = { operational: { tradingPaused:boolean; depositsPaused:boolean; withdrawalsPaused:boolean }; financialRules: Record<string,string|number|boolean> };
export type AdminAuditItem = { _id?:string; actorUserId?:string|null; action:string; targetType:string; targetId?:string|null; before?:Record<string,unknown>|null; after?:Record<string,unknown>|null; reason?:string|null; requestId?:string|null; createdAt?:string };
