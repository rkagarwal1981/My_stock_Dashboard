import React, { useEffect, useState, useCallback } from 'react';
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
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, LineChart, Line, Legend, ReferenceLine,
  Treemap, LabelList,
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
    // 1m = 31-60 days
    else if (/^(1\s*m(?:onth)?(?!\w)|31[-]60)/i.test(l))            acc['1m']     += cnt;
    // 2m = 61-90 days
    else if (/^(2\s*m(?:onth)?(?!\w)|61[-]90)/i.test(l))            acc['2m']     += cnt;
    // 3m = 91-120 days
    else if (/^(3\s*m(?:onth)?(?!\w)|91[-]120)/i.test(l))           acc['3m']     += cnt;
    // Anything 121+ days (old >3mnth, >1yr, 3-6m, 6-12m labels etc.)
    else                                                              acc['>4mnth'] += cnt;
  }

  return NEW_CHURN_BINS.map(b => ({ bin_label: b, count: acc[b] }));
}

// ─── Custom SVG label renderers ───────────────────────────────────────────────

/** Renders fmtShort value above each P&L bar. Skipped for zero-value bars. */
const PnlBarLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 5} textAnchor="middle"
      fill="#94a3b8" fontSize={10} fontWeight={600}>
      {fmtShort(value)}
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

/** Renders "N.N%" above each data point on the Return line chart. */
const ReturnLineLabel = (props: any) => {
  const { x, y, value } = props;
  if (value === null || value === undefined) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle"
      fill="#06b6d4" fontSize={10} fontWeight={600}>
      {`${Number(value).toFixed(1)}%`}
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

// ─── Treemap cell renderer ────────────────────────────────────────────────────

const TreemapContent = (props: any) => {
  const { x, y, width, height, name, value, pct, depth } = props;
  if (width < 20 || height < 20) return null;
  const color = SECTOR_COLORS[name] || '#475569';
  const showText = width > 60 && height > 40;
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2}
        rx={6} ry={6} fill={color} fillOpacity={depth === 1 ? 0.85 : 0.55}
        stroke="rgba(255,255,255,0.1)" strokeWidth={1}
        style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}
      />
      {showText && (
        <>
          <text x={x + 10} y={y + 22} fill="#0f172a" fontSize={Math.min(15.6, width / 6.6)} fontWeight={800}>{name}</text>
          {height > 56 && (
            <text x={x + 10} y={y + 40} fill="rgba(15, 23, 42, 0.85)" fontSize={Math.min(13.2, width / 7.5)} fontWeight={600}>{fmt(value)}</text>
          )}
          {height > 72 && (
            <text x={x + 10} y={y + 58} fill="rgba(15, 23, 42, 0.70)" fontSize={Math.min(12, width / 8.3)} fontWeight={600}>{pct?.toFixed(1)}%</text>
          )}
        </>
      )}
    </g>
  );
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
  // Persist churn date range across refreshes via localStorage (YYYY-MM format)
  const [churnFrom, setChurnFrom] = useState<string>(() => localStorage.getItem('churnFrom') || '');
  const [churnTo,   setChurnTo]   = useState<string>(() => localStorage.getItem('churnTo')   || '');

  const [returnData, setReturnData]       = useState<any[]>([]);
  const [returnLoading, setReturnLoading] = useState(true);
  const [returnType, setReturnType]       = useState<'weighted' | 'normal'>('weighted');

  const [sectorData, setSectorData]       = useState<any>({ sectors: [], total_value: 0 });
  const [sectorLoading, setSectorLoading] = useState(true);

  // ── Widget 4 — Others drill-down state ───────────────────────────────────
  const [othersOpen, setOthersOpen]       = useState(false);

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
      if (churnFrom) {
        // First day of the selected month
        params.date_from = `${churnFrom}-01`;
      }
      if (churnTo) {
        // Last day of the selected month
        const [y, m] = churnTo.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        params.date_to = `${churnTo}-${String(lastDay).padStart(2, '0')}`;
      }
      const res = await axios.get('/api/analytics/churn', { params });
      setChurnData(res.data);
    } catch { setChurnData({ bins: [], total: 0 }); } finally { setChurnLoading(false); }
  }, [brokerParam, churnFrom, churnTo]);

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

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchPnl();
    fetchChurn();
    fetchReturn();
    fetchSector();
  }, [brokerParam]);

  useEffect(() => { fetchChurn(); }, [churnFrom, churnTo]);

  // ── Derived / formatted data ──────────────────────────────────────────────

  const pnlFormatted = pnlData.map(d => ({
    ...d, month: fmtMonth(d.month), lossAbs: Math.abs(d.losses),
  }));

  const returnFormatted = returnData.map(d => ({
    ...d, month: fmtMonth(d.month),
  }));

  /** Churn bins normalised to the canonical 7-bucket sequence */
  const churnBinsRemapped = remapChurnBins(churnData.bins || []);

  // ── Widget 4: derive treemap data applying exclusions + reclassification ──

  /** Individual items inside "Others" — populated when the API returns them */
  const othersRawItems: any[] = sectorData.sectors.find((s: any) => s.sector === 'Others')?.stocks ?? [];

  /** Existing named sectors (excluding Others) — used in the re-categorize dropdown */
  const namedSectors: string[] = sectorData.sectors
    .map((s: any) => s.sector)
    .filter((s: string) => s !== 'Others');

  /** User-created custom group names not yet in the API response */
  const customSectorNames: string[] = ([
    ...new Set(othersRawItems.map(item => item.custom_category).filter(Boolean))
  ] as string[]).filter(n => !namedSectors.includes(n) && n !== 'Others');

  /**
   * Treemap data derived directly from the backend response which has overrides
   * (exclusions and custom categories) already applied.
   */
  const derivedSectors: { name: string; size: number; value: number; pct: number }[] = sectorData.sectors
    .filter((s: any) => s.value > 0)
    .map((s: any) => ({
      name: s.sector,
      size: s.value,
      value: s.value,
      pct: s.pct
    }));

  // ── Summary KPIs ──────────────────────────────────────────────────────────

  const totalGains  = pnlData.reduce((a: number, d: any) => a + (d.gains  || 0), 0);
  const totalLosses = pnlData.reduce((a: number, d: any) => a + (d.losses || 0), 0);
  const netPnl      = totalGains + totalLosses;
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

        {/* Global Broker Filter */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Broker</InputLabel>
          <Select value={broker} label="Broker" onChange={e => setBroker(e.target.value)}
            sx={{ borderRadius: 2, background: 'rgba(22,24,36,0.8)' }}>
            {BROKERS.map(b => <MenuItem key={b} value={b}>{b}</MenuItem>)}
          </Select>
        </FormControl>
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
          // Build sorted MMM-YY month options from pnlData (already fetched)
          // Fall back to last 24 months if pnlData is empty
          const buildMonthOptions = (): { label: string; value: string }[] => {
            const rawMonths: string[] = pnlData.length > 0
              ? pnlData.map((d: any) => d.month as string)   // 'YYYY-MM'
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
          };
          const monthOptions = buildMonthOptions();

          const selectSx = {
            minWidth: 110,
            '& .MuiInputBase-root': { fontSize: 12, borderRadius: 2 },
          };

          const handleFromChange = (val: string) => {
            setChurnFrom(val);
            localStorage.setItem('churnFrom', val);
          };
          const handleToChange = (val: string) => {
            setChurnTo(val);
            localStorage.setItem('churnTo', val);
          };

          // Update module-level total for ChurnBarLabel
          _churnTotal = churnData.total || 0;

          return (
            <ChartCard
              title="Stock Churn"
              subtitle="Holding Period Distribution (LIFO)"
              icon={<AnalyticsIcon sx={{ fontSize: 18, color: '#8b5cf6' }} />}
              extra={
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FormControl size="small" sx={selectSx}>
                    <InputLabel>From</InputLabel>
                    <Select
                      value={churnFrom}
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
                  <FormControl size="small" sx={selectSx}>
                    <InputLabel>To</InputLabel>
                    <Select
                      value={churnTo}
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
                </Box>
              }
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
          Row 2 — Monthly Weighted Return (full width)
      ══════════════════════════════════════════════════════════════════════ */}
      <Box sx={{ mb: 2 }}>
        <ChartCard
          title={returnType === 'weighted' ? 'Monthly Weighted Portfolio Return' : 'Monthly Normal Portfolio Return'}
          subtitle={returnType === 'weighted' ? '30-day normalised weighted return % · mirrors Details page formula' : 'Absolute realized profit % (profit / buying price)'}
          icon={<TrendingUpIcon sx={{ fontSize: 18, color: '#06b6d4' }} />}
          extra={
            <RadioGroup
              row
              value={returnType}
              onChange={e => setReturnType(e.target.value as any)}
              sx={{ color: '#94a3b8' }}
            >
              <FormControlLabel
                value="weighted"
                control={<Radio size="small" sx={{ color: '#2a2e43', '&.Mui-checked': { color: '#06b6d4' } }} />}
                label={<Typography sx={{ fontSize: 11, fontWeight: 600 }}>Weighted Return</Typography>}
              />
              <FormControlLabel
                value="normal"
                control={<Radio size="small" sx={{ color: '#2a2e43', '&.Mui-checked': { color: '#06b6d4' } }} />}
                label={<Typography sx={{ fontSize: 11, fontWeight: 600 }}>Normal Return</Typography>}
              />
            </RadioGroup>
          }
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
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: any) => [`${Number(v).toFixed(2)}%`, returnType === 'weighted' ? 'Weighted Return' : 'Normal Return']}
                  labelFormatter={l => l}
                />
                <Line
                  type="monotone"
                  dataKey={returnType === 'weighted' ? 'weighted_return' : 'normal_return'}
                  name={returnType === 'weighted' ? 'Weighted Return %' : 'Normal Return %'}
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={(p: any) => {
                    const v = returnType === 'weighted' ? p.payload.weighted_return : p.payload.normal_return;
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
      </Box>

      {/* ═══════════════════════════════════════════════════════════════════
          Row 3 — Sector Treemap (full width) + Others drill-down accordion
      ══════════════════════════════════════════════════════════════════════ */}
      <ChartCard
        title="Sector Allocation"
        subtitle="Active holdings grouped by industrial sector · expand Others to drill down"
        icon={<AccountTreeIcon sx={{ fontSize: 18, color: '#f59e0b' }} />}
      >
        {sectorLoading ? <Spinner /> : derivedSectors.length === 0 ? (
          <EmptyState text="No holdings data. Import transactions first." />
        ) : (
          <>
            {/* Legend chips */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
              {derivedSectors.map(s => (
                <MuiTooltip key={s.name} title={`${s.name}: ${fmt(s.value)} · ${s.pct.toFixed(1)}%`} arrow>
                  <Chip
                    label={`${s.name} ${s.pct.toFixed(0)}%`}
                    size="small"
                    sx={{
                      bgcolor: `${SECTOR_COLORS[s.name] || '#475569'}22`,
                      color:    SECTOR_COLORS[s.name] || '#8b5cf6',
                      border:  `1px solid ${SECTOR_COLORS[s.name] || '#475569'}44`,
                      fontSize: 10, fontWeight: 700, cursor: 'default',
                    }}
                  />
                </MuiTooltip>
              ))}
            </Box>

            {/* Treemap */}
            <ResponsiveContainer width="100%" height={300}>
              <Treemap data={derivedSectors} dataKey="size" aspectRatio={4 / 3}
                stroke="rgba(0,0,0,0.3)" content={<TreemapContent />} />
            </ResponsiveContainer>

            {/* ── Others Drill-down Accordion ──────────────────────────────── */}
            {(othersRawItems.length > 0 || derivedSectors.some(s => s.name === 'Others')) && (
              <Box sx={{ mt: 2.5 }}>

                {/* Toggle header */}
                <Box
                  onClick={() => setOthersOpen(o => !o)}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', px: 2, py: 1.25, borderRadius: 2,
                    border: '1px solid #2a2e43',
                    background: othersOpen ? 'rgba(71,85,105,0.22)' : 'rgba(71,85,105,0.10)',
                    '&:hover': { background: 'rgba(71,85,105,0.22)' },
                    transition: 'background 0.2s', userSelect: 'none',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#475569', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#94a3b8' }}>
                      Others — Drill-down &amp; Re-categorize
                    </Typography>
                    {othersRawItems.length > 0 && (
                      <Chip label={`${othersRawItems.length} stocks`} size="small"
                        sx={{ bgcolor: 'rgba(71,85,105,0.25)', color: '#94a3b8', fontSize: 10 }} />
                    )}
                    {othersRawItems.filter(item => item.is_excluded).length > 0 && (
                      <Chip label={`${othersRawItems.filter(item => item.is_excluded).length} excluded`} size="small"
                        sx={{ bgcolor: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 10 }} />
                    )}
                    {othersRawItems.filter(item => item.custom_category).length > 0 && (
                      <Chip label={`${othersRawItems.filter(item => item.custom_category).length} reclassified`} size="small"
                        sx={{ bgcolor: 'rgba(6,182,212,0.12)', color: '#06b6d4', fontSize: 10 }} />
                    )}
                  </Box>
                  <IconButton size="small" sx={{ color: '#64748b', pointerEvents: 'none' }}>
                    {othersOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>

                {/* Expandable panel */}
                <Collapse in={othersOpen}>
                  <Box sx={{ mt: 1, border: '1px solid #2a2e43', borderRadius: 2, background: 'rgba(13,15,25,0.7)', overflow: 'hidden' }}>

                    {othersRawItems.length === 0 ? (
                      /* Backend hasn't returned item-level data yet */
                      <Box sx={{ p: 2.5 }}>
                        <Typography variant="body2" sx={{ color: '#64748b', fontSize: 12, lineHeight: 1.75 }}>
                          The sector-allocation API does not yet return item-level data for the "Others" bucket.
                          Add a <code style={{ color: '#06b6d4' }}>stocks</code> array
                          (each entry: <code style={{ color: '#06b6d4' }}>{'{ script, value }'}</code>) to the
                          Others sector object in the response to enable per-stock drill-down, exclusion, and re-categorization.
                        </Typography>
                      </Box>
                    ) : (
                      <>
                        {/* Column header row */}
                        <Box sx={{
                          display: 'grid', gridTemplateColumns: '1fr 100px 68px 190px 72px',
                          px: 2, py: 1, borderBottom: '1px solid #2a2e43', bgcolor: 'rgba(42,46,67,0.45)',
                        }}>
                          {['Stock', 'Value', 'Weight', 'Assign Sector', 'Exclude'].map(h => (
                            <Typography key={h} variant="caption"
                              sx={{ color: '#475569', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                              {h}
                            </Typography>
                          ))}
                        </Box>

                        {/* Item rows */}
                        {othersRawItems.map((item: any, idx: number) => {
                          const name        = String(item.script ?? item.name ?? item.symbol ?? item.stock ?? `Item ${idx + 1}`);
                          const itemValue   = Number(item.value ?? 0);
                          const itemPct     = sectorData.total_value > 0 ? (itemValue / sectorData.total_value) * 100 : 0;
                          const isExcluded  = item.is_excluded ?? false;
                          const assignedSec = item.custom_category ?? '';

                          return (
                            <Box
                              key={name}
                              sx={{
                                display: 'grid', gridTemplateColumns: '1fr 100px 68px 190px 72px',
                                px: 2, py: 0.9, alignItems: 'center',
                                borderBottom: idx < othersRawItems.length - 1 ? '1px solid rgba(42,46,67,0.45)' : 'none',
                                opacity: isExcluded ? 0.35 : 1,
                                transition: 'opacity 0.2s, background 0.15s',
                                '&:hover': { bgcolor: 'rgba(42,46,67,0.28)' },
                              }}
                            >
                              {/* Stock name */}
                              <Typography variant="body2"
                                sx={{ fontWeight: 600, color: '#e2e8f0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {name}
                              </Typography>

                              {/* Value */}
                              <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: 12 }}>
                                {fmt(itemValue)}
                              </Typography>

                              {/* Weight */}
                              <Typography variant="body2" sx={{ color: '#8b5cf6', fontSize: 12, fontWeight: 700 }}>
                                {itemPct.toFixed(1)}%
                              </Typography>

                              {/* Re-categorize dropdown */}
                              <FormControl size="small" disabled={isExcluded} sx={{ maxWidth: 180 }}>
                                <Select
                                  displayEmpty
                                  value={assignedSec}
                                  onChange={async (e) => {
                                    const val = e.target.value as string;
                                    let targetSector = val;
                                    if (val === '__new__') {
                                      const newName = window.prompt('Enter new group / sector name:');
                                      if (newName?.trim()) {
                                        targetSector = newName.trim();
                                      } else {
                                        return;
                                      }
                                    }
                                    try {
                                      await axios.post('/api/analytics/sector-overrides', {
                                        stock_symbol: name,
                                        is_excluded: isExcluded,
                                        custom_category: targetSector || null
                                      });
                                      fetchSector();
                                    } catch (err) {
                                      console.error("Failed to save sector override", err);
                                    }
                                  }}
                                  renderValue={v => v
                                    ? <span style={{ color: '#06b6d4', fontSize: 11 }}>{v as string}</span>
                                    : <span style={{ color: '#475569', fontSize: 11 }}>Others (default)</span>
                                  }
                                  sx={{ fontSize: 11, borderRadius: 1.5, '& .MuiSelect-select': { py: 0.65 } }}
                                >
                                  <MenuItem value="" sx={{ fontSize: 11, color: '#64748b' }}>Others (default)</MenuItem>
                                  <Divider sx={{ my: 0.5, borderColor: '#2a2e43' }} />
                                  {namedSectors.map(sec => (
                                    <MenuItem key={sec} value={sec} sx={{ fontSize: 11 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SECTOR_COLORS[sec] || '#475569', flexShrink: 0 }} />
                                        {sec}
                                      </Box>
                                    </MenuItem>
                                  ))}
                                  {customSectorNames.map(sec => (
                                    <MenuItem key={sec} value={sec} sx={{ fontSize: 11, color: '#8b5cf6' }}>&#9733; {sec}</MenuItem>
                                  ))}
                                  <Divider sx={{ my: 0.5, borderColor: '#2a2e43' }} />
                                  <MenuItem value="__new__" sx={{ fontSize: 11, color: '#10b981' }}>+ New Group&hellip;</MenuItem>
                                </Select>
                              </FormControl>

                              {/* Exclude checkbox */}
                              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                <Checkbox
                                  size="small"
                                  checked={isExcluded}
                                  onChange={async (e) => {
                                    const checked = e.target.checked;
                                    try {
                                      await axios.post('/api/analytics/sector-overrides', {
                                        stock_symbol: name,
                                        is_excluded: checked,
                                        custom_category: assignedSec || null
                                      });
                                      fetchSector();
                                    } catch (err) {
                                      console.error("Failed to save sector override", err);
                                    }
                                  }}
                                  title={isExcluded ? 'Click to include' : 'Click to exclude from allocation'}
                                  sx={{ color: '#475569', '&.Mui-checked': { color: '#ef4444' }, p: 0.5 }}
                                />
                              </Box>
                            </Box>
                          );
                        })}

                        {/* Footer — quick-clear chips shown only when filters are active */}
                        {(othersRawItems.some(item => item.is_excluded || item.custom_category)) && (
                          <Box sx={{
                            px: 2, py: 1.25, borderTop: '1px solid #2a2e43', bgcolor: 'rgba(42,46,67,0.3)',
                            display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap',
                          }}>
                            <Typography variant="caption" sx={{ color: '#475569', fontSize: 10 }}>Active filters:</Typography>
                            {othersRawItems.some(item => item.is_excluded) && (
                              <Chip
                                label={`Clear ${othersRawItems.filter(item => item.is_excluded).length} excluded`} size="small"
                                onDelete={async () => {
                                  const excluded = othersRawItems.filter(item => item.is_excluded);
                                  for (const item of excluded) {
                                    await axios.post('/api/analytics/sector-overrides', {
                                      stock_symbol: item.script,
                                      is_excluded: false,
                                      custom_category: item.custom_category || null
                                    });
                                  }
                                  fetchSector();
                                }}
                                onClick={async () => {
                                  const excluded = othersRawItems.filter(item => item.is_excluded);
                                  for (const item of excluded) {
                                    await axios.post('/api/analytics/sector-overrides', {
                                      stock_symbol: item.script,
                                      is_excluded: false,
                                      custom_category: item.custom_category || null
                                    });
                                  }
                                  fetchSector();
                                }}
                                sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 10, cursor: 'pointer' }}
                              />
                            )}
                            {othersRawItems.some(item => item.custom_category) && (
                              <Chip
                                label={`Reset ${othersRawItems.filter(item => item.custom_category).length} reclassified`} size="small"
                                onDelete={async () => {
                                  const reclassified = othersRawItems.filter(item => item.custom_category);
                                  for (const item of reclassified) {
                                    await axios.post('/api/analytics/sector-overrides', {
                                      stock_symbol: item.script,
                                      is_excluded: item.is_excluded || false,
                                      custom_category: null
                                    });
                                  }
                                  fetchSector();
                                }}
                                onClick={async () => {
                                  const reclassified = othersRawItems.filter(item => item.custom_category);
                                  for (const item of reclassified) {
                                    await axios.post('/api/analytics/sector-overrides', {
                                      stock_symbol: item.script,
                                      is_excluded: item.is_excluded || false,
                                      custom_category: null
                                    });
                                  }
                                  fetchSector();
                                }}
                                sx={{ bgcolor: 'rgba(6,182,212,0.1)', color: '#06b6d4', fontSize: 10, cursor: 'pointer' }}
                              />
                            )}
                          </Box>
                        )}
                      </>
                    )}
                  </Box>
                </Collapse>
              </Box>
            )}
          </>
        )}
      </ChartCard>
    </Box>
  );
};

export default Analytics;
