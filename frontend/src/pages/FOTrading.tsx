import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Tooltip,
  Tabs,
  Tab,
  Alert,
  Collapse,
  IconButton,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import BalanceIcon from '@mui/icons-material/Balance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import HistoryIcon from '@mui/icons-material/History';
import BarChartIcon from '@mui/icons-material/BarChart';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LayersIcon from '@mui/icons-material/Layers';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  LabelList,
  Legend,
} from 'recharts';

interface FOTradingProps {
  showToast?: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

const fmtCurrency = (v: number | null | undefined, decimals = 0) => {
  if (v == null || isNaN(Number(v))) return '—';
  const num = Number(v);
  const sign = num < 0 ? '-' : '';
  return `${sign}₹${Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

const fmtSignedCurrency = (v: number | null | undefined, decimals = 0) => {
  if (v == null || isNaN(Number(v))) return '—';
  const num = Number(v);
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${sign}₹${Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    const clean = d.split('T')[0].split(' ')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return clean;
  } catch {
    return d;
  }
};

const fmtDateTime = (dt: string | null | undefined) => {
  if (!dt) return '—';
  const parts = dt.replace('T', ' ').split(' ');
  const datePart = fmtDate(parts[0]);
  const timePart = parts[1] ? parts[1].slice(0, 8) : '';
  return timePart ? `${datePart} ${timePart}` : datePart;
};

const FOTrading: React.FC<FOTradingProps> = ({ showToast }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncingTradebook, setSyncingTradebook] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Selected expiry filter ('ALL' or expiry_code like '26DEC', '27MAR', '27DEC')
  const [selectedExpiry, setSelectedExpiry] = useState<string>('ALL');

  // Show today's exited / shifted contracts collapsible
  const [showExitedToday, setShowExitedToday] = useState<boolean>(false);

  // Selected instrument for historical transactions & bar chart
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [historyData, setHistoryData] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Chart & History table view controls
  const [chartMetric, setChartMetric] = useState<'lots' | 'price'>('lots');
  const [historyTab, setHistoryTab] = useState<0 | 1 | 2>(0); // 0 = All Executions, 1 = Daily Consolidated, 2 = Net Consolidation

  const loadDashboard = useCallback(async (refresh = false) => {
    try {
      if (!data) setLoading(true);
      setError('');
      const res = await axios.get(`/api/fo/nifty?refresh=${refresh}`);
      const payload = res.data;
      setData(payload);

      // Auto-select first open PE or CE position if nothing selected yet
      if (!selectedSymbol) {
        const firstOpen =
          payload.pe_positions?.[0]?.tradingsymbol ||
          payload.ce_positions?.[0]?.tradingsymbol ||
          payload.historical_contracts?.[0]?.symbol ||
          '';
        if (firstOpen) {
          setSelectedSymbol(firstOpen);
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to load Nifty F&O positions.';
      setError(msg);
      if (showToast) showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [data, selectedSymbol, showToast]);

  const loadContractHistory = useCallback(async (sym: string) => {
    if (!sym) return;
    try {
      setHistoryLoading(true);
      const res = await axios.get(`/api/fo/nifty/history/${encodeURIComponent(sym)}`);
      setHistoryData(res.data);
    } catch (err: any) {
      console.error('Failed to load contract history:', err);
      if (showToast) showToast('Failed to load historical transactions for ' + sym, 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDashboard(false);
  }, []);

  useEffect(() => {
    if (selectedSymbol) {
      loadContractHistory(selectedSymbol);
    }
  }, [selectedSymbol, loadContractHistory]);

  // Refresh F&O LTPs and contract history every 5 minutes (300,000 ms)
  useEffect(() => {
    const interval = setInterval(() => {
      loadDashboard(true);
      if (selectedSymbol) {
        loadContractHistory(selectedSymbol);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadDashboard, loadContractHistory, selectedSymbol]);

  const handleSyncPositions = async (withTradebook = false) => {
    try {
      if (withTradebook) {
        setSyncingTradebook(true);
        if (showToast) showToast('Syncing Zerodha live positions & Console F&O tradebook...', 'info');
      } else {
        setSyncing(true);
        if (showToast) showToast('Pulling latest Nifty F&O positions from Zerodha...', 'info');
      }

      const res = await axios.post(`/api/fo/nifty/sync?sync_tradebook=${withTradebook}`);
      if (res.data?.data) {
        setData(res.data.data);
      }
      if (selectedSymbol) {
        await loadContractHistory(selectedSymbol);
      }
      if (showToast) {
        showToast(
          withTradebook
            ? 'Synced live Zerodha Nifty positions & Console F&O tradebook!'
            : 'Latest Nifty positions pulled from Zerodha!',
          'success'
        );
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to sync with Zerodha.';
      if (showToast) showToast(msg, 'error');
    } finally {
      setSyncing(false);
      setSyncingTradebook(false);
    }
  };

  // Filtered PE and CE open positions by selectedExpiry
  const filteredPE = useMemo(() => {
    const list = data?.pe_positions || [];
    if (selectedExpiry === 'ALL') return list;
    return list.filter((p: any) => p.expiry_code === selectedExpiry);
  }, [data, selectedExpiry]);

  const filteredCE = useMemo(() => {
    const list = data?.ce_positions || [];
    if (selectedExpiry === 'ALL') return list;
    return list.filter((p: any) => p.expiry_code === selectedExpiry);
  }, [data, selectedExpiry]);

  // Selected position live snapshot (if currently in open or closed_today positions)
  const selectedPositionLive = useMemo(() => {
    if (!data || !selectedSymbol) return null;
    const allPos = [
      ...(data.pe_positions || []),
      ...(data.ce_positions || []),
      ...(data.closed_today_positions || []),
    ];
    return allPos.find((p: any) => p.tradingsymbol === selectedSymbol) || null;
  }, [data, selectedSymbol]);

  // Custom bar labels for the Buy/Sell Lots chart
  const renderBuyBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!value || value <= 0) return null;
    const labelText =
      chartMetric === 'price'
        ? `₹${Math.round(value).toLocaleString('en-IN')}`
        : `+${value}L`;
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill="#ffffff"
        fontSize={14.5}
        fontWeight={700}
        textAnchor="middle"
      >
        {labelText}
      </text>
    );
  };

  const renderSellBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!value || value <= 0) return null;
    const labelText =
      chartMetric === 'price'
        ? `₹${Math.round(value).toLocaleString('en-IN')}`
        : `-${value}L`;
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill="#ffffff"
        fontSize={14.5}
        fontWeight={700}
        textAnchor="middle"
      >
        {labelText}
      </text>
    );
  };

  const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <Box
          sx={{
            background: '#161824',
            border: '1px solid #2a2e43',
            borderRadius: 2,
            p: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            minWidth: 210,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.8, color: '#f8fafc' }}>
            Date: {fmtDate(item.date)}
          </Typography>
          {item.buyLots > 0 && (
            <Box sx={{ mb: 0.5 }}>
              <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 700 }}>
                Buy: +{item.buyLots} Lots
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
                Avg Buy Price: ₹{Number(item.buyPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })} • Value: {fmtCurrency(item.buyValue)}
              </Typography>
            </Box>
          )}
          {item.sellLots > 0 && (
            <Box sx={{ mb: 0.5 }}>
              <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 700 }}>
                Sell: -{item.sellLots} Lots
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
                Avg Sell Price: ₹{Number(item.sellPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })} • Value: {fmtCurrency(item.sellValue)}
              </Typography>
            </Box>
          )}
          <Divider sx={{ my: 0.8, borderColor: '#2a2e43' }} />
          <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 600 }}>
            Cumulative Net Position: {item.cumulativeNetLots > 0 ? `+${item.cumulativeNetLots}` : item.cumulativeNetLots} Lots
          </Typography>
        </Box>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 420, gap: 2 }}>
        <CircularProgress size={42} />
        <Typography color="text.secondary">Loading Zerodha Nifty F&O Positions & Iron Condor Analysis...</Typography>
      </Box>
    );
  }

  if (error && !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="contained" startIcon={<SyncIcon />} onClick={() => loadDashboard(true)}>
          Retry Connection
        </Button>
      </Box>
    );
  }

  const summary = data?.summary || {};
  const expiryList = data?.expiry_breakdown || [];
  const totalSpreadLots = (summary.pe_short_lots || 0) + (summary.ce_short_lots || 0);
  const peSharePct = totalSpreadLots > 0 ? ((summary.pe_short_lots || 0) / totalSpreadLots) * 100 : 50;
  const ceSharePct = totalSpreadLots > 0 ? ((summary.ce_short_lots || 0) / totalSpreadLots) * 100 : 50;

  return (
    <Box className="fade-in" sx={{ pb: 4 }}>
      {/* ─── TOP HEADER BAR ────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          mb: 3,
          p: 2.5,
          borderRadius: 3,
          background: 'linear-gradient(135deg, rgba(41, 98, 255, 0.12) 0%, rgba(22, 24, 36, 0.95) 60%)',
          border: '1px solid #2a2e43',
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.3 }}>
              NIFTY F&amp;O Trading &amp; Iron Condor Manager
            </Typography>
            <Chip
              label="BROKER: ZERODHA (NFO)"
              size="small"
              sx={{ bgcolor: 'rgba(41, 98, 255, 0.2)', color: '#60a5fa', fontWeight: 700, fontSize: 11 }}
            />
            <Chip
              label={`1 LOT = ${data?.lot_size || 65} QTY`}
              size="small"
              sx={{ bgcolor: 'rgba(139, 92, 246, 0.18)', color: '#c4b5fd', fontWeight: 700, fontSize: 11 }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Long-Dated Nifty Option Spreads • Expiry &amp; Strike Shift Tracker • PE vs CE Iron Condor Balance
            {data?.last_synced && (
              <span style={{ marginLeft: 12, color: '#64748b' }}>
                • Last Synced: {fmtDateTime(data.last_synced)}
              </span>
            )}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Live Nifty Spot Price Badge */}
          {data?.spot_price && (
            <Box
              sx={{
                px: 2,
                py: 0.8,
                borderRadius: 2,
                bgcolor: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid #2a2e43',
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
              }}
            >
              <Box>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>
                  NIFTY 50 SPOT
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#f8fafc', lineHeight: 1.2 }}>
                    ₹{Number(data.spot_price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: (data.spot_change_pct || 0) >= 0 ? '#10b981' : '#ef4444',
                    }}
                  >
                    {(data.spot_change_pct || 0) >= 0 ? '+' : ''}
                    {Number(data.spot_change_pct || 0).toFixed(2)}%
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}

          <Button
            variant="contained"
            size="small"
            startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
            disabled={syncing || syncingTradebook}
            onClick={() => handleSyncPositions(false)}
            sx={{ borderRadius: 2, fontWeight: 600, py: 0.9, px: 2 }}
          >
            {syncing ? 'Pulling Positions...' : 'Pull Latest Zerodha Positions'}
          </Button>

          <Tooltip title="Also downloads the latest F&O Tradebook Excel from Zerodha Console">
            <Button
              variant="outlined"
              size="small"
              startIcon={syncingTradebook ? <CircularProgress size={16} color="inherit" /> : <CloudDownloadIcon />}
              disabled={syncing || syncingTradebook}
              onClick={() => handleSyncPositions(true)}
              sx={{ borderRadius: 2, fontWeight: 600, py: 0.9, borderColor: '#2a2e43', color: '#cbd5e1' }}
            >
              {syncingTradebook ? 'Syncing Tradebook...' : 'Sync Console Tradebook'}
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {/* ─── IRON CONDOR PE vs CE BALANCE METER ────────────────────────────────── */}
      <Card
        sx={{
          mb: 3,
          background: 'rgba(22, 24, 36, 0.85)',
          border: `1px solid ${
            summary.balance_status === 'BALANCED' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.45)'
          }`,
          borderRadius: 2.5,
        }}
      >
        <CardContent sx={{ p: 2.5 }}>
          <Grid container spacing={2.5} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <BalanceIcon sx={{ color: summary.balance_status === 'BALANCED' ? '#10b981' : '#f59e0b', fontSize: 26 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: 20.8 }}>
                  Iron Condor Balance Meter (PE Spread vs CE Spread)
                </Typography>
                <Chip
                  size="small"
                  label={
                    summary.balance_status === 'PE_HEAVY'
                      ? `PE Heavy by +${summary.imbalance_lots} Lots`
                      : summary.balance_status === 'CE_HEAVY'
                      ? `CE Heavy by +${Math.abs(summary.imbalance_lots)} Lots`
                      : 'Balanced Iron Condor'
                  }
                  sx={{
                    height: 28,
                    bgcolor:
                      summary.balance_status === 'BALANCED'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                    color: summary.balance_status === 'BALANCED' ? '#10b981' : '#f59e0b',
                    fontWeight: 700,
                    fontSize: 14.3,
                  }}
                />
              </Box>

              <Typography variant="body2" sx={{ color: '#cbd5e1', mb: 1.5, fontSize: 18.2 }}>
                {String(summary.recommendation || '').replace(/\s*\([\d,]+\s*Qty\)/gi, '')}
              </Typography>

              {/* Visual PE vs CE Proportion Bar */}
              <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, fontSize: 15.6, fontWeight: 700, flexWrap: 'wrap', gap: 1 }}>
                  <span style={{ color: '#38bdf8' }}>
                    PE Spreads: {summary.pe_short_lots} Short Lots / {summary.pe_long_lots} Long Hedge Lots
                  </span>
                  <span style={{ color: '#f472b6' }}>
                    CE Spreads: {summary.ce_short_lots} Short Lots / {summary.ce_long_lots} Long Hedge Lots
                  </span>
                </Box>
                <Box
                  sx={{
                    height: 14,
                    borderRadius: 6,
                    overflow: 'hidden',
                    display: 'flex',
                    bgcolor: '#0f172a',
                    border: '1px solid #2a2e43',
                  }}
                >
                  <Box
                    sx={{
                      width: `${peSharePct}%`,
                      bgcolor: '#0284c7',
                      transition: 'width 0.4s ease',
                    }}
                    title={`PE Share: ${peSharePct.toFixed(1)}%`}
                  />
                  <Box
                    sx={{
                      width: `${ceSharePct}%`,
                      bgcolor: '#db2777',
                      transition: 'width 0.4s ease',
                    }}
                    title={`CE Share: ${ceSharePct.toFixed(1)}%`}
                  />
                </Box>
              </Box>
            </Grid>

            {/* Right KPI Mini-Grid */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Grid container spacing={1.5}>
                {[
                  {
                    label: 'PE Net Credit Collected',
                    val: fmtCurrency(summary.pe_net_credit_val),
                    sub: `${summary.pe_short_lots}L Short / ${summary.pe_long_lots}L Long`,
                    color: '#38bdf8',
                  },
                  {
                    label: 'CE Net Credit Collected',
                    val: fmtCurrency(summary.ce_net_credit_val),
                    sub: `${summary.ce_short_lots}L Short / ${summary.ce_long_lots}L Long`,
                    color: '#f472b6',
                  },
                  {
                    label: 'Combined Open P&L',
                    val: fmtSignedCurrency(summary.total_open_pnl),
                    sub: `PE: ${fmtSignedCurrency(summary.pe_pnl)} | CE: ${fmtSignedCurrency(summary.ce_pnl)}`,
                    color: (summary.total_open_pnl || 0) >= 0 ? '#10b981' : '#ef4444',
                  },
                  {
                    label: 'Day M2M (Active)',
                    val: fmtSignedCurrency(summary.total_day_m2m),
                    sub: `Exited Today P&L: ${fmtSignedCurrency(summary.closed_today_pnl)}`,
                    color: (summary.total_day_m2m || 0) >= 0 ? '#10b981' : '#ef4444',
                  },
                ].map((k) => (
                  <Grid size={{ xs: 6 }} key={k.label}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid #2a2e43',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 13, textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                        {k.label}
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: 20.8, color: k.color, lineHeight: 1.3 }}>
                        {k.val}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13.7 }}>
                        {k.sub}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ─── EXPIRY-WISE PE vs CE BREAKDOWN MATRIX ─────────────────────────────── */}
      <Card sx={{ mb: 3, background: 'rgba(22, 24, 36, 0.75)', border: '1px solid #2a2e43', borderRadius: 2.5 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LayersIcon sx={{ color: '#2962ff', fontSize: 26 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: 20.8 }}>
                Expiry-Wise PE vs CE Position Matrix (Click Expiry to Filter)
              </Typography>
            </Box>

            {/* Expiry Filter Chips */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`ALL EXPIRIES (${(data?.pe_positions?.length || 0) + (data?.ce_positions?.length || 0)} Legs)`}
                clickable
                onClick={() => setSelectedExpiry('ALL')}
                sx={{
                  height: 30,
                  fontWeight: 700,
                  fontSize: 14.3,
                  bgcolor: selectedExpiry === 'ALL' ? '#2962ff' : 'rgba(41, 98, 255, 0.1)',
                  color: selectedExpiry === 'ALL' ? '#fff' : '#94a3b8',
                }}
              />
              {expiryList.map((exp: any) => (
                <Chip
                  key={exp.expiry_code}
                  label={`${exp.expiry_label} (${exp.days_to_expiry}d) • PE:${exp.pe_short_lots}L / CE:${exp.ce_short_lots}L`}
                  clickable
                  onClick={() => setSelectedExpiry(selectedExpiry === exp.expiry_code ? 'ALL' : exp.expiry_code)}
                  sx={{
                    height: 30,
                    fontWeight: 700,
                    fontSize: 14.3,
                    bgcolor: selectedExpiry === exp.expiry_code ? '#2962ff' : 'rgba(255, 255, 255, 0.05)',
                    color: selectedExpiry === exp.expiry_code ? '#fff' : '#cbd5e1',
                    border: '1px solid #2a2e43',
                  }}
                />
              ))}
            </Box>
          </Box>

          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Expiry Contract</TableCell>
                  <TableCell align="center" sx={{ color: '#38bdf8', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>PE Short / Long (Lots)</TableCell>
                  <TableCell sx={{ color: '#38bdf8', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>PE Strikes (Short / Long Hedge)</TableCell>
                  <TableCell align="right" sx={{ color: '#38bdf8', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>PE Net Credit</TableCell>
                  <TableCell align="right" sx={{ color: '#38bdf8', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>PE Open P&amp;L</TableCell>
                  <TableCell align="center" sx={{ color: '#f472b6', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>CE Short / Long (Lots)</TableCell>
                  <TableCell sx={{ color: '#f472b6', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>CE Strikes (Short / Long Hedge)</TableCell>
                  <TableCell align="right" sx={{ color: '#f472b6', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>CE Net Credit</TableCell>
                  <TableCell align="right" sx={{ color: '#f472b6', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>CE Open P&amp;L</TableCell>
                  <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Expiry Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expiryList.map((exp: any) => {
                  const isSelected = selectedExpiry === exp.expiry_code;
                  return (
                    <TableRow
                      key={exp.expiry_code}
                      hover
                      onClick={() => setSelectedExpiry(isSelected ? 'ALL' : exp.expiry_code)}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: isSelected ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                      }}
                    >
                      <TableCell sx={{ fontWeight: 700, fontSize: 16.3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <span>{exp.expiry_label}</span>
                          <Chip
                            label={`${exp.days_to_expiry}d`}
                            size="small"
                            sx={{ height: 23, fontSize: 13, fontWeight: 700, bgcolor: 'rgba(148,163,184,0.15)', color: '#cbd5e1' }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                          Exp: {fmtDate(exp.expiry_date)}
                        </Typography>
                      </TableCell>

                      {/* PE Summary */}
                      <TableCell align="center" sx={{ fontSize: 15.6 }}>
                        {exp.pe_short_lots > 0 || exp.pe_long_lots > 0 ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 15.6, color: '#38bdf8' }}>
                              -{exp.pe_short_lots}L / +{exp.pe_long_lots}L
                            </Typography>
                            <Typography variant="caption" sx={{ color: exp.is_pe_hedged ? '#10b981' : '#f59e0b', fontSize: 13, fontWeight: 600 }}>
                              {exp.is_pe_hedged ? '✓ 100% Wing Hedged' : '⚠ Unhedged Ratio'}
                            </Typography>
                          </Box>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </TableCell>

                      <TableCell sx={{ fontSize: 15 }}>
                        {exp.pe_short_strikes.length > 0 || exp.pe_long_strikes.length > 0 ? (
                          <Box>
                            {exp.pe_short_strikes.length > 0 && (
                              <div style={{ color: '#fca5a5' }}>Sell: {exp.pe_short_strikes.join(', ')}</div>
                            )}
                            {exp.pe_long_strikes.length > 0 && (
                              <div style={{ color: '#86efac' }}>Buy: {exp.pe_long_strikes.join(', ')}</div>
                            )}
                          </Box>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </TableCell>

                      <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 600 }}>
                        {exp.pe_net_credit_val !== 0 ? (
                          <Box>
                            <div>{fmtCurrency(exp.pe_net_credit_val)}</div>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                              ₹{exp.pe_net_credit_pts}/pt
                            </Typography>
                          </Box>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </TableCell>

                      <TableCell
                        align="right"
                        sx={{
                          fontSize: 15.6,
                          fontWeight: 700,
                          color: exp.pe_pnl > 0 ? '#10b981' : exp.pe_pnl < 0 ? '#ef4444' : '#64748b',
                        }}
                      >
                        {(exp.pe_net_ltp_val ?? (exp.pe_net_credit_val ? exp.pe_net_credit_val - exp.pe_pnl : 0)) !== 0 ? (
                          <Box>
                            <div>
                              {fmtCurrency(
                                exp.pe_net_ltp_val ?? (exp.pe_net_credit_val - exp.pe_pnl)
                              )}
                            </div>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: 13,
                                color: exp.pe_pnl > 0 ? '#10b981' : exp.pe_pnl < 0 ? '#ef4444' : 'text.secondary',
                              }}
                            >
                              ₹
                              {exp.pe_net_ltp_pts ??
                                (exp.pe_short_qty > 0
                                  ? Math.round(((exp.pe_net_credit_val - exp.pe_pnl) / exp.pe_short_qty) * 100) / 100
                                  : 0)}
                              /pt
                            </Typography>
                          </Box>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </TableCell>

                      {/* CE Summary */}
                      <TableCell align="center" sx={{ fontSize: 15.6 }}>
                        {exp.ce_short_lots > 0 || exp.ce_long_lots > 0 ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 15.6, color: '#f472b6' }}>
                              -{exp.ce_short_lots}L / +{exp.ce_long_lots}L
                            </Typography>
                            <Typography variant="caption" sx={{ color: exp.is_ce_hedged ? '#10b981' : '#f59e0b', fontSize: 13, fontWeight: 600 }}>
                              {exp.is_ce_hedged ? '✓ 100% Wing Hedged' : '⚠ Unhedged Ratio'}
                            </Typography>
                          </Box>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </TableCell>

                      <TableCell sx={{ fontSize: 15 }}>
                        {exp.ce_short_strikes.length > 0 || exp.ce_long_strikes.length > 0 ? (
                          <Box>
                            {exp.ce_short_strikes.length > 0 && (
                              <div style={{ color: '#fca5a5' }}>Sell: {exp.ce_short_strikes.join(', ')}</div>
                            )}
                            {exp.ce_long_strikes.length > 0 && (
                              <div style={{ color: '#86efac' }}>Buy: {exp.ce_long_strikes.join(', ')}</div>
                            )}
                          </Box>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </TableCell>

                      <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 600 }}>
                        {exp.ce_net_credit_val !== 0 ? (
                          <Box>
                            <div>{fmtCurrency(exp.ce_net_credit_val)}</div>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                              ₹{exp.ce_net_credit_pts}/pt
                            </Typography>
                          </Box>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </TableCell>

                      <TableCell
                        align="right"
                        sx={{
                          fontSize: 15.6,
                          fontWeight: 700,
                          color: exp.ce_pnl > 0 ? '#10b981' : exp.ce_pnl < 0 ? '#ef4444' : '#64748b',
                        }}
                      >
                        {(exp.ce_net_ltp_val ?? (exp.ce_net_credit_val ? exp.ce_net_credit_val - exp.ce_pnl : 0)) !== 0 ? (
                          <Box>
                            <div>
                              {fmtCurrency(
                                exp.ce_net_ltp_val ?? (exp.ce_net_credit_val - exp.ce_pnl)
                              )}
                            </div>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: 13,
                                color: exp.ce_pnl > 0 ? '#10b981' : exp.ce_pnl < 0 ? '#ef4444' : 'text.secondary',
                              }}
                            >
                              ₹
                              {exp.ce_net_ltp_pts ??
                                (exp.ce_short_qty > 0
                                  ? Math.round(((exp.ce_net_credit_val - exp.ce_pnl) / exp.ce_short_qty) * 100) / 100
                                  : 0)}
                              /pt
                            </Typography>
                          </Box>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </TableCell>

                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={
                            exp.imbalance_lots > 0
                              ? `PE Only (+${exp.pe_short_lots}L)`
                              : exp.imbalance_lots < 0
                              ? `CE Only (+${exp.ce_short_lots}L)`
                              : `${exp.iron_condor_lots}L Balanced`
                          }
                          sx={{
                            height: 26,
                            fontSize: 13.7,
                            fontWeight: 700,
                            bgcolor:
                              exp.imbalance_lots === 0
                                ? 'rgba(16,185,129,0.15)'
                                : exp.imbalance_lots > 0
                                ? 'rgba(56,189,248,0.15)'
                                : 'rgba(244,114,182,0.15)',
                            color:
                              exp.imbalance_lots === 0
                                ? '#10b981'
                                : exp.imbalance_lots > 0
                                ? '#38bdf8'
                                : '#f472b6',
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      {/* ─── REQUIREMENT 1 & 2: DIVIDED BY PE AND CE POSITIONS ─────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* ── LEFT COLUMN: PE (PUT OPTIONS) POSITIONS ── */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card
            sx={{
              height: '100%',
              background: 'rgba(22, 24, 36, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 2.5,
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUpIcon sx={{ color: '#38bdf8', fontSize: 26 }} />
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#38bdf8', fontSize: 22.1 }}>
                    PE (Put Options) Positions
                  </Typography>
                  <Chip
                    label={`${filteredPE.length} Active`}
                    size="small"
                    sx={{ height: 26, bgcolor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 700, fontSize: 14.3 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: 15.6 }}>
                    Short: <strong style={{ color: '#ef4444' }}>-{summary.pe_short_lots}L</strong>
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: 15.6 }}>
                    Long: <strong style={{ color: '#10b981' }}>+{summary.pe_long_lots}L</strong>
                  </Typography>
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontSize: 15.6 }}>
                Click any PE position row below to inspect its complete historical transactions and Buy/Sell bar graph.
              </Typography>

              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Contract / Expiry</TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Strike</TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Side &amp; Lots</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Avg Price</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>LTP</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Open P&amp;L</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Day M2M</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPE.map((pos: any) => {
                      const isSelected = selectedSymbol === pos.tradingsymbol;
                      const isLong = pos.quantity > 0;
                      const lotSize = data?.lot_size || 65;
                      const dayBuyLots = Math.round(((pos.day_buy_quantity || 0) / lotSize) * 100) / 100;
                      const daySellLots = Math.round(((pos.day_sell_quantity || 0) / lotSize) * 100) / 100;
                      return (
                        <TableRow
                          key={pos.tradingsymbol}
                          hover
                          onClick={() => setSelectedSymbol(pos.tradingsymbol)}
                          sx={{
                            cursor: 'pointer',
                            bgcolor: isSelected ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                            borderLeft: isSelected ? '4px solid #38bdf8' : '4px solid transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <TableCell sx={{ py: 1.2 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 16.3, color: isSelected ? '#38bdf8' : '#f8fafc' }}>
                              {pos.tradingsymbol}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', mt: 0.3 }}>
                              <Chip
                                label={pos.expiry_label}
                                size="small"
                                sx={{ height: 22, fontSize: 12.4, fontWeight: 700, bgcolor: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                                {pos.days_to_expiry}d • {pos.tx_count} fills
                              </Typography>
                            </Box>
                          </TableCell>

                          <TableCell align="center">
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 16.3 }}>
                              {pos.strike.toLocaleString('en-IN')}
                            </Typography>
                            <Chip
                              label={`${pos.moneyness} (${pos.distance_from_spot_pct > 0 ? '+' : ''}${pos.distance_from_spot_pct}%)`}
                              size="small"
                              sx={{
                                height: 21,
                                fontSize: 11.7,
                                fontWeight: 700,
                                bgcolor: pos.moneyness === 'ITM' ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.12)',
                                color: pos.moneyness === 'ITM' ? '#f59e0b' : '#94a3b8',
                              }}
                            />
                          </TableCell>

                          <TableCell align="center">
                            <Chip
                              label={`${isLong ? 'BUY +' : 'SELL '}${pos.net_lots}L`}
                              size="small"
                              sx={{
                                height: 26,
                                bgcolor: isLong ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                                color: isLong ? '#10b981' : '#ef4444',
                                fontWeight: 800,
                                fontSize: 14.3,
                              }}
                            />
                            {(dayBuyLots > 0 || daySellLots > 0) && (
                              <Typography variant="caption" sx={{ display: 'block', fontSize: 12.4, color: '#eab308', fontWeight: 700, mt: 0.3 }}>
                                Today: {dayBuyLots > 0 ? `+${dayBuyLots}L B` : ''}{' '}
                                {daySellLots > 0 ? `-${daySellLots}L S` : ''}
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 600 }}>
                            ₹{pos.average_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>

                          <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, color: '#06b6d4' }}>
                            ₹{pos.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>

                          <TableCell
                            align="right"
                            sx={{
                              fontSize: 15.6,
                              fontWeight: 700,
                              color: pos.pnl >= 0 ? '#10b981' : '#ef4444',
                            }}
                          >
                            <div>{fmtSignedCurrency(pos.pnl)}</div>
                            <Typography variant="caption" sx={{ fontSize: 13, color: pos.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                              {pos.pnl_pct >= 0 ? '+' : ''}{pos.pnl_pct}%
                            </Typography>
                          </TableCell>

                          <TableCell
                            align="right"
                            sx={{
                              fontSize: 15.6,
                              fontWeight: 600,
                              color: pos.m2m >= 0 ? '#10b981' : '#ef4444',
                            }}
                          >
                            {fmtSignedCurrency(pos.m2m)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredPE.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 3, fontSize: 15.6, color: 'text.secondary' }}>
                          No open PE positions for this expiry filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ── RIGHT COLUMN: CE (CALL OPTIONS) POSITIONS ── */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card
            sx={{
              height: '100%',
              background: 'rgba(22, 24, 36, 0.85)',
              border: '1px solid rgba(244, 114, 182, 0.35)',
              borderRadius: 2.5,
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingDownIcon sx={{ color: '#f472b6', fontSize: 26 }} />
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#f472b6', fontSize: 22.1 }}>
                    CE (Call Options) Positions
                  </Typography>
                  <Chip
                    label={`${filteredCE.length} Active`}
                    size="small"
                    sx={{ height: 26, bgcolor: 'rgba(244, 114, 182, 0.15)', color: '#f472b6', fontWeight: 700, fontSize: 14.3 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: 15.6 }}>
                    Short: <strong style={{ color: '#ef4444' }}>-{summary.ce_short_lots}L</strong>
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: 15.6 }}>
                    Long: <strong style={{ color: '#10b981' }}>+{summary.ce_long_lots}L</strong>
                  </Typography>
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontSize: 15.6 }}>
                Click any CE position row below to inspect its complete historical transactions and Buy/Sell bar graph.
              </Typography>

              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Contract / Expiry</TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Strike</TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Side &amp; Lots</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Avg Price</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>LTP</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Open P&amp;L</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 14.3, bgcolor: '#161824' }}>Day M2M</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCE.map((pos: any) => {
                      const isSelected = selectedSymbol === pos.tradingsymbol;
                      const isLong = pos.quantity > 0;
                      const lotSize = data?.lot_size || 65;
                      const dayBuyLots = Math.round(((pos.day_buy_quantity || 0) / lotSize) * 100) / 100;
                      const daySellLots = Math.round(((pos.day_sell_quantity || 0) / lotSize) * 100) / 100;
                      return (
                        <TableRow
                          key={pos.tradingsymbol}
                          hover
                          onClick={() => setSelectedSymbol(pos.tradingsymbol)}
                          sx={{
                            cursor: 'pointer',
                            bgcolor: isSelected ? 'rgba(244, 114, 182, 0.16)' : 'transparent',
                            borderLeft: isSelected ? '4px solid #f472b6' : '4px solid transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <TableCell sx={{ py: 1.2 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 16.3, color: isSelected ? '#f472b6' : '#f8fafc' }}>
                              {pos.tradingsymbol}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', mt: 0.3 }}>
                              <Chip
                                label={pos.expiry_label}
                                size="small"
                                sx={{ height: 22, fontSize: 12.4, fontWeight: 700, bgcolor: 'rgba(244,114,182,0.12)', color: '#f472b6' }}
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                                {pos.days_to_expiry}d • {pos.tx_count} fills
                              </Typography>
                            </Box>
                          </TableCell>

                          <TableCell align="center">
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 16.3 }}>
                              {pos.strike.toLocaleString('en-IN')}
                            </Typography>
                            <Chip
                              label={`${pos.moneyness} (${pos.distance_from_spot_pct > 0 ? '+' : ''}${pos.distance_from_spot_pct}%)`}
                              size="small"
                              sx={{
                                height: 21,
                                fontSize: 11.7,
                                fontWeight: 700,
                                bgcolor: pos.moneyness === 'ITM' ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.12)',
                                color: pos.moneyness === 'ITM' ? '#f59e0b' : '#94a3b8',
                              }}
                            />
                          </TableCell>

                          <TableCell align="center">
                            <Chip
                              label={`${isLong ? 'BUY +' : 'SELL '}${pos.net_lots}L`}
                              size="small"
                              sx={{
                                height: 26,
                                bgcolor: isLong ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                                color: isLong ? '#10b981' : '#ef4444',
                                fontWeight: 800,
                                fontSize: 14.3,
                              }}
                            />
                            {(dayBuyLots > 0 || daySellLots > 0) && (
                              <Typography variant="caption" sx={{ display: 'block', fontSize: 12.4, color: '#eab308', fontWeight: 700, mt: 0.3 }}>
                                Today: {dayBuyLots > 0 ? `+${dayBuyLots}L B` : ''}{' '}
                                {daySellLots > 0 ? `-${daySellLots}L S` : ''}
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 600 }}>
                            ₹{pos.average_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>

                          <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, color: '#06b6d4' }}>
                            ₹{pos.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>

                          <TableCell
                            align="right"
                            sx={{
                              fontSize: 15.6,
                              fontWeight: 700,
                              color: pos.pnl >= 0 ? '#10b981' : '#ef4444',
                            }}
                          >
                            <div>{fmtSignedCurrency(pos.pnl)}</div>
                            <Typography variant="caption" sx={{ fontSize: 13, color: pos.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                              {pos.pnl_pct >= 0 ? '+' : ''}{pos.pnl_pct}%
                            </Typography>
                          </TableCell>

                          <TableCell
                            align="right"
                            sx={{
                              fontSize: 15.6,
                              fontWeight: 600,
                              color: pos.m2m >= 0 ? '#10b981' : '#ef4444',
                            }}
                          >
                            {fmtSignedCurrency(pos.m2m)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredCE.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 3, fontSize: 15.6, color: 'text.secondary' }}>
                          No open CE positions for this expiry filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ─── TODAY'S EXITED / ROLLED CONTRACTS (COLLAPSIBLE) ───────────────────── */}
      {(data?.closed_today_positions?.length || 0) > 0 && (
        <Card sx={{ mb: 3, background: 'rgba(22, 24, 36, 0.65)', border: '1px solid #2a2e43', borderRadius: 2 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box
              onClick={() => setShowExitedToday(!showExitedToday)}
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 18.2, color: '#cbd5e1' }}>
                  Positions Exited / Rolled Today ({data.closed_today_positions.length} Contracts)
                </Typography>
                <Chip
                  size="small"
                  label={`Today's Exited P&L: ${fmtSignedCurrency(summary.closed_today_pnl)}`}
                  sx={{
                    height: 26,
                    fontSize: 14.3,
                    fontWeight: 700,
                    bgcolor: (summary.closed_today_pnl || 0) >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: (summary.closed_today_pnl || 0) >= 0 ? '#10b981' : '#ef4444',
                  }}
                />
              </Box>
              <IconButton size="small">
                {showExitedToday ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            <Collapse in={showExitedToday}>
              <Box sx={{ mt: 2, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: 14.3, fontWeight: 700, color: 'text.secondary' }}>Contract</TableCell>
                      <TableCell sx={{ fontSize: 14.3, fontWeight: 700, color: 'text.secondary' }}>Type</TableCell>
                      <TableCell sx={{ fontSize: 14.3, fontWeight: 700, color: 'text.secondary' }}>Expiry</TableCell>
                      <TableCell align="right" sx={{ fontSize: 14.3, fontWeight: 700, color: 'text.secondary' }}>Overnight Lots</TableCell>
                      <TableCell align="right" sx={{ fontSize: 14.3, fontWeight: 700, color: 'text.secondary' }}>Avg Buy</TableCell>
                      <TableCell align="right" sx={{ fontSize: 14.3, fontWeight: 700, color: 'text.secondary' }}>Avg Sell</TableCell>
                      <TableCell align="right" sx={{ fontSize: 14.3, fontWeight: 700, color: 'text.secondary' }}>Realized P&amp;L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.closed_today_positions.map((pos: any) => (
                      <TableRow
                        key={pos.tradingsymbol}
                        hover
                        onClick={() => setSelectedSymbol(pos.tradingsymbol)}
                        sx={{
                          cursor: 'pointer',
                          bgcolor: selectedSymbol === pos.tradingsymbol ? 'rgba(41,98,255,0.15)' : 'transparent',
                        }}
                      >
                        <TableCell sx={{ fontSize: 15.6, fontWeight: 700 }}>{pos.tradingsymbol}</TableCell>
                        <TableCell>
                          <Chip
                            label={pos.option_type}
                            size="small"
                            sx={{
                              height: 23,
                              fontSize: 13,
                              fontWeight: 700,
                              bgcolor: pos.option_type === 'PE' ? 'rgba(56,189,248,0.15)' : 'rgba(244,114,182,0.15)',
                              color: pos.option_type === 'PE' ? '#38bdf8' : '#f472b6',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 15.6 }}>{pos.expiry_label}</TableCell>
                        <TableCell align="right" sx={{ fontSize: 15.6 }}>
                          {Math.round(((pos.overnight_quantity || 0) / (data?.lot_size || 65)) * 100) / 100}L
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: 15.6 }}>₹{pos.buy_price}</TableCell>
                        <TableCell align="right" sx={{ fontSize: 15.6 }}>₹{pos.sell_price}</TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontSize: 15.6, fontWeight: 700, color: pos.pnl >= 0 ? '#10b981' : '#ef4444' }}
                        >
                          {fmtSignedCurrency(pos.pnl)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </CardContent>
        </Card>
      )}

      {/* ─── REQUIREMENT 3 & 4: SELECTED CONTRACT HISTORICAL TRANSACTIONS & BAR GRAPH ─── */}
      <Card
        sx={{
          background: 'rgba(22, 24, 36, 0.92)',
          border: '2px solid #2962ff',
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        }}
      >
        <CardContent sx={{ p: 3 }}>
          {/* Header & Contract Selector */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
              pb: 2,
              mb: 2.5,
              borderBottom: '1px solid #2a2e43',
            }}
          >
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <HistoryIcon sx={{ color: '#2962ff', fontSize: 26 }} />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Instrument Transaction History &amp; Execution Bar Graph:
                </Typography>
                <Chip
                  label={selectedSymbol || 'Select a Position'}
                  sx={{
                    bgcolor: '#2962ff',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 13.5,
                    px: 0.5,
                  }}
                />
                {historyData && (
                  <>
                    <Chip
                      label={`${historyData.expiry_label} • Strike ${historyData.strike?.toLocaleString('en-IN')} ${historyData.option_type}`}
                      size="small"
                      sx={{
                        bgcolor:
                          historyData.option_type === 'PE'
                            ? 'rgba(56, 189, 248, 0.15)'
                            : 'rgba(244, 114, 182, 0.15)',
                        color: historyData.option_type === 'PE' ? '#38bdf8' : '#f472b6',
                        fontWeight: 700,
                      }}
                    />
                    {selectedPositionLive && (
                      <Chip
                        label={`Live LTP: ₹${selectedPositionLive.last_price} | Open P&L: ${fmtSignedCurrency(selectedPositionLive.pnl)}`}
                        size="small"
                        sx={{
                          bgcolor:
                            selectedPositionLive.pnl >= 0
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color: selectedPositionLive.pnl >= 0 ? '#10b981' : '#ef4444',
                          fontWeight: 700,
                        }}
                      />
                    )}
                  </>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Click any position in the PE or CE tables above, or switch to any historical Nifty contract using the dropdown on the right.
              </Typography>
            </Box>

            {/* Dropdown to jump to any active or past Nifty F&O contract */}
            <FormControl size="small" sx={{ minWidth: 270 }}>
              <InputLabel id="fo-contract-select-label">Switch Nifty F&amp;O Contract</InputLabel>
              <Select
                labelId="fo-contract-select-label"
                value={selectedSymbol}
                label="Switch Nifty F&O Contract"
                onChange={(e) => setSelectedSymbol(e.target.value as string)}
                sx={{ borderRadius: 2 }}
              >
                {(data?.historical_contracts || []).map((c: any) => {
                  const netLots = c.net_lots ?? Math.round(((c.net_qty || 0) / (data?.lot_size || 65)) * 100) / 100;
                  return (
                    <MenuItem key={c.symbol} value={c.symbol}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                        <span style={{ fontWeight: 700 }}>{c.symbol}</span>
                        <span style={{ color: netLots !== 0 ? '#10b981' : '#64748b', fontSize: 12 }}>
                          {netLots !== 0 ? `Open (${netLots > 0 ? '+' : ''}${netLots}L)` : 'Settled'} • {c.trade_count} trades
                        </span>
                      </Box>
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </Box>

          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
              <CircularProgress />
            </Box>
          ) : historyData ? (
            <>
              {/* Selected Instrument KPI Summary Row */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  {
                    label: 'Total Bought Lots',
                    val: `+${historyData.summary.total_buy_lots}L`,
                    sub: `Avg Buy Price: ₹${historyData.summary.avg_buy_price.toLocaleString('en-IN')}`,
                    color: '#10b981',
                  },
                  {
                    label: 'Total Sold Lots',
                    val: `-${historyData.summary.total_sell_lots}L`,
                    sub: `Avg Sell Price: ₹${historyData.summary.avg_sell_price.toLocaleString('en-IN')}`,
                    color: '#ef4444',
                  },
                  {
                    label: 'Net Open Lots',
                    val: `${historyData.summary.net_lots > 0 ? '+' : ''}${historyData.summary.net_lots}L`,
                    sub: historyData.summary.net_lots > 0 ? 'LONG / HEDGE POSITION' : historyData.summary.net_lots < 0 ? 'SHORT / CREDIT POSITION' : 'FULLY CLOSED / SETTLED',
                    color: historyData.summary.net_lots > 0 ? '#10b981' : historyData.summary.net_lots < 0 ? '#f59e0b' : '#94a3b8',
                  },
                  {
                    label: 'Total Buy Value',
                    val: fmtCurrency(historyData.summary.total_buy_value),
                    sub: `${historyData.summary.trade_count} Total Executions`,
                    color: '#cbd5e1',
                  },
                  {
                    label: 'Total Sell Value',
                    val: fmtCurrency(historyData.summary.total_sell_value),
                    sub: `${historyData.summary.active_days} Active Trading Days`,
                    color: '#cbd5e1',
                  },
                  {
                    label: 'Net Cashflow (Sell - Buy)',
                    val: fmtSignedCurrency(historyData.summary.net_cashflow),
                    sub: `${fmtDate(historyData.summary.first_trade_date)} → ${fmtDate(historyData.summary.last_trade_date)}`,
                    color: historyData.summary.net_cashflow >= 0 ? '#38bdf8' : '#c084fc',
                  },
                ].map((item) => (
                  <Grid size={{ xs: 6, sm: 4, md: 2 }} key={item.label}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: 'rgba(15, 23, 42, 0.75)',
                        border: '1px solid #2a2e43',
                        height: '100%',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                        {item.label}
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: 20.8, color: item.color, mt: 0.3 }}>
                        {item.val}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13.7, display: 'block' }}>
                        {item.sub}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>

              {/* Side-by-Side: Bar Graph (Left) + Historical Transactions Table (Right) */}
              <Grid container spacing={2.5}>
                {/* ── BAR GRAPH BOX (Requirement 4) ── */}
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Card
                    sx={{
                      height: '100%',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid #2a2e43',
                      borderRadius: 2.5,
                    }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <BarChartIcon sx={{ color: '#10b981' }} />
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: 18 }}>
                            Buy &amp; Sell Lots by Date ({selectedSymbol})
                          </Typography>
                        </Box>

                        <RadioGroup
                          row
                          value={chartMetric}
                          onChange={(e) => setChartMetric(e.target.value as 'lots' | 'price')}
                        >
                          <FormControlLabel
                            value="lots"
                            control={<Radio size="small" sx={{ '&.Mui-checked': { color: '#2962ff' } }} />}
                            label={<Typography variant="caption" sx={{ fontWeight: 600, fontSize: 14.3 }}>Lots</Typography>}
                          />
                          <FormControlLabel
                            value="price"
                            control={<Radio size="small" sx={{ '&.Mui-checked': { color: '#2962ff' } }} />}
                            label={<Typography variant="caption" sx={{ fontWeight: 600, fontSize: 14.3 }}>Price (₹)</Typography>}
                          />
                        </RadioGroup>
                      </Box>

                      {(historyData.chart_data?.length || 0) > 0 ? (
                        <ResponsiveContainer width="100%" height={360}>
                          <BarChart
                            data={historyData.chart_data}
                            margin={{ top: 32, right: 20, left: 10, bottom: 20 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                            <XAxis
                              dataKey="date"
                              tickFormatter={(v) => {
                                const parts = String(v).split('-');
                                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0].slice(2)}` : v;
                              }}
                              tick={{ fill: '#94a3b8', fontSize: 13 }}
                            />
                            <YAxis
                              tick={{ fill: '#94a3b8', fontSize: 13 }}
                              label={{
                                value:
                                  chartMetric === 'lots'
                                    ? 'Lots'
                                    : 'Execution Price (₹)',
                                angle: -90,
                                position: 'insideLeft',
                                style: { fill: '#94a3b8', fontSize: 13 },
                              }}
                            />
                            <RechartsTooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                            <Legend wrapperStyle={{ fontSize: 14.3, paddingTop: 8 }} />
                            <Bar
                              dataKey={
                                chartMetric === 'lots'
                                  ? 'buyLots'
                                  : 'buyPrice'
                              }
                              name={
                                chartMetric === 'lots'
                                  ? 'Buy Lots'
                                  : 'Avg Buy Price (₹)'
                              }
                              fill="#10b981"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={42}
                              isAnimationActive={false}
                            >
                              <LabelList
                                dataKey={
                                  chartMetric === 'lots'
                                    ? 'buyLots'
                                    : 'buyPrice'
                                }
                                content={renderBuyBarLabel}
                              />
                            </Bar>
                            <Bar
                              dataKey={
                                chartMetric === 'lots'
                                  ? 'sellLots'
                                  : 'sellPrice'
                              }
                              name={
                                chartMetric === 'lots'
                                  ? 'Sell Lots'
                                  : 'Avg Sell Price (₹)'
                              }
                              fill="#ef4444"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={42}
                              isAnimationActive={false}
                            >
                              <LabelList
                                dataKey={
                                  chartMetric === 'lots'
                                    ? 'sellLots'
                                    : 'sellPrice'
                                }
                                content={renderSellBarLabel}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 320 }}>
                          <Typography color="text.secondary">
                            No historical trade executions found in F&amp;O tradebook for {selectedSymbol}.
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                {/* ── HISTORICAL TRANSACTIONS TABLE BOX (Requirement 3) ── */}
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Card
                    sx={{
                      height: '100%',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid #2a2e43',
                      borderRadius: 2.5,
                    }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: 18 }}>
                          Historical Transactions ({selectedSymbol})
                        </Typography>
                        <Tabs
                          value={historyTab}
                          onChange={(_, v) => setHistoryTab(v)}
                          sx={{
                            minHeight: 34,
                            '& .MuiTabs-indicator': { backgroundColor: '#2962ff', height: 2 },
                          }}
                        >
                          <Tab
                            label={`All Executions (${historyData.transactions?.length || 0})`}
                            sx={{ minHeight: 34, textTransform: 'none', fontSize: 14.5, fontWeight: 600, py: 0.5 }}
                          />
                          <Tab
                            label={`Daily Consolidated (${historyData.daily_timeline?.length || 0})`}
                            sx={{ minHeight: 34, textTransform: 'none', fontSize: 14.5, fontWeight: 600, py: 0.5 }}
                          />
                          <Tab
                            label={`Net Consolidation (${historyData.net_consolidation?.length || 0})`}
                            sx={{ minHeight: 34, textTransform: 'none', fontSize: 14.5, fontWeight: 600, py: 0.5 }}
                          />
                        </Tabs>
                      </Box>

                      <Box sx={{ maxHeight: 365, overflowY: 'auto' }}>
                        {historyTab === 0 ? (
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Date</TableCell>
                                <TableCell sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Type</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Lots</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Price (₹)</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Value</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Running Net</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {(historyData.transactions || []).map((tx: any, idx: number) => (
                                <TableRow key={idx} hover>
                                  <TableCell sx={{ fontSize: 15.6, fontWeight: 600, py: 1 }}>
                                    {fmtDate(tx.trade_date)}
                                  </TableCell>
                                  <TableCell sx={{ py: 1 }}>
                                    <Chip
                                      label={tx.buy_sell}
                                      size="small"
                                      sx={{
                                        height: 26,
                                        fontSize: 13,
                                        fontWeight: 800,
                                        bgcolor: tx.buy_sell === 'BUY' ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)',
                                        color: tx.buy_sell === 'BUY' ? '#10b981' : '#ef4444',
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1 }}>
                                    {tx.lots}L
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontSize: 15.6, py: 1 }}>
                                    ₹{Number(tx.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontSize: 15.6, py: 1 }}>
                                    {fmtCurrency(tx.value)}
                                  </TableCell>
                                  <TableCell
                                    align="right"
                                    sx={{
                                      fontSize: 15.6,
                                      fontWeight: 700,
                                      py: 1,
                                      color: tx.running_net_lots > 0 ? '#10b981' : tx.running_net_lots < 0 ? '#ef4444' : '#94a3b8',
                                    }}
                                  >
                                    {tx.running_net_lots > 0 ? `+${tx.running_net_lots}` : tx.running_net_lots}L
                                  </TableCell>
                                </TableRow>
                              ))}
                              {(historyData.transactions || []).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={6} align="center" sx={{ py: 4, fontSize: 15.6, color: 'text.secondary' }}>
                                    No historical transactions found for {selectedSymbol}.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        ) : historyTab === 1 ? (
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Trade Date</TableCell>
                                <TableCell sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Type</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Fills</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Total Lots</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Weighted Avg Price</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Current LTP</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Difference</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>%age</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {(historyData.daily_timeline || []).map((row: any, idx: number) => {
                                const avgPrice = Number(row.price || 0);
                                const currentLtp =
                                  selectedPositionLive?.last_price ??
                                  row.ltp ??
                                  historyData?.current_ltp ??
                                  null;
                                const diff =
                                  currentLtp != null && avgPrice > 0
                                    ? Number(currentLtp) - avgPrice
                                    : null;
                                const diffPct =
                                  diff != null && avgPrice > 0
                                    ? (diff / avgPrice) * 100
                                    : null;
                                const isSell = String(row.buy_sell || '').toUpperCase() === 'SELL';
                                const isFavorable =
                                  diff != null ? (isSell ? diff <= 0 : diff >= 0) : false;
                                const diffColor =
                                  diff == null ? '#94a3b8' : isFavorable ? '#10b981' : '#ef4444';

                                return (
                                  <TableRow key={idx} hover>
                                    <TableCell sx={{ fontSize: 15.6, fontWeight: 600, py: 1 }}>{fmtDate(row.date)}</TableCell>
                                    <TableCell sx={{ py: 1 }}>
                                      <Chip
                                        label={row.buy_sell}
                                        size="small"
                                        sx={{
                                          height: 26,
                                          fontSize: 13,
                                          fontWeight: 800,
                                          bgcolor: row.buy_sell === 'BUY' ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)',
                                          color: row.buy_sell === 'BUY' ? '#10b981' : '#ef4444',
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, py: 1 }}>{row.trades_count}</TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1 }}>
                                      {row.lots}L
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, py: 1 }}>
                                      ₹{avgPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1, color: '#06b6d4' }}>
                                      {currentLtp != null
                                        ? `₹${Number(currentLtp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : '—'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1, color: diffColor }}>
                                      {diff != null
                                        ? `${diff >= 0 ? '+' : '-'}₹${Math.abs(diff).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : '—'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1, color: diffColor }}>
                                      {diffPct != null
                                        ? `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%`
                                        : '—'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        ) : (
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Trade Date</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Total Lots</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Net Weighted Avg Price</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Net Current LTP</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>Difference</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#161824', fontSize: 14.5, fontWeight: 700, color: 'text.secondary' }}>%age</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {(historyData.net_consolidation || []).map((row: any, idx: number) => {
                                const netAvg = Number(row.net_avg_price || 0);
                                const netLtp = row.net_ltp != null ? Number(row.net_ltp) : null;
                                const diff = row.diff != null ? Number(row.diff) : (netLtp != null ? netAvg - netLtp : null);
                                const diffPct = row.diff_pct != null ? Number(row.diff_pct) : (diff != null && netAvg !== 0 ? (diff / Math.abs(netAvg)) * 100 : null);
                                const diffColor = diff == null ? '#94a3b8' : diff >= 0 ? '#10b981' : '#ef4444';

                                return (
                                  <TableRow key={idx} hover>
                                    <TableCell sx={{ fontSize: 15.6, fontWeight: 600, py: 1 }}>{fmtDate(row.date)}</TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1 }}>
                                      {row.lots}L
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, py: 1 }}>
                                      ₹{netAvg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1, color: '#06b6d4' }}>
                                      {netLtp != null
                                        ? `₹${netLtp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : '—'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1, color: diffColor }}>
                                      {diff != null
                                        ? `${diff >= 0 ? '+' : '-'}₹${Math.abs(diff).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : '—'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: 15.6, fontWeight: 700, py: 1, color: diffColor }}>
                                      {diffPct != null
                                        ? `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%`
                                        : '—'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              {(historyData.net_consolidation || []).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={6} align="center" sx={{ py: 4, fontSize: 15.6, color: 'text.secondary' }}>
                                    No paired net consolidation records found for {selectedSymbol}.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </>
          ) : null}
        </CardContent>
      </Card>
    </Box>
  );
};

export default FOTrading;

