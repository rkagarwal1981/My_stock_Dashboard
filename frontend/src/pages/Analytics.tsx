import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, FormControl, InputLabel, Select,
  MenuItem, CircularProgress, Chip, TextField, Tooltip as MuiTooltip,
  Checkbox, Collapse, IconButton, Divider, RadioGroup, FormControlLabel, Radio,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, LineChart, Line, Legend, ReferenceLine,
  Treemap, LabelList, ComposedChart,
} from 'recharts';

// ─── Colour palette ───────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  'Financials':             '#2962ff',
  'Information Technology': '#06b6d4',
  'Energy':                 '#f59e0b',
  'Automobile':             '#10b981',
  'FMCG':                   '#8b5cf6',
  'Pharma':                 '#ec4899',
  'Metals & Mining':        '#64748b',
  'Infrastructure':         '#ef4444',
  'Telecom':                '#0ea5e9',
  'Consumer Discretionary': '#a78bfa',
  'Chemicals':              '#34d399',
  'Healthcare':             '#fb923c',
  'Capital Goods':          '#facc15',
  'Others':                 '#475569',
};

const BROKERS = ['All', 'MStock', 'Zerodha', 'Dhan'];

// ─── Utility: compact INR formatter for labels & axes ─────────────────────────
//
// fmtShort formats a number compactly for chart axes and on-bar labels:
//   |v| >= 1,00,000  →  "1.2L"   (divide by 1,00,000, suffix "L")
//   |v| >= 1,000     →  "12K"    (divide by 1,000, suffix "K")
//   otherwise        →  "123"    (plain integer string)
// parseFloat strips trailing decimal zeros (e.g. "1.10" → "1.1").

const fmtShort = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 100_000) return `${parseFloat((v / 100_000).toFixed(2))}L`;
  if (abs >= 1_000)   return `${parseFloat((v / 1_000).toFixed(1))}K`;
  return String(Math.round(v));
};

const fmtShortNoDecimals = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 100_000) return `${Math.round(v / 100_000)}L`;
  if (abs >= 1_000)   return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
};

/** Full rupee value with locale grouping — used in tooltips and KPI cards */
const fmt = (v: number) =>
  `\u20b9${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fmtMonth = (m: string) => {
  // 'YYYY-MM' -> 'MMM YY'
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

// ─── Churn bucket config & remapper ───────────────────────────────────────────

/** Canonical 7-bucket sequence for the Stock Churn histogram */
const NEW_CHURN_BINS = ['0-7d', '8-15d', '16-30d', '1m', '2m', '3m', '>4mnth'] as const;
type ChurnBin = typeof NEW_CHURN_BINS[number];

/**
 * remapChurnBins – normalises any raw API bin-label format into the
 * canonical 7-bucket sequence. Multiple API buckets may collapse into one;
 * counts are accumulated so no data is lost.
 *
 * Bucket day ranges (must match backend exactly):
 *   0-7d    :  0 –  7 days
 *   8-15d   :  8 – 15 days
 *   16-30d  : 16 – 30 days
 *   1m      : 31 – 60 days
 *   2m      : 61 – 90 days
 *   3m      : 91 –120 days
 *   >4mnth  : 121+ days
 */
function remapChurnBins(rawBins: any[]): { bin_label: ChurnBin; count: number }[] {
  const acc: Record<ChurnBin, number> = {
    '0-7d': 0, '8-15d': 0, '16-30d': 0,
    '1m': 0, '2m': 0, '3m': 0, '>4mnth': 0,
  };

  for (const bin of (rawBins || [])) {
    const lbl: string = String(bin.bin_label ?? '').trim();
    const cnt: number = Number(bin.count) || 0;

    // Exact match first (backend already sends canonical labels)
    if ((NEW_CHURN_BINS as readonly string[]).includes(lbl)) {
      acc[lbl as ChurnBin] += cnt;
      continue;
    }

    // Fuzzy match legacy / alternative backend formats
    const l = lbl.toLowerCase();
    if      (/^(0[-]7|<\s*1\s*w|<\s*7\s*d|same.?week)/i.test(l))  acc['0-7d']   += cnt;
    else if (/^(8[-]15|1[-]2\s*w)/i.test(l))                        acc['8-15d']  += cnt;
    else if (/^(16[-]30|2[-]4\s*w|3[-]4\s*w)/i.test(l))            acc['16-30d'] += cnt;
    else if (/^(1\s*m(?:onth)?(?!\w)|31[-]60)/i.test(l))            acc['1m']     += cnt;
    else if (/^(2\s*m(?:onth)?(?!\w)|61[-]90)/i.test(l))            acc['2m']     += cnt;
    else if (/^(3\s*m(?:onth)?(?!\w)|91[-]120)/i.test(l))           acc['3m']     += cnt;
    else                                                              acc['>4mnth'] += cnt;
  }

  return NEW_CHURN_BINS.map(b => ({ bin_label: b, count: acc[b] }));
}

// ─── Custom SVG label renderers ───────────────────────────────────────────────

/** Renders fmtShortNoDecimals value above each P&L bar. Skipped for zero-value bars. */
const PnlBarLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (!value) return null;
  const w = width || 0;
  return (
    <text x={x + w / 2} y={y - 5} textAnchor="middle"
      fill="#94a3b8" fontSize={10} fontWeight={600}>
      {fmtShortNoDecimals(value)}
    </text>
  );
};

/**
 * Renders "count | pct%" to the RIGHT of each horizontal churn bar (outside).
 * totalChurnRef is set by the chart's parent just before rendering.
 */
let _churnTotal = 0; // module-level ref updated before each render
const ChurnBarLabel = (props: any) => {
  const { x, y, width, height, value } = props;
  if (!value) return null;
  const pct = _churnTotal > 0 ? ((value / _churnTotal) * 100).toFixed(1) : '0.0';
  return (
    <text
      x={x + width + 10}
      y={y + height / 2 + 5}
      textAnchor="start"
      fill="rgba(255,255,255,0.90)"
      fontSize={12}
      fontWeight={600}
    >
      {`${value} | ${pct}%`}
    </text>
  );
};

/** Renders "N%" above each data point on the Return line chart. */
const ReturnLineLabel = (props: any) => {
  const { x, y, value } = props;
  if (value === null || value === undefined) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle"
      fill="#06b6d4" fontSize={10} fontWeight={600}>
      {`${Math.round(Number(value))}%`}
    </text>
  );
};

// ─── Shared card wrapper ──────────────────────────────────────────────────────

const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  extra?: React.ReactNode;
}> = ({ title, subtitle, icon, children, extra }) => (
  <Card sx={{
    background: 'rgba(22,24,36,0.85)',
    border: '1px solid #2a2e43',
    borderRadius: 3,
    height: '100%',
    backdropFilter: 'blur(8px)',
  }}>
    <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" sx={{
            fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 1,
            background: 'linear-gradient(90deg, #f8fafc 60%, #94a3b8)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {icon} {title}
          </Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {extra}
      </Box>
      {children}
    </CardContent>
  </Card>
);

const EmptyState = ({ text }: { text: string }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, flex: 1 }}>
    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', opacity: 0.7 }}>{text}</Typography>
  </Box>
);

const Spinner = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, py: 5 }}>
    <CircularProgress size={28} sx={{ color: '#2962ff' }} />
  </Box>
);

// ─── Tooltip shared style ─────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: { background: '#161824', border: '1px solid #2a2e43', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' },
  labelStyle: { color: '#94a3b8', fontWeight: 600, fontSize: 12 },
  itemStyle: { fontSize: 12 },
};



// ════════════════════════════════════════════════════════════════════════════
// Main Analytics Component
// ════════════════════════════════════════════════════════════════════════════

const Analytics: React.FC = () => {
  const [broker, setBroker] = useState('All');

  // ── Per-widget data + loading states ─────────────────────────────────────
  const [pnlData, setPnlData]         = useState<any[]>([]);
  const [pnlLoading, setPnlLoading]   = useState(true);

  const [churnData, setChurnData]       = useState<any>({ bins: [], total: 0 });
  const [churnLoading, setChurnLoading] = useState(true);
  
  // Lifted global month range master filter state
  const [monthFrom, setMonthFrom] = useState<string>(() => localStorage.getItem('monthFrom') || '');
  const [monthTo,   setMonthTo]   = useState<string>(() => localStorage.getItem('monthTo')   || '');

  const [returnData, setReturnData]       = useState<any[]>([]);
  const [returnLoading, setReturnLoading] = useState(true);

  const [sectorData, setSectorData]       = useState<any>({ sectors: [], total_value: 0 });
  const [sectorLoading, setSectorLoading] = useState(true);

  const [effData, setEffData]             = useState<any[]>([]);
  const [effLoading, setEffLoading]       = useState(true);



  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const brokerParam = broker === 'All' ? '' : broker;

  const fetchPnl = useCallback(async () => {
    setPnlLoading(true);
    try {
      const res = await axios.get('/api/analytics/monthly-pnl', { params: { broker: brokerParam || undefined } });
      setPnlData(res.data);
    } catch { setPnlData([]); } finally { setPnlLoading(false); }
  }, [brokerParam]);

  const fetchChurn = useCallback(async () => {
    setChurnLoading(true);
    try {
      const params: any = {};
      if (brokerParam) params.broker    = brokerParam;
      if (monthFrom) {
        // First day of the selected month
        params.date_from = `${monthFrom}-01`;
      }
      if (monthTo) {
        // Last day of the selected month
        const [y, m] = monthTo.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        params.date_to = `${monthTo}-${String(lastDay).padStart(2, '0')}`;
      }
      const res = await axios.get('/api/analytics/churn', { params });
      setChurnData(res.data);
    } catch { setChurnData({ bins: [], total: 0 }); } finally { setChurnLoading(false); }
  }, [brokerParam, monthFrom, monthTo]);

  const fetchReturn = useCallback(async () => {
    setReturnLoading(true);
    try {
      const res = await axios.get('/api/analytics/monthly-return', { params: { broker: brokerParam || undefined } });
      setReturnData(res.data);
    } catch { setReturnData([]); } finally { setReturnLoading(false); }
  }, [brokerParam]);

  const fetchSector = useCallback(async () => {
    setSectorLoading(true);
    try {
      const res = await axios.get('/api/analytics/sector-allocation', { params: { broker: brokerParam || undefined } });
      setSectorData(res.data);
    } catch { setSectorData({ sectors: [], total_value: 0 }); } finally { setSectorLoading(false); }
  }, [brokerParam]);

  const fetchEfficiency = useCallback(async () => {
    setEffLoading(true);
    try {
      const res = await axios.get('/api/analytics/capital-efficiency', { params: { broker: brokerParam || undefined } });
      setEffData(res.data);
    } catch { setEffData([]); } finally { setEffLoading(false); }
  }, [brokerParam]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchPnl();
    fetchChurn();
    fetchReturn();
    fetchSector();
    fetchEfficiency();
  }, [brokerParam]);

  useEffect(() => { fetchChurn(); }, [monthFrom, monthTo]);

  // ── Derived / formatted data ──────────────────────────────────────────────

  // Build sorted YYYY-MM month options from pnlData
  const monthOptions = React.useMemo(() => {
    const rawMonths: string[] = pnlData.length > 0
      ? pnlData.map((d: any) => d.month as string)
      : (() => {
          const opts: string[] = [];
          const now = new Date();
          for (let i = 23; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          }
          return opts;
        })();
    const unique = [...new Set(rawMonths)].sort();
    return unique.map(m => ({ value: m, label: fmtMonth(m) }));
  }, [pnlData]);

  const handleFromChange = (val: string) => {
    setMonthFrom(val);
    localStorage.setItem('monthFrom', val);
  };
  const handleToChange = (val: string) => {
    setMonthTo(val);
    localStorage.setItem('monthTo', val);
  };

  const filteredPnl = React.useMemo(() => {
    return pnlData.filter(d => {
      if (monthFrom && d.month < monthFrom) return false;
      if (monthTo && d.month > monthTo) return false;
      return true;
    });
  }, [pnlData, monthFrom, monthTo]);

  const pnlFormatted = React.useMemo(() => {
    return filteredPnl.map(d => ({
      ...d, month: fmtMonth(d.month), lossAbs: Math.abs(d.losses),
    }));
  }, [filteredPnl]);

  const avgGain = React.useMemo(() => {
    const positiveGains = filteredPnl
      .map(d => d.gains || 0)
      .filter(g => g > 0);
    if (positiveGains.length === 0) return 0;
    const sum = positiveGains.reduce((a, b) => a + b, 0);
    return sum / positiveGains.length;
  }, [filteredPnl]);

  const filteredReturn = React.useMemo(() => {
    return returnData.filter(d => {
      if (monthFrom && d.month < monthFrom) return false;
      if (monthTo && d.month > monthTo) return false;
      return true;
    });
  }, [returnData, monthFrom, monthTo]);

  const returnFormatted = React.useMemo(() => {
    return filteredReturn.map(d => ({
      ...d, month: fmtMonth(d.month),
    }));
  }, [filteredReturn]);

  const avgReturn = React.useMemo(() => {
    const returns = filteredReturn
      .map(d => d.normal_return)
      .filter(v => v !== null && v !== undefined);
    if (returns.length === 0) return 0;
    const sum = returns.reduce((a, b) => a + b, 0);
    return sum / returns.length;
  }, [filteredReturn]);

  // ── Efficiency data (filtered by month range) ─────────────────────────────
  const filteredEff = useMemo(() => {
    return effData.filter(d => {
      if (monthFrom && d.month < monthFrom) return false;
      if (monthTo && d.month > monthTo) return false;
      return true;
    });
  }, [effData, monthFrom, monthTo]);

  const effFormatted = useMemo(() => {
    return filteredEff.map(d => ({
      ...d, monthLabel: fmtMonth(d.month),
    }));
  }, [filteredEff]);


  const avgRotationEff = useMemo(() => {
    const vals = filteredEff.map(d => d.rotation_eff).filter(v => v !== 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [filteredEff]);


  /** Churn bins normalised to the canonical 7-bucket sequence */
  const churnBinsRemapped = remapChurnBins(churnData.bins || []);



  // ── Summary KPIs ──────────────────────────────────────────────────────────

  const totalGains  = React.useMemo(() => filteredPnl.reduce((a: number, d: any) => a + (d.gains  || 0), 0), [filteredPnl]);
  const totalLosses = React.useMemo(() => filteredPnl.reduce((a: number, d: any) => a + (d.losses || 0), 0), [filteredPnl]);
  const netPnl      = React.useMemo(() => totalGains + totalLosses, [totalGains, totalLosses]);
  const totalChurn  = churnData.total || 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Box className="fade-in" sx={{ pb: 4 }}>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{
            fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1,
            background: 'linear-gradient(135deg, #f8fafc 30%, #94a3b8)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            <AnalyticsIcon sx={{ color: '#2962ff', WebkitTextFillColor: '#2962ff' }} />
            Portfolio Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            LIFO-based realized performance · Sector exposure · Churn distribution
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Month Range From */}
          <FormControl size="small" sx={{ minWidth: 120, '& .MuiInputBase-root': { fontSize: 12, borderRadius: 2, background: 'rgba(22,24,36,0.8)' } }}>
            <InputLabel>From</InputLabel>
            <Select
              value={monthFrom}
              label="From"
              onChange={e => handleFromChange(e.target.value as string)}
              displayEmpty
            >
              <MenuItem value=""><em style={{ color: '#64748b', fontSize: 11 }}>All time</em></MenuItem>
              {monthOptions.map(o => (
                <MenuItem key={o.value} value={o.value} sx={{ fontSize: 12 }}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Month Range To */}
          <FormControl size="small" sx={{ minWidth: 120, '& .MuiInputBase-root': { fontSize: 12, borderRadius: 2, background: 'rgba(22,24,36,0.8)' } }}>
            <InputLabel>To</InputLabel>
            <Select
              value={monthTo}
              label="To"
              onChange={e => handleToChange(e.target.value as string)}
              displayEmpty
            >
              <MenuItem value=""><em style={{ color: '#64748b', fontSize: 11 }}>All time</em></MenuItem>
              {monthOptions.map(o => (
                <MenuItem key={o.value} value={o.value} sx={{ fontSize: 12 }}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Global Broker Filter */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Broker</InputLabel>
            <Select value={broker} label="Broker" onChange={e => setBroker(e.target.value)}
              sx={{ borderRadius: 2, background: 'rgba(22,24,36,0.8)' }}>
              {BROKERS.map(b => <MenuItem key={b} value={b}>{b}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Realized Gains',   val: fmt(totalGains),                             color: '#10b981' },
          { label: 'Total Realized Losses',  val: `-${fmt(Math.abs(totalLosses))}`,            color: '#ef4444' },
          { label: 'Net Realized P&L',       val: `${netPnl >= 0 ? '+' : ''}${fmt(netPnl)}`,  color: netPnl >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Total Closed Positions', val: String(totalChurn),                          color: '#2962ff' },
          { label: 'Portfolio Value',        val: fmt(sectorData.total_value),                 color: '#8b5cf6' },
        ].map(k => (
          <Card key={k.label} sx={{ flex: '1 1 160px', background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {k.label}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: k.color, mt: 0.5 }}>{k.val}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* ═══════════════════════════════════════════════════════════════════
          Row 1 — Monthly P&L (55%)  +  Churn Histogram (45%)
      ══════════════════════════════════════════════════════════════════════ */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '55fr 45fr' }, gap: 2, mb: 2 }}>

        {/* Widget 1 — Monthly Realized P&L */}
        <ChartCard
          title="Monthly Realized P&L"
          subtitle="LIFO-based · Gains vs Losses per month"
          icon={<TrendingUpIcon sx={{ fontSize: 18, color: '#10b981' }} />}
        >
          {pnlLoading ? <Spinner /> : pnlData.length === 0 ? (
            <EmptyState text="No realized P&L data yet. Import transactions to view." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              {/* top margin 24 so PnlBarLabel text above bars does not clip */}
              <BarChart data={pnlFormatted} margin={{ top: 24, right: 10, left: 10, bottom: 5 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
                {avgGain > 0 && (
                  <ReferenceLine
                    y={avgGain}
                    stroke="#FFFFFF"
                    strokeDasharray="3 3"
                    label={{
                      value: `Avg Gain: ${fmtShort(avgGain)}`,
                      fill: '#FFFFFF',
                      position: 'top',
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  />
                )}
                <Tooltip
                  {...tooltipStyle}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <Box sx={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 2, p: 1.5, minWidth: 180 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, display: 'block', mb: 1 }}>{label}</Typography>
                        <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600 }}>&#8593; Gains: {fmt(d?.gains || 0)}</Typography>
                        <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 600 }}>&#8595; Losses: -{fmt(d?.lossAbs || 0)}</Typography>
                        <Typography variant="body2" sx={{ color: (d?.net || 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 700, mt: 0.5 }}>
                          Net: {(d?.net || 0) >= 0 ? '+' : ''}{fmt(d?.net || 0)}
                        </Typography>
                      </Box>
                    );
                  }}
                />
                {/* Gains bar — compact value label via PnlBarLabel */}
                <Bar dataKey="gains" name="Gains" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}>
                  <LabelList content={<PnlBarLabel />} />
                </Bar>
                {/* Losses bar — lossAbs is always positive; label shows magnitude */}
                <Bar dataKey="lossAbs" name="Losses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}>
                  <LabelList content={<PnlBarLabel />} />
                </Bar>
                <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Widget 2 — Stock Churn Histogram */}
        {(() => {
          // Update module-level total for ChurnBarLabel
          _churnTotal = churnData.total || 0;

          return (
            <ChartCard
              title="Stock Churn"
              subtitle="Holding Period Distribution (LIFO)"
              icon={<AnalyticsIcon sx={{ fontSize: 18, color: '#8b5cf6' }} />}
            >
              {churnLoading ? <Spinner /> : churnBinsRemapped.every(b => b.count === 0) ? (
                <EmptyState text="No closed positions in selected date range." />
              ) : (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Chip label={`${churnData.total} closed positions`} size="small"
                      sx={{ bgcolor: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontSize: 11, fontWeight: 600 }} />
                  </Box>
                  {/* right margin 120 gives the outside label enough room */}
                  <ResponsiveContainer width="100%" height={255}>
                    <BarChart data={churnBinsRemapped} layout="vertical" margin={{ top: 0, right: 120, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="bin_label" tick={{ fill: '#94a3b8', fontSize: 12 }} width={56} axisLine={false} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          const pct = _churnTotal > 0 ? ((d?.count / _churnTotal) * 100).toFixed(1) : '0.0';
                          return (
                            <Box sx={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 2, p: 1.5, minWidth: 150 }}>
                              <Typography variant="body2" sx={{ color: '#f8fafc', fontWeight: 700, fontSize: '15.6px', mb: 0.5 }}>
                                {d?.bin_label}
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#cbd5e1', fontSize: '15.6px' }}>
                                Positions: {d?.count} ({pct}%)
                              </Typography>
                            </Box>
                          );
                        }}
                      />
                      <Bar dataKey="count" name="Positions" radius={[0, 6, 6, 0]} maxBarSize={22} isAnimationActive={false}>
                        {churnBinsRemapped.map((_: any, i: number) => {
                          const colors = ['#2962ff', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                          return <Cell key={i} fill={colors[i % colors.length]} />;
                        })}
                        <LabelList content={<ChurnBarLabel />} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </ChartCard>
          );
        })()}
      </Box>

      {/* ═══════════════════════════════════════════════════════════════════
          Row 2 — Monthly Portfolio Return & Rotation Efficiency Trend
      ══════════════════════════════════════════════════════════════════════ */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <ChartCard
          title="Monthly Portfolio Return"
          subtitle="Absolute realized profit % (profit / buying price)"
          icon={<TrendingUpIcon sx={{ fontSize: 18, color: '#06b6d4' }} />}
        >
          {returnLoading ? <Spinner /> : returnData.length === 0 ? (
            <EmptyState text="No settlement data available for return calculation." />
          ) : (
            /* top margin 28 prevents ReturnLineLabel text from clipping */
            <ResponsiveContainer width="100%" height={290}>
              <LineChart data={returnFormatted} margin={{ top: 28, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
                {avgReturn !== 0 && (
                  <ReferenceLine
                    y={avgReturn}
                    stroke="#FFFFFF"
                    strokeDasharray="3 3"
                    label={{
                      value: `Avg Return: ${avgReturn.toFixed(2)}%`,
                      fill: '#FFFFFF',
                      position: 'top',
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  />
                )}
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Normal Return']}
                  labelFormatter={l => l}
                />
                <Line
                  type="monotone"
                  dataKey="normal_return"
                  name="Normal Return %"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={(p: any) => {
                    const v = p.payload.normal_return;
                    return <circle key={p.key} cx={p.cx} cy={p.cy} r={4} fill={v >= 0 ? '#10b981' : '#ef4444'} stroke="none" />;
                  }}
                  activeDot={{ r: 6, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
                >
                  <LabelList content={<ReturnLineLabel />} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Widget B — Rotation Efficiency Trend */}
        <ChartCard
          title="Rotation Efficiency"
          subtitle="Monthly profit / total volume %"
          icon={<AnalyticsIcon sx={{ fontSize: 18, color: '#8b5cf6' }} />}
        >
          {effLoading ? <Spinner /> : effFormatted.length === 0 ? (
            <EmptyState text="No efficiency data available." />
          ) : (
            <ResponsiveContainer width="100%" height={290}>
              <LineChart data={effFormatted} margin={{ top: 28, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
                {avgRotationEff !== 0 && (
                  <ReferenceLine
                    y={avgRotationEff}
                    stroke="#FFFFFF"
                    strokeDasharray="3 3"
                    label={{
                      value: `Avg: ${avgRotationEff.toFixed(2)}%`,
                      fill: '#FFFFFF',
                      position: 'top',
                      fontSize: 10,
                      fontWeight: 600
                    }}
                  />
                )}
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Rotation Eff']}
                  labelFormatter={l => l}
                />
                <Line
                  type="monotone"
                  dataKey="rotation_eff"
                  name="Rotation Eff %"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={(p: any) => {
                    const v = p.payload.rotation_eff;
                    return <circle key={p.key} cx={p.cx} cy={p.cy} r={3.5} fill={v >= 0 ? '#8b5cf6' : '#ef4444'} stroke="none" />;
                  }}
                  activeDot={{ r: 5, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
                >
                  <LabelList
                    dataKey="rotation_eff"
                    content={(props: any) => {
                      const { x, y, value } = props;
                      if (value === null || value === undefined) return null;
                      return (
                        <text x={x} y={y - 8} textAnchor="middle" fill="#8b5cf6" fontSize={9} fontWeight={600}>
                          {`${Number(value).toFixed(1)}%`}
                        </text>
                      );
                    }}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Box>

      {/* ═══════════════════════════════════════════════════════════════════
          Row 2c — Monthly Trading Averages and Total Volumes/Profit Trend
      ══════════════════════════════════════════════════════════════════════ */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>

        {/* Widget 1: Monthly Trading Averages Trend */}
        <ChartCard
          title="Monthly Trading Averages"
          subtitle="Daily average buy and sell per month"
          icon={<TrendingUpIcon sx={{ fontSize: 18, color: '#10b981' }} />}
        >
          {effLoading ? <Spinner /> : effFormatted.length === 0 ? (
            <EmptyState text="No trading averages data available." />
          ) : (
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={effFormatted} margin={{ top: 20, right: 10, left: 10, bottom: 5 }} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: any, name: any) => [
                    `₹${Number(v).toLocaleString('en-IN')}`,
                    name === 'avg_buy' ? 'Avg. Buy' : 'Avg. Sell'
                  ]}
                  labelFormatter={l => l}
                />
                <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v === 'avg_buy' ? 'Avg. Buy' : 'Avg. Sell'}</span>} />
                <Bar dataKey="avg_buy" name="avg_buy" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false}>
                  <LabelList content={<PnlBarLabel />} />
                </Bar>
                <Bar dataKey="avg_sell" name="avg_sell" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false}>
                  <LabelList content={<PnlBarLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Widget 2: Monthly Total Volumes and Profit Trend */}
        <ChartCard
          title="Monthly Total Volumes and Profit"
          subtitle="Monthly total sell (left axis) vs realized profit (right axis)"
          icon={<AnalyticsIcon sx={{ fontSize: 18, color: '#f59e0b' }} />}
        >
          {effLoading ? <Spinner /> : effFormatted.length === 0 ? (
            <EmptyState text="No volume or profit data available." />
          ) : (
            <ResponsiveContainer width="100%" height={290}>
              <ComposedChart data={effFormatted} margin={{ top: 20, right: 10, left: 10, bottom: 5 }} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tickFormatter={fmtShort} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={fmtShort} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: any, name: any) => [
                    `₹${Number(v).toLocaleString('en-IN')}`,
                    name === 'total_sells' ? 'Total Sell' : 'Realized Profit'
                  ]}
                  labelFormatter={l => l}
                />
                <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v === 'total_sells' ? 'Total Sell' : 'Realized Profit'}</span>} />
                <Bar yAxisId="left" dataKey="total_sells" name="total_sells" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={15} isAnimationActive={false}>
                  <LabelList content={<PnlBarLabel />} />
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="realized_profit"
                  name="realized_profit"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={{ r: 3.5, fill: '#f59e0b', stroke: 'none' }}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                >
                  <LabelList content={<PnlBarLabel />} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Box>


    </Box>
  );
};

export default Analytics;
