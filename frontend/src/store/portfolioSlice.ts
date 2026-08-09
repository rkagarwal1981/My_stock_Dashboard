import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface PortfolioState {
  holdings: any[];
  transactions: any[];
  importHistory: any[];
  settlement: any[];
  analytics: any | null;
  auditLogs: any[];
  targets: any[];
  targetCategories: string[];
  automation: {
    [broker: string]: {
      status: string;
      error: string | null;
      otpRequired: boolean;
    };
  };
  loading: boolean;
  error: string | null;
}

const initialState: PortfolioState = {
  holdings: [],
  transactions: [],
  importHistory: [],
  settlement: [],
  analytics: null,
  auditLogs: [],
  targets: [],
  targetCategories: [],
  automation: {
    mstock: { status: 'IDLE', error: null, otpRequired: false },
    mstock_ka: { status: 'IDLE', error: null, otpRequired: false },
    zerodha: { status: 'IDLE', error: null, otpRequired: false },
    dhan: { status: 'IDLE', error: null, otpRequired: false },
  },
  loading: false,
  error: null,
};

const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    setHoldings(state, action: PayloadAction<any[]>) {
      state.holdings = action.payload;
    },
    setTransactions(state, action: PayloadAction<any[]>) {
      state.transactions = action.payload;
    },
    setImportHistory(state, action: PayloadAction<any[]>) {
      state.importHistory = action.payload;
    },
    setSettlement(state, action: PayloadAction<any[]>) {
      state.settlement = action.payload;
    },
    setAnalytics(state, action: PayloadAction<any>) {
      state.analytics = action.payload;
    },
    setAuditLogs(state, action: PayloadAction<any[]>) {
      state.auditLogs = action.payload;
    },
    setTargets(state, action: PayloadAction<any[]>) {
      state.targets = action.payload;
    },
    setTargetCategories(state, action: PayloadAction<string[]>) {
      state.targetCategories = action.payload;
    },
    setAutomationStatus(
      state,
      action: PayloadAction<{ broker: string; status: string; error: string | null; otpRequired: boolean }>
    ) {
      const { broker, status, error, otpRequired } = action.payload;
      state.automation[broker] = { status, error, otpRequired };
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
});

export const {
  setHoldings,
  setTransactions,
  setImportHistory,
  setSettlement,
  setAnalytics,
  setAuditLogs,
  setTargets,
  setTargetCategories,
  setAutomationStatus,
  setLoading,
  setError,
} = portfolioSlice.actions;

export default portfolioSlice.reducer;
