import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, Grid, Button, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, InputAdornment, Tooltip as MuiTooltip, IconButton, Select, MenuItem, FormControl, InputLabel,
  Checkbox, TableSortLabel, Snackbar, Alert, ClickAwayListener
} from '@mui/material';
import { ResponsiveContainer, Treemap, Tooltip, PieChart, Pie, Cell, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SpeedIcon from '@mui/icons-material/Speed';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

// ─── Color Palette for Sectors ────────────────────────────────────────────────
const SECTOR_COLORS: Record<string, string> = {
  'Financials':             '#2962ff',
  'Financial Services':     '#2962ff',
  'Information Technology': '#06b6d4',
  'Technology':             '#06b6d4',
  'Energy':                 '#f59e0b',
  'Automobile':             '#10b981',
  'Automobile and Auto Components': '#10b981',
  'Consumer Cyclical':      '#10b981',
  'Consumer Discretionary': '#a78bfa',
  'FMCG':                   '#8b5cf6',
  'Fast Moving Consumer Goods': '#8b5cf6',
  'Consumer Defensive':     '#8b5cf6',
  'Pharma':                 '#ec4899',
  'Healthcare':             '#ec4899',
  'Metals & Mining':        '#64748b',
  'Basic Materials':        '#64748b',
  'Materials':              '#64748b',
  'Infrastructure':         '#ef4444',
  'Telecom':                '#0ea5e9',
  'Communication Services': '#0ea5e9',
  'Chemicals':              '#34d399',
  'Capital Goods':          '#facc15',
  'Industrials':            '#facc15',
  'Utilities':              '#f97316',
  'Real Estate':            '#e11d48',
  'Others':                 '#475569',
};

const CAP_COLORS: Record<string, string> = {
  'Large': '#10b981',
  'Mid': '#f59e0b',
  'Small': '#ec4899'
};

// Formatting helpers
const formatLakh = (v: number): string => `₹${(v / 100_000).toFixed(2)} L`;
const formatCrore = (v: number): string => {
  if (!v || v <= 0) return '₹0 Cr';
  const val = Math.round(v / 10_000_000);
  return `₹${val.toLocaleString('en-IN')} Cr`;
};

// ─── Custom Recharts Treemap Cells ──────────────────────────────────────────
const TreemapCapContent = (props: any) => {
  const { x, y, width, height, name, value, pct, stock_count, onClick } = props;
  if (width < 25 || height < 25) return null;
  const color = CAP_COLORS[name] || '#475569';
  const showText = width > 75 && height > 45;
  return (
    <g onClick={() => onClick && onClick(name)} style={{ cursor: 'pointer' }}>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2}
        rx={6} ry={6} fill={color} fillOpacity={0.85}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1}
        style={{ transition: 'all 0.2s ease', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
      />
      {showText && (
        <>
          <text x={x + 10} y={y + 24} fill="#0f172a" fontSize={Math.min(15, width / 7)} fontWeight={800}>{name} Cap</text>
          {height > 55 && (
            <text x={x + 10} y={y + 42} fill="rgba(15, 23, 42, 0.85)" fontSize={Math.min(12, width / 8.5)} fontWeight={600}>
              {formatLakh(value)} ({pct?.toFixed(1)}%)
            </text>
          )}
          {height > 72 && (
            <text x={x + 10} y={y + 58} fill="rgba(15, 23, 42, 0.70)" fontSize={Math.min(11, width / 9.5)} fontWeight={500}>
              {stock_count} positions
            </text>
          )}
        </>
      )}
    </g>
  );
};

const TreemapStockCapContent = (props: any) => {
  const { x, y, width, height, name, value, category_contribution_pct, baseColor } = props;
  if (width < 20 || height < 20) return null;
  const showText = width > 60 && height > 35;
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2}
        rx={6} ry={6} fill={baseColor} fillOpacity={0.7}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1}
      />
      {showText && (
        <>
          <text x={x + 8} y={y + 20} fill="#0f172a" fontSize={Math.min(13, width / 7.5)} fontWeight={800}>{name}</text>
          {height > 45 && (
            <text x={x + 8} y={y + 35} fill="rgba(15, 23, 42, 0.85)" fontSize={Math.min(11, width / 9)} fontWeight={600}>
              {formatLakh(value)}
            </text>
          )}
          {height > 58 && (
            <text x={x + 8} y={y + 48} fill="rgba(15, 23, 42, 0.70)" fontSize={Math.min(10, width / 10)} fontWeight={500}>
              {category_contribution_pct?.toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
};

const TreemapSectorContent = (props: any) => {
  const { x, y, width, height, name, value, pct, stock_count, onClick } = props;
  if (width < 25 || height < 25) return null;
  const color = SECTOR_COLORS[name] || '#475569';
  const showText = width > 75 && height > 45;
  return (
    <g onClick={() => onClick && onClick(name)} style={{ cursor: 'pointer' }}>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2}
        rx={6} ry={6} fill={color} fillOpacity={0.85}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1}
        style={{ transition: 'all 0.2s ease', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
      />
      {showText && (
        <>
          <text x={x + 10} y={y + 24} fill="#0f172a" fontSize={Math.min(14, width / 8.5)} fontWeight={800}>{name}</text>
          {height > 55 && (
            <text x={x + 10} y={y + 42} fill="rgba(15, 23, 42, 0.85)" fontSize={Math.min(12, width / 9.5)} fontWeight={600}>
              {formatLakh(value)} ({pct?.toFixed(1)}%)
            </text>
          )}
          {height > 72 && (
            <text x={x + 10} y={y + 58} fill="rgba(15, 23, 42, 0.70)" fontSize={Math.min(11, width / 10)} fontWeight={500}>
              {stock_count} stocks
            </text>
          )}
        </>
      )}
    </g>
  );
};

const TreemapStockSectorContent = (props: any) => {
  const { x, y, width, height, name, value, sector_contribution_pct, baseColor } = props;
  if (width < 20 || height < 20) return null;
  const showText = width > 60 && height > 35;
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2}
        rx={6} ry={6} fill={baseColor} fillOpacity={0.7}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1}
      />
      {showText && (
        <>
          <text x={x + 8} y={y + 20} fill="#0f172a" fontSize={Math.min(13, width / 7.5)} fontWeight={800}>{name}</text>
          {height > 45 && (
            <text x={x + 8} y={y + 35} fill="rgba(15, 23, 42, 0.85)" fontSize={Math.min(11, width / 9)} fontWeight={600}>
              {formatLakh(value)}
            </text>
          )}
          {height > 58 && (
            <text x={x + 8} y={y + 48} fill="rgba(15, 23, 42, 0.70)" fontSize={Math.min(10, width / 10)} fontWeight={500}>
              {sector_contribution_pct?.toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
};

// ─── Sortable column definitions ────────────────────────────────────────────
type SortKey = 'script' | 'sector' | 'industry' | 'market_cap_category' | 'pe' | 'market_cap' | 'beta' | 'current_value' | 'contribution_pct';

interface ColumnDef {
  key: SortKey;
  label: string;
  align?: 'left' | 'right' | 'center';
  filterable?: boolean;
}

const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'script', label: 'Scrip', filterable: true },
  { key: 'sector', label: 'Sector', filterable: true },
  { key: 'industry', label: 'Industry', filterable: true },
  { key: 'market_cap_category', label: 'Cap', filterable: true },
  { key: 'pe', label: 'P/E', align: 'right' },
  { key: 'market_cap', label: 'Market Cap (Cr)', align: 'right' },
  { key: 'beta', label: 'Beta', align: 'right' },
  { key: 'current_value', label: 'Current Value', align: 'right' },
  { key: 'contribution_pct', label: 'Weight %', align: 'right' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
const HoldingAnalysis: React.FC = () => {
  const [broker, setBroker] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>({
    holdings: [],
    market_cap_summary: {},
    sector_summary: [],
    portfolio_beta: 1.0,
    nifty100_beta: 1.0,
    beta_coverage_pct: 0.0
  });

  // Drill-down states
  const [selectedCap, setSelectedCap] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('contribution_pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Per-column filter state
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  // Sector editing state
  const [editingSector, setEditingSector] = useState<string | null>(null); // script being edited
  const [editSectorValue, setEditSectorValue] = useState('');

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  });

  const fetchAnalysis = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const brokerParam = broker === 'All' ? '' : broker;
      const res = await axios.get('/api/holdings-analysis', {
        params: { broker: brokerParam || undefined, force_refresh: force }
      });
      setData(res.data);
      setSelectedCap(null);
      setSelectedSector(null);
    } catch (err) {
      console.error('Failed to fetch holdings analysis:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [broker]);

  useEffect(() => {
    fetchAnalysis(false);
  }, [fetchAnalysis]);

  // ─── Exclusion toggle handler ───────────────────────────────────────────
  const handleExclusionToggle = useCallback(async (script: string, currentlyExcluded: boolean) => {
    try {
      await axios.put('/api/holdings-analysis/exclude', {
        symbol: script,
        is_excluded: !currentlyExcluded
      });
      // Optimistic update: modify local data so charts/table update instantly
      setData((prev: any) => {
        const updatedHoldings = prev.holdings.map((h: any) =>
          h.script === script ? { ...h, is_excluded: !currentlyExcluded } : h
        );
        // Recalculate summaries from updated holdings
        return recalculateSummaries({ ...prev, holdings: updatedHoldings });
      });
      setSnackbar({
        open: true,
        message: `${script} ${!currentlyExcluded ? 'excluded from' : 'included in'} analysis`,
        severity: 'success'
      });
    } catch (err) {
      console.error('Failed to toggle exclusion:', err);
      setSnackbar({ open: true, message: 'Failed to update exclusion', severity: 'error' });
    }
  }, []);

  // ─── Sector override handler ────────────────────────────────────────────
  const handleSectorSave = useCallback(async (script: string, newSector: string) => {
    try {
      await axios.put('/api/holdings-analysis/sector-override', {
        symbol: script,
        sector_override: newSector
      });
      setData((prev: any) => {
        const updatedHoldings = prev.holdings.map((h: any) =>
          h.script === script
            ? { ...h, sector: newSector || h.raw_sector, sector_override: newSector || null }
            : h
        );
        return recalculateSummaries({ ...prev, holdings: updatedHoldings });
      });
      setEditingSector(null);
      setSnackbar({ open: true, message: `Sector updated for ${script}`, severity: 'success' });
    } catch (err) {
      console.error('Failed to update sector:', err);
      setSnackbar({ open: true, message: 'Failed to update sector', severity: 'error' });
    }
  }, []);

  // ─── Recalculate summaries from holdings (client-side) ──────────────────
  const recalculateSummaries = (prevData: any) => {
    const holdings = prevData.holdings || [];
    const totalValAll = holdings.reduce((sum: number, h: any) => sum + (h.current_value || 0), 0);
    const totalIncluded = holdings
      .filter((h: any) => !h.is_excluded && h.current_value > 0)
      .reduce((sum: number, h: any) => sum + h.current_value, 0);

    const updatedHoldings = holdings.map((h: any) => {
      const contribution_pct = totalValAll > 0 ? ((h.current_value || 0) / totalValAll) * 100.0 : 0.0;
      const weighted_beta = (contribution_pct / 100.0) * (h.beta ?? 1.0);
      return {
        ...h,
        contribution_pct: +contribution_pct.toFixed(2),
        weighted_beta: +weighted_beta.toFixed(4)
      };
    });

    const capSummary: any = {
      Large: { value: 0, pct: 0, stock_count: 0, stocks: [] },
      Mid: { value: 0, pct: 0, stock_count: 0, stocks: [] },
      Small: { value: 0, pct: 0, stock_count: 0, stocks: [] },
    };
    const sectorMap: any = {};
    let wBetaSum = 0;

    for (const h of updatedHoldings) {
      if (h.is_excluded || h.current_value <= 0) continue;
      const cv = h.current_value;
      const cat = h.market_cap_category || 'Small';
      const sector = h.sector || 'Others';
      const chartPct = totalIncluded > 0 ? (cv / totalIncluded) * 100 : 0;

      capSummary[cat].value += cv;
      capSummary[cat].stock_count += 1;
      capSummary[cat].stocks.push({
        script: h.script, company_name: h.company_name, value: cv,
        contribution_pct: +chartPct.toFixed(2)
      });

      if (!sectorMap[sector]) sectorMap[sector] = { value: 0, pct: 0, stock_count: 0, stocks: [] };
      sectorMap[sector].value += cv;
      sectorMap[sector].stock_count += 1;
      sectorMap[sector].stocks.push({
        script: h.script, company_name: h.company_name, value: cv,
        industry: h.industry, beta: h.beta, beta_is_actual: h.beta_is_actual,
        contribution_pct: +chartPct.toFixed(2)
      });

      wBetaSum += cv * (h.beta ?? 1);
    }

    // Normalize cap percentages
    for (const cat of Object.keys(capSummary)) {
      const d = capSummary[cat];
      d.pct = totalIncluded > 0 ? +((d.value / totalIncluded) * 100).toFixed(2) : 0;
      d.value = +d.value.toFixed(2);
      d.stocks.sort((a: any, b: any) => b.value - a.value);
      for (const s of d.stocks) {
        s.category_contribution_pct = d.value > 0 ? +((s.value / d.value) * 100).toFixed(2) : 0;
      }
    }

    // Build sector list
    const sectorList = Object.entries(sectorMap).map(([name, d]: [string, any]) => {
      const pct = totalIncluded > 0 ? +((d.value / totalIncluded) * 100).toFixed(2) : 0;
      d.stocks.sort((a: any, b: any) => b.value - a.value);
      const sectTotal = d.value;
      for (const s of d.stocks) {
        s.sector_contribution_pct = sectTotal > 0 ? +((s.value / sectTotal) * 100).toFixed(2) : 0;
      }
      return { sector: name, value: +d.value.toFixed(2), pct, stock_count: d.stock_count, stocks: d.stocks };
    }).sort((a, b) => b.value - a.value);

    const portfolioBeta = totalValAll > 0 ? +(wBetaSum / totalValAll).toFixed(3) : 1.0;

    return {
      ...prevData,
      holdings: updatedHoldings,
      market_cap_summary: capSummary,
      sector_summary: sectorList,
      portfolio_beta: portfolioBeta,
    };
  };

  // Derived treemap data for Cap Category
  const capTreemapData = useMemo(() => {
    if (!data.market_cap_summary) return [];
    return Object.entries(data.market_cap_summary).map(([name, item]: [string, any]) => ({
      name, value: item.value, size: item.value, pct: item.pct, stock_count: item.stock_count
    })).filter(item => item.value > 0);
  }, [data.market_cap_summary]);

  // Derived treemap data for Sector Category
  const sectorTreemapData = useMemo(() => {
    if (!data.sector_summary) return [];
    return data.sector_summary.map((item: any) => ({
      name: item.sector, value: item.value, size: item.value, pct: item.pct, stock_count: item.stock_count
    })).filter((item: any) => item.value > 0);
  }, [data.sector_summary]);

  // Derived treemap data for Stocks in Selected Sector
  const stockSectorTreemapData = useMemo(() => {
    if (!selectedSector || !data.sector_summary) return [];
    const sectorObj = data.sector_summary.find((s: any) => s.sector === selectedSector);
    if (!sectorObj) return [];
    return sectorObj.stocks.map((s: any) => ({
      name: s.script.replace(/-EQ$/, ''), value: s.value, size: s.value, sector_contribution_pct: s.sector_contribution_pct
    }));
  }, [selectedSector, data.sector_summary]);

  // Derived data for Holding Weights & Beta contributions (Top 10 holdings by weight)
  const barChartData = useMemo(() => {
    if (!data.holdings) return [];
    return [...data.holdings]
      .filter((h: any) => !h.is_excluded && h.current_value > 0)
      .sort((a: any, b: any) => b.current_value - a.current_value)
      .slice(0, 10)
      .map((h: any) => ({
        name: h.script.replace(/-EQ$/, ''),
        weight: h.contribution_pct,
        weightedBeta: h.weighted_beta || (h.contribution_pct / 100.0) * (h.beta || 1.0)
      }));
  }, [data.holdings]);

  // Beta risk evaluation
  const betaRiskDetails = useMemo(() => {
    const beta = data.portfolio_beta;
    if (beta < 0.85) {
      return {
        label: 'Defensive Portfolio (Low Risk)',
        color: '#10b981',
        description: 'Your portfolio is less volatile than Nifty 100. It provides stability during market downturns.',
        icon: <ShieldIcon sx={{ fontSize: 32, color: '#10b981' }} />
      };
    } else if (beta <= 1.15) {
      return {
        label: 'Market-Neutral Portfolio (Medium Risk)',
        color: '#2962ff',
        description: 'Your portfolio moves in lockstep with Nifty 100. Volatility matches the broad market benchmarks.',
        icon: <SpeedIcon sx={{ fontSize: 32, color: '#2962ff' }} />
      };
    } else {
      return {
        label: 'Aggressive Portfolio (High Risk)',
        color: '#f59e0b',
        description: 'Your portfolio has higher volatility than Nifty 100. Great for growth, but carries elevated risk.',
        icon: <WarningAmberIcon sx={{ fontSize: 32, color: '#f59e0b' }} />
      };
    }
  }, [data.portfolio_beta]);

  // ─── Sort handler ─────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'script' || key === 'sector' || key === 'industry' || key === 'market_cap_category' ? 'asc' : 'desc');
    }
  };

  // ─── Filtered + sorted holdings ──────────────────────────────────────────
  const filteredHoldings = useMemo(() => {
    if (!data.holdings) return [];
    let result = [...data.holdings];

    // Global search filter
    const query = searchTerm.toLowerCase().trim();
    if (query) {
      result = result.filter((h: any) =>
        h.script.toLowerCase().includes(query) ||
        h.sector.toLowerCase().includes(query) ||
        h.industry.toLowerCase().includes(query)
      );
    }

    // Per-column filters
    for (const [key, val] of Object.entries(columnFilters)) {
      const fv = val.toLowerCase().trim();
      if (!fv) continue;
      result = result.filter((h: any) => {
        const cellVal = String(h[key] ?? '').toLowerCase();
        return cellVal.includes(fv);
      });
    }

    // Cap Category chart filter
    if (selectedCap) {
      result = result.filter((h: any) => h.market_cap_category === selectedCap);
    }

    // Sector chart filter
    if (selectedSector) {
      result = result.filter((h: any) => h.sector === selectedSector);
    }

    // Sort
    result.sort((a: any, b: any) => {
      let va = a[sortKey];
      let vb = b[sortKey];

      // Keep null values at the end regardless of direction
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;

      // String comparison for text columns
      if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = vb.toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      // Numeric comparison
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return result;
  }, [searchTerm, data.holdings, sortKey, sortDir, columnFilters, selectedCap, selectedSector]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', height: '60vh', gap: 2 }}>
        <CircularProgress />
        <Typography variant="body1" color="text.secondary">Fetching stock metadata and generating analysis...</Typography>
      </Box>
    );
  }

  return (
    <Box className="fade-in" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      
      {/* ─── Control Bar ─── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="broker-select-label">Broker</InputLabel>
            <Select
              labelId="broker-select-label"
              id="broker-select"
              value={broker}
              label="Broker"
              onChange={(e) => setBroker(e.target.value)}
            >
              <MenuItem value="All">All Brokers</MenuItem>
              <MenuItem value="Zerodha">Zerodha</MenuItem>
              <MenuItem value="MStock">MStock</MenuItem>
              <MenuItem value="Mstock_KA">Mstock_KA</MenuItem>
              <MenuItem value="Dhan">Dhan</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={refreshing ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
            onClick={() => fetchAnalysis(true)}
            disabled={refreshing}
          >
            Refresh Metadata
          </Button>
        </Box>
      </Box>

      {/* ─── Risk Gauge Dashboard ─── */}
      <Card className="glass-panel" sx={{ border: '1px solid #2a2e43', borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Grid container spacing={3} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, md: 4 }} sx={{ borderRight: { md: '1px solid #2a2e43' }, pr: { md: 4 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                {betaRiskDetails.icon}
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Risk Profile
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {betaRiskDetails.description}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }} sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>
                Weighted Portfolio Beta
              </Typography>
              <Typography variant="h2" sx={{ fontWeight: 900, color: betaRiskDetails.color, my: 1 }}>
                {data.portfolio_beta?.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Benchmark Nifty 100 Beta: 1.00
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }} sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>
                Beta Coverage Details
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, color: 'text.primary', my: 1 }}>
                {data.beta_coverage_pct?.toFixed(0)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Value-weighted percentage of positions having active beta values.
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ─── Market Cap & Sector Chart Blocks ─── */}
      <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
        
        {/* Section 1: Market Cap Analysis */}
        <Grid size={{ xs: 12, md: 2.4 }}>
          <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid #2a2e43', height: '100%' }}>
            <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Market Cap
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedCap ? `Filtered: ${selectedCap}` : 'Aggregate'}
                  </Typography>
                </Box>
                {selectedCap && (
                  <Button
                    size="small"
                    onClick={() => setSelectedCap(null)}
                    variant="outlined"
                    sx={{ py: 0, px: 1, minWidth: 'auto' }}
                  >
                    Clear
                  </Button>
                )}
              </Box>

              <Box sx={{ width: '100%', height: 340, mt: 'auto', mb: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={capTreemapData}
                      cx="50%"
                      cy="48%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      onClick={(entry) => {
                        if (entry && entry.name) {
                          setSelectedCap(prev => prev === entry.name ? null : entry.name);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {capTreemapData.map((entry: any, index: number) => {
                        const isSelected = selectedCap === entry.name;
                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={CAP_COLORS[entry.name] || '#8884d8'}
                            fillOpacity={selectedCap ? (isSelected ? 1.0 : 0.35) : 0.85}
                            stroke={isSelected ? '#ffffff' : 'rgba(0,0,0,0.3)'}
                            strokeWidth={isSelected ? 2 : 1}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                      formatter={(val: number, name: any, props: any) => {
                        const item = props.payload;
                        return [
                          `${formatLakh(val)} (${item.pct?.toFixed(1)}%)`,
                          `${name} Cap`
                        ];
                      }}
                    />
                    <Legend layout="horizontal" align="center" verticalAlign="bottom" iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Section 2: Sector Wise Analysis */}
        <Grid size={{ xs: 12, md: 9.6 }}>
          <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid #2a2e43', height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Sector Allocation
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedSector ? `Drilled down: ${selectedSector} Stocks` : 'Aggregate Portfolio Distribution'}
                  </Typography>
                </Box>
                {selectedSector && (
                  <Button
                    size="small"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => setSelectedSector(null)}
                    variant="outlined"
                  >
                    Back
                  </Button>
                )}
              </Box>

              <Box sx={{ width: '100%', height: 340, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {!selectedSector ? (
                    <Treemap
                      data={sectorTreemapData}
                      dataKey="size"
                      aspectRatio={4 / 3}
                      stroke="rgba(0,0,0,0.3)"
                      content={<TreemapSectorContent onClick={(name: string) => setSelectedSector(name)} />}
                    >
                      <Tooltip
                        contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                        formatter={(val: number) => [formatLakh(val), 'Value']}
                      />
                    </Treemap>
                  ) : (
                    <Treemap
                      data={stockSectorTreemapData}
                      dataKey="size"
                      aspectRatio={4 / 3}
                      stroke="rgba(0,0,0,0.3)"
                      content={<TreemapStockSectorContent baseColor={SECTOR_COLORS[selectedSector] || '#475569'} />}
                    >
                      <Tooltip
                        contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                        formatter={(val: number) => [formatLakh(val), 'Value']}
                      />
                    </Treemap>
                  )}
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

      </Grid>

      {/* ─── Detailed Holdings Table ─── */}
      <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid #2a2e43' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Position Classification Details
            </Typography>
            <TextField
              size="small"
              placeholder="Search scrip, company, sector, industry..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }
              }}
              sx={{ minWidth: 320 }}
            />
          </Box>

          <TableContainer component={Paper} sx={{ bgcolor: 'transparent', backgroundImage: 'none', border: 'none', boxShadow: 'none', maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                {/* ── Column headers with sort ── */}
                <TableRow>
                  <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 700, width: 42, p: 0.5 }}>
                    <MuiTooltip title="Check to exclude from charts & beta">
                      <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700 }}>Excl</Typography>
                    </MuiTooltip>
                  </TableCell>
                  {TABLE_COLUMNS.map(col => (
                    <TableCell
                      key={col.key}
                      align={col.align || 'left'}
                      sx={{ bgcolor: 'background.paper', fontWeight: 700 }}
                      sortDirection={sortKey === col.key ? sortDir : false}
                    >
                      <TableSortLabel
                        active={sortKey === col.key}
                        direction={sortKey === col.key ? sortDir : 'asc'}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
                {/* ── Per-column filter row ── */}
                <TableRow>
                  <TableCell sx={{ bgcolor: 'background.paper', p: 0.5 }} />
                  {TABLE_COLUMNS.map(col => (
                    <TableCell key={`filter-${col.key}`} align={col.align || 'left'} sx={{ bgcolor: 'background.paper', p: 0.5 }}>
                      {col.filterable ? (
                        <TextField
                          size="small"
                          variant="standard"
                          placeholder="Filter..."
                          value={columnFilters[col.key] || ''}
                          onChange={(e) => setColumnFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                          sx={{ '& .MuiInput-input': { fontSize: 11, py: 0.25 } }}
                        />
                      ) : null}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredHoldings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      No positions found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHoldings.map((h: any) => {
                    const isExcluded = h.is_excluded;
                    const isEditingSector = editingSector === h.script;
                    return (
                      <TableRow
                        key={`${h.script}-${h.broker}`}
                        sx={{
                          '&:hover': { bgcolor: 'rgba(254, 240, 138, 0.05)' },
                          transition: 'background-color 0.15s ease',
                          opacity: isExcluded ? 0.55 : 1,
                        }}
                      >
                        {/* Exclude Checkbox */}
                        <TableCell sx={{ p: 0.5 }}>
                          <Checkbox
                            size="small"
                            checked={isExcluded}
                            onChange={() => handleExclusionToggle(h.script, isExcluded)}
                            sx={{ p: 0.25 }}
                          />
                        </TableCell>

                        {/* Scrip */}
                        <TableCell sx={{ fontWeight: 600, color: 'primary.light' }}>{h.script.replace(/-EQ$/, '')}</TableCell>

                        {/* Sector — editable */}
                        <TableCell>
                          {isEditingSector ? (
                            <ClickAwayListener onClickAway={() => setEditingSector(null)}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  size="small"
                                  variant="standard"
                                  value={editSectorValue}
                                  onChange={(e) => setEditSectorValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSectorSave(h.script, editSectorValue);
                                    if (e.key === 'Escape') setEditingSector(null);
                                  }}
                                  autoFocus
                                  sx={{ '& .MuiInput-input': { fontSize: 13, py: 0.25 }, minWidth: 100 }}
                                />
                                <IconButton size="small" onClick={() => handleSectorSave(h.script, editSectorValue)} sx={{ p: 0.25 }}>
                                  <CheckIcon fontSize="small" sx={{ color: '#10b981' }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => setEditingSector(null)} sx={{ p: 0.25 }}>
                                  <CloseIcon fontSize="small" sx={{ color: '#ef4444' }} />
                                </IconButton>
                              </Box>
                            </ClickAwayListener>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
                              onClick={() => { setEditingSector(h.script); setEditSectorValue(h.sector); }}
                            >
                              <Typography variant="body2" sx={{
                                color: h.sector_override ? '#06b6d4' : 'text.primary',
                                fontWeight: h.sector_override ? 600 : 400,
                              }}>
                                {h.sector}
                              </Typography>
                              {h.sector_override && (
                                <MuiTooltip title={`Original: ${h.raw_sector}`}>
                                  <Box sx={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    bgcolor: '#06b6d4', flexShrink: 0, ml: 0.5
                                  }} />
                                </MuiTooltip>
                              )}
                              <EditIcon sx={{ fontSize: 13, color: 'text.disabled', opacity: 0.5, ml: 0.25, flexShrink: 0 }} />
                            </Box>
                          )}
                        </TableCell>

                        {/* Industry */}
                        <TableCell sx={{ color: 'text.secondary' }}>{h.industry}</TableCell>

                        {/* Cap Badge */}
                        <TableCell>
                          <Box sx={{
                            display: 'inline-block', px: 1, py: 0.25, borderRadius: 1,
                            fontSize: 11, fontWeight: 700,
                            bgcolor: `${CAP_COLORS[h.market_cap_category]}15`,
                            color: CAP_COLORS[h.market_cap_category],
                            border: `1px solid ${CAP_COLORS[h.market_cap_category]}30`
                          }}>
                            {h.market_cap_category}
                          </Box>
                        </TableCell>

                        {/* P/E Badge */}
                        <TableCell align="right">
                          {h.pe !== null && h.pe !== undefined ? (
                            <Box sx={{
                              display: 'inline-block', px: 1, py: 0.25, borderRadius: 1,
                              fontSize: 11, fontWeight: 700,
                              bgcolor: h.pe < 30 ? 'rgba(16, 185, 129, 0.15)' : h.pe <= 60 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: h.pe < 30 ? '#10b981' : h.pe <= 60 ? '#f59e0b' : '#ef4444',
                              border: `1px solid ${h.pe < 30 ? 'rgba(16, 185, 129, 0.3)' : h.pe <= 60 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                            }}>
                              {h.pe.toFixed(2)}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">N/A</Typography>
                          )}
                        </TableCell>

                        {/* Market Cap */}
                        <TableCell align="right">{h.market_cap > 0 ? formatCrore(h.market_cap) : 'N/A'}</TableCell>

                        {/* Beta */}
                        <TableCell align="right" sx={{ fontWeight: 600, color: h.beta > 1.2 ? '#f59e0b' : 'text.primary' }}>
                          {h.beta?.toFixed(2)}
                          {!h.beta_is_actual && (
                            <MuiTooltip title="Beta defaulted to 1.0 — no data source available">
                              <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 4, cursor: 'help' }}>*</span>
                            </MuiTooltip>
                          )}
                        </TableCell>

                        {/* Current Value */}
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{formatLakh(h.current_value)}</TableCell>

                        {/* Weight % */}
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>{h.contribution_pct?.toFixed(2)}%</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* ─── Snackbar ─── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default HoldingAnalysis;
