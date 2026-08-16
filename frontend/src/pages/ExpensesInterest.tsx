import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  FormControl, Select, MenuItem, InputLabel, Alert, Grid, Collapse, Button,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField, Snackbar
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CalculateIcon from '@mui/icons-material/Calculate';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import GavelIcon from '@mui/icons-material/Gavel';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, Cell, Area, AreaChart, LineChart
} from 'recharts';

// INR Formatting helper
const fmt = (v: number) =>
  `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fmtDec = (v: number) =>
  `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Compact formatting for axes (e.g. 1L, 10K)
const fmtShort = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 100_000) return `${parseFloat((v / 100_000).toFixed(2))}L`;
  if (abs >= 1_000)   return `${parseFloat((v / 1_000).toFixed(1))}K`;
  return String(Math.round(v));
};

const ExpensesInterest: React.FC = () => {
  const [broker, setBroker] = useState('All');
  const [data, setData] = useState<any>({ months: [], mstock_files_missing: false, ledger_exists: false, tax_pnl_exists: false, zerodha_files_exist: false, mstock_ka_files_missing: false, mstock_ka_ledger_exists: false, mstock_ka_tax_pnl_exists: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  // Pull automation states
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [selectedBrokerForPull, setSelectedBrokerForPull] = useState<'mstock' | 'mstock_ka' | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [pullLoading, setPullLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  const fetchData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/analytics/expenses-interest', {
        params: { broker }
      });
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch expenses and interest analytics.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [broker]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  const handlePullClick = async (brokerType: 'mstock' | 'mstock_ka') => {
    try {
      setPullLoading(true);
      setSnackbar({
        open: true,
        message: `Triggering OTP for ${brokerType === 'mstock' ? 'MStock' : 'MStock_KA'}... Please wait.`,
        severity: 'info'
      });
      
      const res = await axios.post('/api/analytics/pull-expenses/initiate', {
        broker: brokerType
      });
      
      setSnackbar({
        open: true,
        message: res.data.message || 'OTP triggered! Please enter the code below.',
        severity: 'success'
      });
      setSelectedBrokerForPull(brokerType);
      setOtpValue('');
      setOtpDialogOpen(true);
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || `Failed to trigger OTP for ${brokerType.toUpperCase()}.`,
        severity: 'error'
      });
    } finally {
      setPullLoading(false);
    }
  };

  const handleSubmitOtp = async () => {
    if (!selectedBrokerForPull || otpValue.length !== 6) return;
    try {
      setPullLoading(true);
      const res = await axios.post('/api/analytics/pull-expenses', {
        broker: selectedBrokerForPull,
        otp: otpValue
      });
      setSnackbar({
        open: true,
        message: res.data.message || `Successfully pulled ${selectedBrokerForPull.toUpperCase()} expenses!`,
        severity: 'success'
      });
      setOtpDialogOpen(false);
      fetchData(false); // Reload page data without full loading spinner
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || `Failed to pull ${selectedBrokerForPull.toUpperCase()} expenses.`,
        severity: 'error'
      });
    } finally {
      setPullLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8, height: '100%' }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const activeMonths = (data.months || []).filter((m: any) =>
    m.realized_pnl !== 0 || m.mtf_interest !== 0 || m.dp_charges !== 0 ||
    m.pledge_charges !== 0 || m.brokerage !== 0 || m.tax_other_stt !== 0
  );

  // Aggregations
  const totalRealizedPnl  = activeMonths.reduce((sum: number, m: any) => sum + m.realized_pnl,   0);
  const totalMtfInterest  = activeMonths.reduce((sum: number, m: any) => sum + m.mtf_interest,   0);
  const totalDpCharges    = activeMonths.reduce((sum: number, m: any) => sum + m.dp_charges,     0);
  const totalPledge       = activeMonths.reduce((sum: number, m: any) => sum + (m.pledge_charges || 0), 0);
  const totalBrokerage    = activeMonths.reduce((sum: number, m: any) => sum + m.brokerage,      0);
  const totalTaxStt       = activeMonths.reduce((sum: number, m: any) => sum + m.tax_other_stt,  0);
  const totalActualNet    = activeMonths.reduce((sum: number, m: any) => sum + m.actual_net_pnl, 0);

  const totalExpenses = totalMtfInterest + totalDpCharges + totalPledge + totalBrokerage + totalTaxStt;
  const expensePercentage = totalRealizedPnl > 0 ? (totalExpenses / totalRealizedPnl) * 100 : 0;

  // Find latest MTF position
  const latestMtfPosition = activeMonths.length > 0 ? activeMonths[activeMonths.length - 1].mtf_position : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      
      {/* Header Block */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, background: 'linear-gradient(90deg, #f8fafc 40%, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Expenses & Interest
          </Typography>
          <Typography variant="body2" color="text.secondary">
            MTF outstanding, broker charges, and actual net realized profit adjustments
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => handlePullClick('mstock')}
            disabled={loading || pullLoading}
            sx={{ 
              fontWeight: 600, 
              textTransform: 'none',
              bgcolor: '#2563eb',
              '&:hover': { bgcolor: '#1d4ed8' }
            }}
          >
            Pull Mstock exp
          </Button>

          <Button
            variant="contained"
            color="secondary"
            size="small"
            onClick={() => handlePullClick('mstock_ka')}
            disabled={loading || pullLoading}
            sx={{ 
              fontWeight: 600, 
              textTransform: 'none',
              bgcolor: '#7c3aed',
              '&:hover': { bgcolor: '#6d28d9' }
            }}
          >
            Pull Mstock_KA exp.
          </Button>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="broker-select-label">Select Broker</InputLabel>
            <Select
              labelId="broker-select-label"
              value={broker}
              label="Select Broker"
              onChange={(e) => setBroker(e.target.value)}
              sx={{
                bgcolor: 'rgba(22,24,36,0.85)',
                border: '1px solid #2a2e43',
                '& .MuiOutlinedInput-notchedOutline': { border: 'none' }
              }}
            >
              <MenuItem value="All">All Brokers</MenuItem>
              <MenuItem value="MStock">MStock</MenuItem>
              <MenuItem value="Mstock_KA">Mstock_KA</MenuItem>
              <MenuItem value="Zerodha">Zerodha</MenuItem>
              <MenuItem value="Dhan">Dhan</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* MStock files missing alert */}
      {data.mstock_files_missing && (broker === 'All' || broker === 'MStock') && (
        <Alert
          severity="warning"
          sx={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            color: '#fbbf24',
            alignItems: 'center',
            mb: 1
          }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setShowInstructions(!showInstructions)}
              endIcon={showInstructions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ fontWeight: 600 }}
            >
              Instructions
            </Button>
          }
        >
          MStock ledger files not detected in the workspace root. MStock expenses will be calculated as ₹0.00.
        </Alert>
      )}

      {/* Mstock_KA files missing alert */}
      {data.mstock_ka_files_missing && (broker === 'All' || broker === 'Mstock_KA') && (
        <Alert
          severity="warning"
          sx={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            color: '#fbbf24',
            alignItems: 'center',
            mb: 1
          }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setShowInstructions(!showInstructions)}
              endIcon={showInstructions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ fontWeight: 600 }}
            >
              Instructions
            </Button>
          }
        >
          Mstock_KA ledger files not detected in the workspace root. Mstock_KA expenses will be calculated as ₹0.00.
        </Alert>
      )}

      {/* Collapsible Setup Instructions */}
      <Collapse in={showInstructions || (data.mstock_files_missing || data.mstock_ka_files_missing) && activeMonths.length === 0}>
        <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px dashed #fbbf24', borderRadius: 3, p: 2 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#fbbf24' }}>
              How to copy files to workspace:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Please copy these files into your main project directory to enable tracking of MTF interest, DP charges, STT, and brokerage:
            </Typography>
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', p: 2, borderRadius: 2, border: '1px solid #2a2e43' }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1, color: '#f8fafc' }}>
                📂 Workspace Location: <strong>C:\My_work_RA\Antigravity</strong>
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 0.5, color: '#38bdf8' }}>
                📄 MA108170_Ledger_Report.xlsx (MStock Ledger statement)
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1, color: '#34d399' }}>
                📄 Tax_PNL_mstock.xlsx (MStock Tax P&L Statement)
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 0.5, color: '#ab47bc' }}>
                📄 MA135204_Ledger_Report.xlsx (Mstock_KA Ledger statement)
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#ec407a' }}>
                📄 Tax_PNL_Mstock_KA.xlsx (Mstock_KA Tax P&L Statement)
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Collapse>

      {/* Info for Zerodha — file-based tracking active */}
      {broker === 'Zerodha' && data.zerodha_files_exist && (
        <Alert severity="success" sx={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399' }}>
          Realized P&L is loaded for Zerodha from database closed lots. Charges & interest are sourced from the Expense folder (taxpnl + Interest Statement files).
        </Alert>
      )}
      {broker === 'Zerodha' && !data.zerodha_files_exist && (
        <Alert severity="info" sx={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
          Zerodha expense files not found in the <strong>Expense/</strong> folder. Charges & interest will default to ₹0.00.
        </Alert>
      )}
      {/* Warning for other brokers where files are not supported yet */}
      {broker !== 'MStock' && broker !== 'All' && broker !== 'Zerodha' && (
        <Alert severity="info" sx={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
          Realized P&L is loaded for {broker} from database closed lots. Charges & interest tracking is currently not supported for {broker} statements and defaults to ₹0.00.
        </Alert>
      )}

      {/* KPI Cards Row */}
      <Grid container spacing={2}>
        
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2a2e43', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Gross Realized P&L
                </Typography>
                <LocalAtmIcon sx={{ color: '#8b5cf6', fontSize: 20 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: totalRealizedPnl >= 0 ? '#10b981' : '#ef4444' }}>
                {fmt(totalRealizedPnl)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                LIFO gross closed profit
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2a2e43', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  MTF Interest Paid
                </Typography>
                <AccountBalanceIcon sx={{ color: '#38bdf8', fontSize: 20 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#fbbf24' }}>
                {fmt(totalMtfInterest)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Mirae funding interest
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2a2e43', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  DP & Brokerage
                </Typography>
                <CalculateIcon sx={{ color: '#ec4899', fontSize: 20 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#f43f5e' }}>
                {fmt(totalDpCharges + totalPledge + totalBrokerage)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Broker fees, DP & pledge charges
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2a2e43', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Taxes & STT
                </Typography>
                <GavelIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#f59e0b' }}>
                {fmt(totalTaxStt)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Govt levies & stamp duty
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2962ff', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Actual Net Realized
                </Typography>
                {totalActualNet >= 0 ? <ArrowUpwardIcon sx={{ color: '#10b981', fontSize: 20 }} /> : <ArrowDownwardIcon sx={{ color: '#ef4444', fontSize: 20 }} />}
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: totalActualNet >= 0 ? '#10b981' : '#ef4444' }}>
                {fmt(totalActualNet)}
              </Typography>
              <Chip
                label={`${expensePercentage.toFixed(1)}% gross consumed`}
                size="small"
                sx={{
                  bgcolor: 'rgba(245,158,11,0.08)',
                  color: '#fbbf24',
                  fontSize: 10,
                  fontWeight: 600,
                  height: 20,
                  mt: 0.5
                }}
              />
            </CardContent>
          </Card>
        </Grid>

      </Grid>

      {/* Row 2 — Charts (Profit Comparison, Interest vs Trade Expenses, MTF Position) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
        
        {/* Profit Comparison Bar Chart */}
        <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2a2e43', borderRadius: 3, p: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc', mb: 0.5 }}>
              Gross Realized P&L vs Actual Net P&L
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Deductions month-on-month showing the impact of MTF leverage cost & transaction expenses for {broker === 'All' ? 'All Brokers' : broker}
            </Typography>
            {activeMonths.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280 }}>
                <Typography color="text.secondary">No data available for this selection.</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={activeMonths}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <Box sx={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 2, p: 1.5 }}>
                          <Typography variant="body2" sx={{ color: '#f8fafc', fontWeight: 700, mb: 0.5 }}>
                            {d.month}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#8b5cf6' }}>
                            Gross realized: {fmtDec(d.realized_pnl)}
                          </Typography>
                          {broker !== 'Dhan' && (
                            <>
                              <Typography variant="body2" sx={{ color: '#fbbf24' }}>
                                MTF Interest: -{fmtDec(d.mtf_interest)}
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#f43f5e' }}>
                                DP & Brokerage: -{fmtDec(d.dp_charges + d.brokerage)}
                              </Typography>
                              {(d.pledge_charges || 0) > 0 && (
                                <Typography variant="body2" sx={{ color: '#f43f5e' }}>
                                  Pledge Charges: -{fmtDec(d.pledge_charges)}
                                </Typography>
                              )}
                              <Typography variant="body2" sx={{ color: '#f59e0b' }}>
                                Taxes & STT: -{fmtDec(d.tax_other_stt)}
                              </Typography>
                            </>
                          )}
                          <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600, mt: 0.5 }}>
                            Actual Net: {fmtDec(d.actual_net_pnl)}
                          </Typography>
                        </Box>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="realized_pnl" name="Gross P&L" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual_net_pnl" name="Actual Net P&L" fill="#10b981" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* MTF Interest vs Trade Expenses Line Chart */}
        <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2a2e43', borderRadius: 3, p: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc', mb: 0.5 }}>
              Interest vs Trade Expenses
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Financing cost (MTF Interest) vs transactional expenses (DP + Brokerage + Taxes & STT)
            </Typography>
            {activeMonths.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280 }}>
                <Typography color="text.secondary">No data available for this selection.</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={activeMonths.map((m: any) => ({
                  ...m,
                  trade_expenses: m.dp_charges + (m.pledge_charges || 0) + m.brokerage + m.tax_other_stt
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      const tradeExp = d.dp_charges + (d.pledge_charges || 0) + d.brokerage + d.tax_other_stt;
                      return (
                        <Box sx={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 2, p: 1.5 }}>
                          <Typography variant="body2" sx={{ color: '#f8fafc', fontWeight: 700, mb: 0.5 }}>
                            {d.month}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#fbbf24' }}>
                            MTF Interest: {fmtDec(d.mtf_interest)}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#f43f5e' }}>
                            Trade Expenses: {fmtDec(tradeExp)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: 10 }}>
                            (DP: {fmt(d.dp_charges)} | Pledge: {fmt(d.pledge_charges || 0)} | Brokerage: {fmt(d.brokerage)} | Tax: {fmt(d.tax_other_stt)})
                          </Typography>
                        </Box>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Line type="monotone" dataKey="mtf_interest" name="MTF Interest" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="trade_expenses" name="Trade Exp." stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Outstanding MTF Position Line Chart */}
        <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2a2e43', borderRadius: 3, p: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc', mb: 0.5 }}>
                  Outstanding MTF Position
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Outstanding loan liability funding long-term positions
                </Typography>
              </Box>
              {latestMtfPosition > 0 && (
                <Chip label={`Latest: ${fmt(latestMtfPosition)}`} sx={{ bgcolor: 'rgba(56,189,248,0.1)', color: '#38bdf8', fontWeight: 600, fontSize: 11 }} />
              )}
            </Box>
            {broker === 'Dhan' || latestMtfPosition === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 280, gap: 1 }}>
                <Typography color="text.secondary">
                  {broker === 'Dhan' ? `MTF Position is not applicable for ${broker}.` : 'No MTF loan data available for this selection.'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', px: 3 }}>
                  MTF Outstanding leverage tracking is supported for MStock and Zerodha.
                </Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={activeMonths}>
                  <defs>
                    <linearGradient id="colorMtf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <Box sx={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 2, p: 1.5 }}>
                          <Typography variant="body2" sx={{ color: '#f8fafc', fontWeight: 700, mb: 0.5 }}>
                            {d.month}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#38bdf8', fontWeight: 600 }}>
                            MTF Funding: {fmtDec(d.mtf_position)}
                          </Typography>
                        </Box>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="mtf_position" name="MTF Loan Balance" stroke="#38bdf8" strokeWidth={2.5} fillOpacity={1} fill="url(#colorMtf)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

      </Box>

      {/* Row 3 — Monthly Breakdown Grid */}
      <Card sx={{ background: 'rgba(22,24,36,0.85)', border: '1px solid #2a2e43', borderRadius: 3, p: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc', mb: 2 }}>
            Monthly Breakdown Statement ({broker === 'All' ? 'All Brokers' : broker})
          </Typography>
          {activeMonths.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No statement entries available.</Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
              <Table size="medium">
                <TableHead sx={{ borderBottom: '1px solid #2a2e43' }}>
                  <TableRow>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }}>Month</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }} align="right">Gross LIFO P&L</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }} align="right">MTF Interest</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }} align="right">DP Charges</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }} align="right">Pledge Charges</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }} align="right">Brokerage</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }} align="right">Taxes & STT</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }} align="right">Actual Net P&L</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }} align="right">MTF Loan Position</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeMonths.map((row: any) => (
                    <TableRow key={row.month} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }, borderBottom: '1px solid #1f2235' }}>
                      <TableCell sx={{ color: '#f8fafc', fontWeight: 500 }}>{row.month}</TableCell>
                      <TableCell sx={{ color: row.realized_pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }} align="right">
                        {fmt(row.realized_pnl)}
                      </TableCell>
                      <TableCell sx={{ color: '#fbbf24' }} align="right">{row.mtf_interest > 0 ? `-${fmt(row.mtf_interest)}` : '₹0'}</TableCell>
                      <TableCell sx={{ color: '#f43f5e' }} align="right">{row.dp_charges > 0 ? `-${fmt(row.dp_charges)}` : '₹0'}</TableCell>
                      <TableCell sx={{ color: '#a78bfa' }} align="right">{(row.pledge_charges || 0) > 0 ? `-${fmt(row.pledge_charges)}` : '₹0'}</TableCell>
                      <TableCell sx={{ color: '#f43f5e' }} align="right">{row.brokerage > 0 ? `-${fmt(row.brokerage)}` : '₹0'}</TableCell>
                      <TableCell sx={{ color: '#f59e0b' }} align="right">{row.tax_other_stt > 0 ? `-${fmt(row.tax_other_stt)}` : '₹0'}</TableCell>
                      <TableCell sx={{ color: row.actual_net_pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }} align="right">
                        {fmt(row.actual_net_pnl)}
                      </TableCell>
                      <TableCell sx={{ color: '#38bdf8', fontWeight: 500 }} align="right">
                        {row.mtf_position > 0 ? fmt(row.mtf_position) : '₹0'}
                      </TableCell>
                    </TableRow>

                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* OTP Input Dialog */}
      <Dialog 
        open={otpDialogOpen} 
        onClose={() => !pullLoading && setOtpDialogOpen(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#161824',
              border: '1px solid #2a2e43',
              borderRadius: 3,
              p: 1,
              minWidth: 320
            }
          }
        }}
      >
        <DialogTitle sx={{ color: '#f8fafc', fontWeight: 700 }}>
          Enter OTP for {selectedBrokerForPull === 'mstock' ? 'MStock' : 'MStock_KA'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary', mb: 2 }}>
            Please enter the 6-digit OTP/TOTP code sent to your registered mobile number/device.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="6-Digit OTP"
            type="text"
            fullWidth
            variant="outlined"
            value={otpValue}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              setOtpValue(val);
            }}
            disabled={pullLoading}
            slotProps={{
              input: {
                style: { textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.2rem' }
              }
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                color: '#f8fafc',
                '& fieldset': { borderColor: '#2a2e43' },
                '&:hover fieldset': { borderColor: '#3b82f6' },
                '&.Mui-focused fieldset': { borderColor: '#3b82f6' }
              },
              '& .MuiInputLabel-root': { color: 'text.secondary' }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setOtpDialogOpen(false)} 
            disabled={pullLoading}
            sx={{ color: 'text.secondary', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmitOtp} 
            disabled={pullLoading || otpValue.length !== 6}
            variant="contained"
            color="primary"
            sx={{ textTransform: 'none' }}
            startIcon={pullLoading && <CircularProgress size={16} color="inherit" />}
          >
            {pullLoading ? 'Pulling...' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar Notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity} 
          sx={{ 
            width: '100%',
            bgcolor: snackbar.severity === 'success' ? '#065f46' : '#991b1b',
            color: '#f8fafc',
            border: '1px solid',
            borderColor: snackbar.severity === 'success' ? '#047857' : '#b91c1c',
            '& .MuiAlert-icon': { color: '#f8fafc' },
            '& .MuiAlert-action svg': { color: '#f8fafc' }
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

    </Box>
  );
};

export default ExpensesInterest;
