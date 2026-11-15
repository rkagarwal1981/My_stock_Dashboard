import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  Chip,
  Drawer,
  IconButton,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  Tooltip as MuiTooltip,
  CircularProgress,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  InputAdornment,
  Button,
  Dialog,
  DialogTitle,
  DialogContent
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  LabelList
} from 'recharts';

interface MutualFundsV1Props {
  onViewStock?: (scrip: string) => void;
}

const FUND_CODES = ['H', 'P', 'Q', 'J', 'HV', 'HS', 'IC'];

const FUND_CODE_TO_NAME: Record<string, string> = {
  H: 'HDFC Flexi Cap Fund',
  P: 'Parag Parikh Flexi Cap Fund',
  Q: 'Quant Flexi Cap Fund',
  J: 'JM Flexicap Fund',
  HV: 'HDFC Value Fund',
  HS: 'HSBC Value Fund',
  IC: 'ICICI Value Fund'
};

const FUND_CODE_TO_CATEGORY: Record<string, 'Flexicap' | 'Value'> = {
  H: 'Flexicap',
  P: 'Flexicap',
  Q: 'Flexicap',
  J: 'Flexicap',
  HV: 'Value',
  HS: 'Value',
  IC: 'Value'
};

type SortField = 'stock_name' | 'value_crore' | 'pct_nav' | 'change_crore' | 'change_pct';
type SortOrder = 'asc' | 'desc';

interface EnrichedStockRow {
  raw: any;
  stock_name: string;
  symbol: string;
  isin: string;
  industry: string;
  live_current_value: number;
  curr_value_crore: number;
  prev_value_crore: number;
  curr_pct_nav: number;
  prev_pct_nav: number;
  change_crore: number;
  change_pct: number;
  section: 'INCREASED' | 'NEW' | 'EXITED' | 'REDUCED' | 'UNCHANGED';
}

const MutualFundsV1: React.FC<MutualFundsV1Props> = () => {
  const [summary, setSummary] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Page-level Radio Filters
  const [selectedFund, setSelectedFund] = useState<string>('H');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [onlyMyHoldings, setOnlyMyHoldings] = useState<boolean>(false);
  const [focusedSection, setFocusedSection] = useState<'ALL' | 'INCREASED' | 'NEW' | 'EXITED' | 'REDUCED'>('ALL');

  // Per-section sorting state
  const [sortState, setSortState] = useState<Record<string, { field: SortField; order: SortOrder }>>({
    INCREASED: { field: 'change_crore', order: 'desc' },
    NEW: { field: 'curr_value_crore' as any, order: 'desc' },
    EXITED: { field: 'change_crore', order: 'asc' },
    REDUCED: { field: 'change_crore', order: 'asc' }
  });

  // Stock Detail Drawer state (identical to MutualFunds section)
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [stockHistory, setStockHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Screener.in Snapshot Modal state
  const [screenerModalOpen, setScreenerModalOpen] = useState<boolean>(false);
  const [screenerLoading, setScreenerLoading] = useState<boolean>(false);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [screenerData, setScreenerData] = useState<{
    symbol: string;
    screener_url: string;
    chart_url: string | null;
    peers_url: string | null;
    captured_at: string | null;
    age_days: number | null;
  } | null>(null);

  const cleanScreenerSymbol = (rawScript: string): string => {
    let sym = String(rawScript || '').split('|')[0].trim().toUpperCase();
    if (sym.endsWith('-EQ')) {
      sym = sym.slice(0, -3).trim();
    }
    return sym;
  };

  const handleOpenScreenerWeb = (rawScript: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const sym = cleanScreenerSymbol(rawScript);
    if (!sym) return;
    window.open(
      `https://www.screener.in/company/${encodeURIComponent(sym)}/consolidated/`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleOpenScreenerSnapshot = async (
    rawScript: string,
    force: boolean = false,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    const sym = cleanScreenerSymbol(rawScript);
    if (!sym) return;

    setScreenerModalOpen(true);
    setScreenerLoading(true);
    setScreenerError(null);
    if (!force || !screenerData || screenerData.symbol !== sym) {
      setScreenerData({
        symbol: sym,
        screener_url: `https://www.screener.in/company/${sym}/consolidated/`,
        chart_url: null,
        peers_url: null,
        captured_at: null,
        age_days: null
      });
    }

    try {
      const res = await axios.get(
        `/api/watchlist/screener/${encodeURIComponent(sym)}?force=${force}`
      );
      setScreenerData(res.data);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail || `Failed to load Screener.in snapshot for ${sym}.`;
      setScreenerError(detail);
    } finally {
      setScreenerLoading(false);
    }
  };

  const renderScreenerActions = (rawScript: string) => {
    const sym = cleanScreenerSymbol(rawScript);
    if (!sym) return null;
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35 }}>
        <MuiTooltip title={`View ${sym} Screener Snapshot (PE/EPS Chart & Peers — Cached 90d)`} arrow>
          <IconButton
            size="small"
            onClick={e => handleOpenScreenerSnapshot(sym, false, e)}
            sx={{
              p: 0.4,
              color: '#38bdf8',
              bgcolor: 'rgba(56,189,248,0.1)',
              border: '1px solid rgba(56,189,248,0.25)',
              borderRadius: 1,
              '&:hover': { bgcolor: 'rgba(56,189,248,0.22)', color: '#7dd3fc' }
            }}
          >
            <CameraAltIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </MuiTooltip>
        <MuiTooltip title={`Open ${sym} on Screener.in in new tab`} arrow>
          <IconButton
            size="small"
            onClick={e => handleOpenScreenerWeb(sym, e)}
            sx={{
              p: 0.4,
              color: '#a78bfa',
              bgcolor: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.25)',
              borderRadius: 1,
              '&:hover': { bgcolor: 'rgba(167,139,250,0.22)', color: '#c4b5fd' }
            }}
          >
            <OpenInNewIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </MuiTooltip>
      </Box>
    );
  };

  // Load summary once on mount
  useEffect(() => {
    const loadSummary = async () => {
      try {
        const res = await axios.get('/api/mutual-funds/summary');
        const data = res.data;
        setSummary(data);
        const availMonths: string[] = data?.available_months ?? [];
        if (availMonths.length > 0 && !selectedMonth) {
          setSelectedMonth(data?.latest_month || availMonths[availMonths.length - 1]);
        }
      } catch (err) {
        console.error('Failed to load mutual funds summary:', err);
      }
    };
    loadSummary();
  }, []);

  // Load analytics when selectedFund changes
  useEffect(() => {
    const loadFundAnalytics = async () => {
      try {
        setLoading(true);
        const res = await axios.get('/api/mutual-funds/analytics', {
          params: {
            fund_code: selectedFund,
            category: 'ALL'
          }
        });
        setAnalytics(res.data || []);
      } catch (err) {
        console.error('Failed to load mutual funds analytics:', err);
      } finally {
        setLoading(false);
      }
    };
    loadFundAnalytics();
  }, [selectedFund]);

  // Load stock history when clicking a stock name to open the detail drawer
  useEffect(() => {
    const loadStockHistory = async (symbolOrName: string) => {
      if (!symbolOrName) return;
      try {
        setHistoryLoading(true);
        const res = await axios.get(`/api/mutual-funds/data?stock=${encodeURIComponent(symbolOrName)}`);
        setStockHistory(res.data || []);
      } catch (err) {
        console.error('Error loading stock history:', err);
      } finally {
        setHistoryLoading(false);
      }
    };

    if (selectedStock) {
      loadStockHistory(selectedStock.symbol || selectedStock.stock_name);
    } else {
      setStockHistory([]);
    }
  }, [selectedStock]);

  const months: string[] = useMemo(() => summary?.available_months ?? [], [summary]);
  const latestMonth: string = useMemo(() => summary?.latest_month ?? '', [summary]);

  const prevMonth: string | null = useMemo(() => {
    if (!selectedMonth || months.length === 0) return null;
    const idx = months.indexOf(selectedMonth);
    return idx > 0 ? months[idx - 1] : null;
  }, [months, selectedMonth]);

  // Compute the 4 sections for (selectedFund, selectedMonth)
  const categorizedData = useMemo(() => {
    const increased: EnrichedStockRow[] = [];
    const newAdditions: EnrichedStockRow[] = [];
    const completeExits: EnrichedStockRow[] = [];
    const reduced: EnrichedStockRow[] = [];

    if (!selectedMonth) {
      return { increased, newAdditions, completeExits, reduced };
    }

    const q = searchText.trim().toLowerCase();

    for (const r of analytics) {
      const stockName = String(r.stock_name || '');
      const symbol = String(r.symbol || '');
      const industry = String(r.industry || '');
      const liveVal = Number(r.current_value || 0);

      if (onlyMyHoldings && liveVal <= 0) continue;

      if (q) {
        const matches =
          stockName.toLowerCase().includes(q) ||
          symbol.toLowerCase().includes(q) ||
          industry.toLowerCase().includes(q);
        if (!matches) continue;
      }

      const currObj = r.month_values?.[selectedMonth];
      const prevObj = prevMonth ? r.month_values?.[prevMonth] : null;

      const currVal = Number(currObj?.value_crore ?? 0);
      const prevVal = Number(prevObj?.value_crore ?? 0);
      const currNav = Number(currObj?.pct_nav ?? 0);
      const prevNav = Number(prevObj?.pct_nav ?? 0);

      // Skip stocks not held in either selectedMonth or prevMonth
      if (currVal <= 0.0001 && prevVal <= 0.0001) continue;

      const changeCrore = prevMonth ? currVal - prevVal : 0;
      let changePct = 0;
      if (prevMonth) {
        if (prevVal > 0.0001) {
          changePct = ((currVal - prevVal) / prevVal) * 100;
        } else if (currVal > 0.0001) {
          changePct = 100;
        }
      }

      let section: EnrichedStockRow['section'] = 'UNCHANGED';
      if (!prevMonth) {
        if (currVal > 0.0001) section = 'NEW';
      } else if (prevVal <= 0.0001 && currVal > 0.0001) {
        section = 'NEW';
      } else if (prevVal > 0.0001 && currVal <= 0.0001) {
        section = 'EXITED';
      } else if (changeCrore > 0.0001) {
        section = 'INCREASED';
      } else if (changeCrore < -0.0001) {
        section = 'REDUCED';
      }

      const row: EnrichedStockRow = {
        raw: r,
        stock_name: stockName,
        symbol,
        isin: String(r.isin || ''),
        industry,
        live_current_value: liveVal,
        curr_value_crore: currVal,
        prev_value_crore: prevVal,
        curr_pct_nav: currNav,
        prev_pct_nav: prevNav,
        change_crore: changeCrore,
        change_pct: changePct,
        section
      };

      if (section === 'INCREASED') increased.push(row);
      else if (section === 'NEW') newAdditions.push(row);
      else if (section === 'EXITED') completeExits.push(row);
      else if (section === 'REDUCED') reduced.push(row);
    }

    const sortRows = (rows: EnrichedStockRow[], secKey: string) => {
      const cfg = sortState[secKey] || { field: 'change_crore', order: 'desc' };
      const dir = cfg.order === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => {
        if (cfg.field === 'stock_name') {
          return a.stock_name.localeCompare(b.stock_name) * dir;
        }
        if (cfg.field === 'value_crore') {
          const va = secKey === 'EXITED' ? a.prev_value_crore : a.curr_value_crore;
          const vb = secKey === 'EXITED' ? b.prev_value_crore : b.curr_value_crore;
          return (va - vb) * dir;
        }
        if (cfg.field === 'pct_nav') {
          const na = secKey === 'EXITED' ? a.prev_pct_nav : a.curr_pct_nav;
          const nb = secKey === 'EXITED' ? b.prev_pct_nav : b.curr_pct_nav;
          return (na - nb) * dir;
        }
        if (cfg.field === 'change_pct') {
          return (a.change_pct - b.change_pct) * dir;
        }
        return (a.change_crore - b.change_crore) * dir;
      });
    };

    return {
      increased: sortRows(increased, 'INCREASED'),
      newAdditions: sortRows(newAdditions, 'NEW'),
      completeExits: sortRows(completeExits, 'EXITED'),
      reduced: sortRows(reduced, 'REDUCED')
    };
  }, [analytics, selectedMonth, prevMonth, searchText, onlyMyHoldings, sortState]);

  // Summary totals across the 4 sections
  const sectionStats = useMemo(() => {
    const sumChange = (rows: EnrichedStockRow[]) =>
      rows.reduce((acc, r) => acc + r.change_crore, 0);
    const incTotal = sumChange(categorizedData.increased);
    const newTotal = categorizedData.newAdditions.reduce((acc, r) => acc + r.curr_value_crore, 0);
    const exitTotal = categorizedData.completeExits.reduce((acc, r) => acc + r.prev_value_crore, 0);
    const redTotal = sumChange(categorizedData.reduced); // negative
    const netFlow = incTotal + newTotal - exitTotal + redTotal;

    return {
      incTotal,
      newTotal,
      exitTotal,
      redTotal,
      netFlow
    };
  }, [categorizedData]);

  const handleSort = (secKey: string, field: SortField) => {
    setSortState(prev => {
      const curr = prev[secKey] || { field: 'change_crore', order: 'desc' };
      const nextOrder: SortOrder =
        curr.field === field ? (curr.order === 'desc' ? 'asc' : 'desc') : 'desc';
      return {
        ...prev,
        [secKey]: { field, order: nextOrder }
      };
    });
  };

  // ─── Drawer Chart & Table Computations (Same as MutualFunds.tsx) ─────────────
  const drawerChart1Data = useMemo(() => {
    if (!selectedStock) return [];
    return months.map(m => {
      const mv = selectedStock.month_values?.[m];
      return {
        month: m,
        value: mv ? Number((mv.value_crore || 0).toFixed(2)) : 0
      };
    });
  }, [selectedStock, months]);

  const drawerChart2Data = useMemo(() => {
    if (!selectedStock) return [];
    return months.map((m, idx) => {
      const current = selectedStock.month_values?.[m]?.value_crore ?? 0;
      const prev = idx > 0 ? (selectedStock.month_values?.[months[idx - 1]]?.value_crore ?? 0) : 0;
      const diff = idx > 0 ? current - prev : 0;
      let pct: number | null = null;
      if (idx > 0) {
        if (prev > 0) {
          pct = (diff / prev) * 100;
        } else if (current > 0) {
          pct = 100;
        } else {
          pct = 0;
        }
      }
      return {
        month: m,
        change: Number(diff.toFixed(2)),
        pct: pct !== null ? Number(pct.toFixed(1)) : null
      };
    });
  }, [selectedStock, months]);

  const drawerChart3Data = useMemo(() => {
    if (!selectedStock || stockHistory.length === 0) return [];
    return months.map(m => {
      const monthRecs = stockHistory.filter(h => h.month === m);
      const flexicap = monthRecs
        .filter(h => {
          const cat = (h.mf_category || '').toLowerCase();
          return cat.includes('flexi') || ['H', 'P', 'Q', 'J'].includes(h.fund_code);
        })
        .reduce((sum, h) => sum + (h.value_crore || 0), 0);

      const value = monthRecs
        .filter(h => {
          const cat = (h.mf_category || '').toLowerCase();
          return cat.includes('value') || ['HV', 'HS', 'IC'].includes(h.fund_code);
        })
        .reduce((sum, h) => sum + (h.value_crore || 0), 0);

      return {
        month: m,
        Flexicap: Number(flexicap.toFixed(2)),
        Value: Number(value.toFixed(2))
      };
    });
  }, [selectedStock, stockHistory, months]);

  const fundComparisonTable = useMemo(() => {
    if (!selectedStock || stockHistory.length === 0) return [];
    const targetMonth = selectedMonth || latestMonth;
    const targetIdx = months.indexOf(targetMonth);
    const prevM = targetIdx > 0 ? months[targetIdx - 1] : null;

    return FUND_CODES.map(code => {
      const fundRecs = stockHistory.filter(h => h.fund_code === code);
      const currRec = fundRecs.find(h => h.month === targetMonth);
      const prevRec = prevM ? fundRecs.find(h => h.month === prevM) : null;

      const latestVal = currRec ? Number(currRec.value_crore || 0) : 0;
      const prevVal = prevRec ? Number(prevRec.value_crore || 0) : 0;
      const diff = latestVal - prevVal;

      let direction = <RemoveIcon fontSize="small" sx={{ color: 'text.secondary' }} />;
      if (diff > 0.0001) {
        direction = <TrendingUpIcon fontSize="small" sx={{ color: '#10b981' }} />;
      } else if (diff < -0.0001) {
        direction = <TrendingDownIcon fontSize="small" sx={{ color: '#ef4444' }} />;
      }

      return {
        code,
        fullName: FUND_CODE_TO_NAME[code],
        latestValue: latestVal,
        quantity: currRec ? Number(currRec.quantity || 0) : 0,
        pctNav: currRec ? Number(currRec.pct_nav || 0) : 0,
        direction,
        isHolding: latestVal > 0
      };
    });
  }, [selectedStock, stockHistory, months, selectedMonth, latestMonth]);

  // Helper to render each of the 4 section tables
  const renderSectionCard = (config: {
    key: 'INCREASED' | 'NEW' | 'EXITED' | 'REDUCED';
    title: string;
    subtitle: string;
    accentColor: string;
    bgTint: string;
    borderTint: string;
    icon: React.ReactNode;
    rows: EnrichedStockRow[];
    totalCrLabel: string;
  }) => {
    const { key, title, subtitle, accentColor, bgTint, borderTint, icon, rows, totalCrLabel } = config;
    const sortCfg = sortState[key] || { field: 'change_crore', order: 'desc' };
    const isExited = key === 'EXITED';
    const isNew = key === 'NEW';

    const maxAbsChange =
      rows.length === 0
        ? 1
        : Math.max(
            1,
            ...rows.map(r => Math.abs(isExited ? r.prev_value_crore : isNew ? r.curr_value_crore : r.change_crore))
          );

    return (
      <Card
        sx={{
          background: 'rgba(22,24,36,0.78)',
          border: `1px solid ${borderTint}`,
          borderRadius: 2.5,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)'
        }}
      >
        {/* Section Header */}
        <Box
          sx={{
            px: 2.5,
            py: 1.75,
            background: bgTint,
            borderBottom: `1px solid ${borderTint}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(15,23,42,0.65)',
                color: accentColor,
                border: `1px solid ${borderTint}`
              }}
            >
              {icon}
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, fontSize: 18 }}>
                {title}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>
                {subtitle}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`${rows.length} Stock${rows.length !== 1 ? 's' : ''}`}
              size="small"
              sx={{
                bgcolor: 'rgba(15,23,42,0.7)',
                color: '#f8fafc',
                fontWeight: 700,
                fontSize: 13.5,
                height: 26,
                border: '1px solid #2a2e43'
              }}
            />
            <Chip
              label={totalCrLabel}
              size="small"
              sx={{
                bgcolor: 'rgba(15,23,42,0.85)',
                color: accentColor,
                fontWeight: 800,
                fontSize: 14,
                height: 26,
                border: `1px solid ${borderTint}`
              }}
            />
          </Box>
        </Box>

        {/* Section Table */}
        <CardContent sx={{ p: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ overflowY: 'auto', maxHeight: focusedSection === 'ALL' ? 480 : 700 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#131520', color: '#94a3b8', fontWeight: 700, fontSize: 14.5, py: 1.25 }}>
                    <TableSortLabel
                      active={sortCfg.field === 'stock_name'}
                      direction={sortCfg.field === 'stock_name' ? sortCfg.order : 'asc'}
                      onClick={() => handleSort(key, 'stock_name')}
                    >
                      Stock Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ bgcolor: '#131520', color: '#94a3b8', fontWeight: 700, fontSize: 14.5, py: 1.25 }}
                  >
                    <TableSortLabel
                      active={sortCfg.field === 'value_crore'}
                      direction={sortCfg.field === 'value_crore' ? sortCfg.order : 'desc'}
                      onClick={() => handleSort(key, 'value_crore')}
                    >
                      {isExited ? 'Prev Value (Cr)' : 'Current Value (Cr)'}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ bgcolor: '#131520', color: '#94a3b8', fontWeight: 700, fontSize: 14.5, py: 1.25 }}
                  >
                    <TableSortLabel
                      active={sortCfg.field === 'pct_nav'}
                      direction={sortCfg.field === 'pct_nav' ? sortCfg.order : 'desc'}
                      onClick={() => handleSort(key, 'pct_nav')}
                    >
                      {isExited ? 'Prev % to NAV' : '% to NAV'}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ bgcolor: '#131520', color: '#94a3b8', fontWeight: 700, fontSize: 14.5, py: 1.25 }}
                  >
                    <TableSortLabel
                      active={sortCfg.field === 'change_crore'}
                      direction={sortCfg.field === 'change_crore' ? sortCfg.order : 'desc'}
                      onClick={() => handleSort(key, 'change_crore')}
                    >
                      Change from Prev Month
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((row, idx) => {
                    const displayValueCr = isExited ? row.prev_value_crore : row.curr_value_crore;
                    const displayNav = isExited ? row.prev_pct_nav : row.curr_pct_nav;
                    const barMagnitude = Math.min(
                      100,
                      Math.round(
                        (Math.abs(isExited ? row.prev_value_crore : isNew ? row.curr_value_crore : row.change_crore) /
                          maxAbsChange) *
                          100
                      )
                    );

                    return (
                      <TableRow
                        key={`${row.isin || row.stock_name}-${idx}`}
                        sx={{
                          '&:hover': { bgcolor: 'rgba(41, 98, 255, 0.06)' },
                          borderBottom: '1px solid #1e2235'
                        }}
                      >
                        {/* Stock Name (clickable -> opens Drawer) */}
                        <TableCell sx={{ py: 1.35, borderBottom: '1px solid #1e2235' }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, flexWrap: 'wrap' }}>
                              <MuiTooltip title="Click to view Mutual Fund Holding & MoM Change Charts" arrow>
                                <span
                                  onClick={() => setSelectedStock(row.raw)}
                                  style={{
                                    cursor: 'pointer',
                                    color: '#3b82f6',
                                    fontWeight: 700,
                                    fontSize: '16.25px'
                                  }}
                                >
                                  {row.stock_name}
                                </span>
                              </MuiTooltip>
                              {renderScreenerActions(row.symbol || row.stock_name)}
                              {row.live_current_value > 0 && (
                                <MuiTooltip
                                  title={`Held in your Live Portfolio: ₹${Math.round(row.live_current_value).toLocaleString('en-IN')}`}
                                  arrow
                                >
                                  <Chip
                                    label={`My Hold: ₹${(row.live_current_value / 100000).toFixed(1)}L`}
                                    size="small"
                                    sx={{
                                      height: 22,
                                      fontSize: 12.5,
                                      fontWeight: 800,
                                      bgcolor: 'rgba(16, 185, 129, 0.16)',
                                      color: '#34d399',
                                      border: '1px solid rgba(16, 185, 129, 0.35)'
                                    }}
                                  />
                                </MuiTooltip>
                              )}
                            </Box>
                            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13.5 }}>
                              {row.symbol ? `${row.symbol} • ` : ''}
                              {row.industry || 'Equity'}
                            </Typography>
                          </Box>
                        </TableCell>

                        {/* Current Value (Cr) */}
                        <TableCell align="right" sx={{ py: 1.35, borderBottom: '1px solid #1e2235', whiteSpace: 'nowrap' }}>
                          <Typography sx={{ fontSize: 16.25, fontWeight: 700, color: isExited ? '#94a3b8' : '#f8fafc' }}>
                            ₹{displayValueCr.toFixed(2)} Cr
                          </Typography>
                          {!isNew && !isExited && (
                            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>
                              Prev: ₹{row.prev_value_crore.toFixed(2)} Cr
                            </Typography>
                          )}
                          {isExited && (
                            <Typography variant="caption" sx={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                              Now: ₹0 Cr
                            </Typography>
                          )}
                        </TableCell>

                        {/* % to NAV */}
                        <TableCell align="right" sx={{ py: 1.35, borderBottom: '1px solid #1e2235', whiteSpace: 'nowrap' }}>
                          <Typography sx={{ fontSize: 16.25, fontWeight: 600, color: '#cbd5e1' }}>
                            {displayNav.toFixed(2)}%
                          </Typography>
                          {!isNew && !isExited && (
                            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>
                              Prev: {row.prev_pct_nav.toFixed(2)}%
                            </Typography>
                          )}
                        </TableCell>

                        {/* Change from Previous Month */}
                        <TableCell align="right" sx={{ py: 1.35, borderBottom: '1px solid #1e2235', minWidth: 185 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                            {isNew ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Chip
                                  label="NEW ENTRY"
                                  size="small"
                                  sx={{
                                    height: 23,
                                    fontSize: 12.5,
                                    fontWeight: 800,
                                    bgcolor: 'rgba(56, 189, 248, 0.16)',
                                    color: '#38bdf8'
                                  }}
                                />
                                <Typography sx={{ fontSize: 16.25, fontWeight: 800, color: '#38bdf8' }}>
                                  +₹{row.curr_value_crore.toFixed(2)} Cr
                                </Typography>
                              </Box>
                            ) : isExited ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Chip
                                  label="EXITED"
                                  size="small"
                                  sx={{
                                    height: 23,
                                    fontSize: 12.5,
                                    fontWeight: 800,
                                    bgcolor: 'rgba(239, 68, 68, 0.16)',
                                    color: '#ef4444'
                                  }}
                                />
                                <Typography sx={{ fontSize: 16.25, fontWeight: 800, color: '#ef4444' }}>
                                  -₹{row.prev_value_crore.toFixed(2)} Cr (-100%)
                                </Typography>
                              </Box>
                            ) : (
                              <Typography
                                sx={{
                                  fontSize: 16.25,
                                  fontWeight: 800,
                                  color: row.change_crore >= 0 ? '#10b981' : '#ef4444',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {row.change_crore >= 0 ? '▲ +' : '▼ -'}₹{Math.abs(row.change_crore).toFixed(2)} Cr (
                                {row.change_pct >= 0 ? '+' : ''}
                                {row.change_pct.toFixed(1)}%)
                              </Typography>
                            )}

                            {/* Subtle visual bar showing relative size of change */}
                            <Box
                              sx={{
                                width: '100%',
                                maxWidth: 120,
                                height: 4,
                                borderRadius: 2,
                                bgcolor: 'rgba(255,255,255,0.06)',
                                overflow: 'hidden',
                                display: 'flex',
                                justifyContent: 'flex-end'
                              }}
                            >
                              <Box
                                sx={{
                                  width: `${barMagnitude}%`,
                                  height: '100%',
                                  bgcolor: accentColor,
                                  borderRadius: 2
                                }}
                              />
                            </Box>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      No stocks in {title.toLowerCase()} for {FUND_CODE_TO_NAME[selectedFund]} in {selectedMonth}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box className="fade-in">
      {/* Page Title & Quick Search */}
      <Box
        sx={{
          mb: 2.5,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            Mutual Funds (V1) — Monthly Activity Snapshot
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track what {FUND_CODE_TO_NAME[selectedFund] || selectedFund} bought, added fresh, trimmed, or completely exited in{' '}
            <strong style={{ color: '#f8fafc' }}>{selectedMonth || latestMonth}</strong>
            {prevMonth ? ` (compared to ${prevMonth})` : ''}.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Chip
            icon={<AccountBalanceWalletIcon sx={{ fontSize: 15 }} />}
            label={onlyMyHoldings ? 'Showing: My Portfolio Stocks Only' : 'Filter: My Portfolio Stocks'}
            clickable
            onClick={() => setOnlyMyHoldings(prev => !prev)}
            sx={{
              fontWeight: 700,
              fontSize: 12,
              height: 36,
              px: 0.75,
              bgcolor: onlyMyHoldings ? 'rgba(16, 185, 129, 0.2)' : 'rgba(22, 24, 36, 0.9)',
              color: onlyMyHoldings ? '#10b981' : '#94a3b8',
              border: onlyMyHoldings ? '1px solid #10b981' : '1px solid #2a2e43'
            }}
          />

          <TextField
            size="small"
            placeholder="Search stock, symbol, industry..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                )
              }
            }}
            sx={{ width: 250, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#161824' } }}
          />
        </Box>
      </Box>

      {/* Page-Level Radio Filters Card: 1) Mutual Fund Name  2) Month */}
      <Card
        sx={{
          mb: 3,
          background: 'rgba(22, 24, 36, 0.85)',
          border: '1px solid #2a2e43',
          borderRadius: 2.5
        }}
      >
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 1) Mutual Funds Name Radio Button Group */}
          <FormControl component="fieldset">
            <FormLabel
              component="legend"
              sx={{
                fontSize: 11,
                fontWeight: 800,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                mb: 1,
                '&.Mui-focused': { color: '#94a3b8' }
              }}
            >
              1) Select Mutual Fund Name
            </FormLabel>
            <RadioGroup
              row
              value={selectedFund}
              onChange={e => setSelectedFund(e.target.value)}
              sx={{ gap: 1, flexWrap: 'wrap' }}
            >
              {FUND_CODES.map(code => {
                const isSelected = selectedFund === code;
                const cat = FUND_CODE_TO_CATEGORY[code];
                return (
                  <FormControlLabel
                    key={code}
                    value={code}
                    control={
                      <Radio
                        size="small"
                        sx={{
                          p: 0.5,
                          color: '#64748b',
                          '&.Mui-checked': { color: '#3b82f6' }
                        }}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pr: 0.5 }}>
                        <Typography
                          sx={{
                            fontSize: 12.5,
                            fontWeight: isSelected ? 800 : 600,
                            color: isSelected ? '#f8fafc' : '#cbd5e1'
                          }}
                        >
                          {FUND_CODE_TO_NAME[code]}
                        </Typography>
                        <Chip
                          label={cat}
                          size="small"
                          sx={{
                            height: 17,
                            fontSize: 9.5,
                            fontWeight: 700,
                            bgcolor:
                              cat === 'Flexicap' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(167, 139, 250, 0.14)',
                            color: cat === 'Flexicap' ? '#38bdf8' : '#c084fc'
                          }}
                        />
                      </Box>
                    }
                    sx={{
                      m: 0,
                      px: 1.25,
                      py: 0.4,
                      borderRadius: 2,
                      border: isSelected ? '1.5px solid #3b82f6' : '1px solid #2a2e43',
                      bgcolor: isSelected ? 'rgba(59, 130, 246, 0.14)' : 'rgba(15, 23, 42, 0.55)',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        borderColor: '#3b82f6',
                        bgcolor: isSelected ? 'rgba(59, 130, 246, 0.18)' : 'rgba(59, 130, 246, 0.06)'
                      }
                    }}
                  />
                );
              })}
            </RadioGroup>
          </FormControl>

          <Divider sx={{ borderColor: '#2a2e43' }} />

          {/* 2) Month Radio Button Group */}
          <FormControl component="fieldset">
            <FormLabel
              component="legend"
              sx={{
                fontSize: 11,
                fontWeight: 800,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                mb: 1,
                '&.Mui-focused': { color: '#94a3b8' }
              }}
            >
              2) Select Month
            </FormLabel>
            <RadioGroup
              row
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              sx={{ gap: 1, flexWrap: 'wrap' }}
            >
              {months.map(m => {
                const isSelected = selectedMonth === m;
                return (
                  <FormControlLabel
                    key={m}
                    value={m}
                    control={
                      <Radio
                        size="small"
                        sx={{
                          p: 0.5,
                          color: '#64748b',
                          '&.Mui-checked': { color: '#10b981' }
                        }}
                      />
                    }
                    label={
                      <Typography
                        sx={{
                          fontSize: 12.5,
                          fontWeight: isSelected ? 800 : 600,
                          color: isSelected ? '#f8fafc' : '#cbd5e1',
                          pr: 0.5
                        }}
                      >
                        {m}
                      </Typography>
                    }
                    sx={{
                      m: 0,
                      px: 1.25,
                      py: 0.35,
                      borderRadius: 2,
                      border: isSelected ? '1.5px solid #10b981' : '1px solid #2a2e43',
                      bgcolor: isSelected ? 'rgba(16, 185, 129, 0.14)' : 'rgba(15, 23, 42, 0.55)',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        borderColor: '#10b981',
                        bgcolor: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.06)'
                      }
                    }}
                  />
                );
              })}
            </RadioGroup>
          </FormControl>
        </CardContent>
      </Card>

      {/* Summary KPI Cards Row (Click to focus on a section or view all 4) */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            key: 'INCREASED' as const,
            label: '1) Increased Holding',
            count: categorizedData.increased.length,
            valText: `+₹${Math.round(sectionStats.incTotal).toLocaleString('en-IN')} Cr`,
            color: '#10b981',
            border: 'rgba(16, 185, 129, 0.35)'
          },
          {
            key: 'NEW' as const,
            label: '2) New Additions',
            count: categorizedData.newAdditions.length,
            valText: `+₹${Math.round(sectionStats.newTotal).toLocaleString('en-IN')} Cr`,
            color: '#38bdf8',
            border: 'rgba(56, 189, 248, 0.35)'
          },
          {
            key: 'EXITED' as const,
            label: '3) Complete Exits',
            count: categorizedData.completeExits.length,
            valText: `-₹${Math.round(sectionStats.exitTotal).toLocaleString('en-IN')} Cr`,
            color: '#ef4444',
            border: 'rgba(239, 68, 68, 0.35)'
          },
          {
            key: 'REDUCED' as const,
            label: '4) Reduced Holding',
            count: categorizedData.reduced.length,
            valText: `-₹${Math.round(Math.abs(sectionStats.redTotal)).toLocaleString('en-IN')} Cr`,
            color: '#f59e0b',
            border: 'rgba(245, 158, 11, 0.35)'
          }
        ].map(kpi => {
          const isFocused = focusedSection === kpi.key;
          return (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={kpi.key}>
              <Card
                onClick={() => setFocusedSection(prev => (prev === kpi.key ? 'ALL' : kpi.key))}
                sx={{
                  cursor: 'pointer',
                  background: isFocused ? 'rgba(30, 41, 59, 0.9)' : 'rgba(22, 24, 36, 0.75)',
                  border: isFocused ? `2px solid ${kpi.color}` : `1px solid ${kpi.border}`,
                  borderRadius: 2,
                  transition: 'all 0.15s ease',
                  '&:hover': { transform: 'translateY(-2px)' }
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                      {kpi.label}
                    </Typography>
                    <Chip
                      label={`${kpi.count} stocks`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: 10.5,
                        fontWeight: 800,
                        bgcolor: 'rgba(15,23,42,0.7)',
                        color: kpi.color
                      }}
                    />
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: kpi.color }}>
                    {kpi.valText}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {focusedSection !== 'ALL' && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Chip
            label="Show All 4 Sections Side-by-Side"
            onClick={() => setFocusedSection('ALL')}
            color="primary"
            sx={{ fontWeight: 700 }}
          />
        </Box>
      )}

      {/* Main 4 Sections Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 360 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2.5}>
          {(focusedSection === 'ALL' || focusedSection === 'INCREASED') && (
            <Grid size={{ xs: 12, lg: focusedSection === 'ALL' ? 6 : 12 }}>
              {renderSectionCard({
                key: 'INCREASED',
                title: '1) Increased Holding',
                subtitle: `Existing positions where ${FUND_CODE_TO_NAME[selectedFund]} added shares in ${selectedMonth}`,
                accentColor: '#10b981',
                bgTint: 'linear-gradient(90deg, rgba(16,185,129,0.14) 0%, rgba(22,24,36,0.4) 100%)',
                borderTint: 'rgba(16,185,129,0.35)',
                icon: <TrendingUpIcon />,
                rows: categorizedData.increased,
                totalCrLabel: `+₹${Math.round(sectionStats.incTotal).toLocaleString('en-IN')} Cr`
              })}
            </Grid>
          )}

          {(focusedSection === 'ALL' || focusedSection === 'NEW') && (
            <Grid size={{ xs: 12, lg: focusedSection === 'ALL' ? 6 : 12 }}>
              {renderSectionCard({
                key: 'NEW',
                title: '2) New Additions',
                subtitle: `Fresh stocks entered by ${FUND_CODE_TO_NAME[selectedFund]} in ${selectedMonth}`,
                accentColor: '#38bdf8',
                bgTint: 'linear-gradient(90deg, rgba(56,189,248,0.14) 0%, rgba(22,24,36,0.4) 100%)',
                borderTint: 'rgba(56,189,248,0.35)',
                icon: <AddIcon />,
                rows: categorizedData.newAdditions,
                totalCrLabel: `+₹${Math.round(sectionStats.newTotal).toLocaleString('en-IN')} Cr`
              })}
            </Grid>
          )}

          {(focusedSection === 'ALL' || focusedSection === 'EXITED') && (
            <Grid size={{ xs: 12, lg: focusedSection === 'ALL' ? 6 : 12 }}>
              {renderSectionCard({
                key: 'EXITED',
                title: '3) Complete Exits',
                subtitle: `Stocks 100% sold off by ${FUND_CODE_TO_NAME[selectedFund]} in ${selectedMonth}`,
                accentColor: '#ef4444',
                bgTint: 'linear-gradient(90deg, rgba(239,68,68,0.14) 0%, rgba(22,24,36,0.4) 100%)',
                borderTint: 'rgba(239,68,68,0.35)',
                icon: <CloseIcon />,
                rows: categorizedData.completeExits,
                totalCrLabel: `-₹${Math.round(sectionStats.exitTotal).toLocaleString('en-IN')} Cr`
              })}
            </Grid>
          )}

          {(focusedSection === 'ALL' || focusedSection === 'REDUCED') && (
            <Grid size={{ xs: 12, lg: focusedSection === 'ALL' ? 6 : 12 }}>
              {renderSectionCard({
                key: 'REDUCED',
                title: '4) Reduced Holding',
                subtitle: `Existing positions trimmed by ${FUND_CODE_TO_NAME[selectedFund]} in ${selectedMonth}`,
                accentColor: '#f59e0b',
                bgTint: 'linear-gradient(90deg, rgba(245,158,11,0.14) 0%, rgba(22,24,36,0.4) 100%)',
                borderTint: 'rgba(245,158,11,0.35)',
                icon: <TrendingDownIcon />,
                rows: categorizedData.reduced,
                totalCrLabel: `-₹${Math.round(Math.abs(sectionStats.redTotal)).toLocaleString('en-IN')} Cr`
              })}
            </Grid>
          )}
        </Grid>
      )}

      {/* Stock Detail Drawer (Identical to Mutual Funds section) */}
      <Drawer
        anchor="right"
        open={Boolean(selectedStock)}
        onClose={() => setSelectedStock(null)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100%', sm: 600 },
              bgcolor: '#0c0d14',
              borderLeft: '1px solid #2a2e43',
              p: 3
            }
          }
        }}
      >
        {selectedStock && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Drawer Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  {selectedStock.stock_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ISIN: {selectedStock.isin} | Ticker: {selectedStock.symbol || 'N/A'} | Industry:{' '}
                  {selectedStock.industry}
                </Typography>
              </Box>
              <IconButton onClick={() => setSelectedStock(null)} sx={{ color: 'text.primary' }}>
                <CloseIcon />
              </IconButton>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Drawer Scrollable Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
              {/* Signal and Trend KPI */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6 }}>
                  <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        PORTFOLIO SIGNAL
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {selectedStock.portfolio_signal}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        5-MONTH TREND
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {selectedStock.trend_5m || 'N/A'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Fund Comparison Table */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Mutual Fund Comparison
              </Typography>
              {historyLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <Table size="small" sx={{ mb: 3, border: '1px solid #2a2e43', borderRadius: 2 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'background.paper' }}>
                      <TableCell sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>
                        Mutual Fund Name
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>
                        Shares Qty
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>
                        Value (Crore)
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>
                        % to NAV
                      </TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fundComparisonTable.map(row => (
                      <TableRow key={row.code} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                        <TableCell sx={{ fontWeight: 500 }}>{row.fullName}</TableCell>
                        <TableCell align="right">
                          {row.isHolding ? row.quantity.toLocaleString('en-IN') : '—'}
                        </TableCell>
                        <TableCell align="right">
                          {row.isHolding ? `₹${row.latestValue.toFixed(2)} Cr` : '—'}
                        </TableCell>
                        <TableCell align="right">
                          {row.isHolding ? `${row.pctNav.toFixed(2)}%` : '—'}
                        </TableCell>
                        <TableCell align="center">{row.direction}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Chart 1: Holding Value Over Time */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Month-Wise Holding Value (₹ Crore)
              </Typography>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={drawerChart1Data} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.18) : 10)]}
                  />
                  <ChartTooltip
                    formatter={(v: any) => [`₹${Number(v).toFixed(2)} Cr`, 'Holding Value']}
                    contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                    labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Bar dataKey="value" fill="#2962ff" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v: any) => {
                        const num = Number(v || 0);
                        if (num <= 0) return '';
                        return num >= 10 ? Math.round(num) : num.toFixed(1);
                      }}
                      style={{ fill: '#f8fafc', fontSize: 12, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <Box sx={{ mb: 3 }} />

              {/* Chart 2: MoM Change Value */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Month-on-Month Holding Change (₹ Crore)
              </Typography>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={drawerChart2Data} margin={{ top: 34, right: 12, left: 0, bottom: 26 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    domain={[
                      (dataMin: number) => (dataMin < 0 ? Math.floor(dataMin * 1.38) : -5),
                      (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.38) : 5)
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" />
                  <ChartTooltip
                    formatter={(v: any, _name: any, item: any) => {
                      const num = Number(v);
                      const pct = item?.payload?.pct;
                      const pctStr = pct != null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : '';
                      return [`${num >= 0 ? '+' : ''}₹${num.toFixed(2)} Cr${pctStr}`, 'MoM Change'];
                    }}
                    contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                    labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Bar
                    dataKey="change"
                    fill="#f8fafc"
                    isAnimationActive={false}
                    shape={(props: any) => {
                      const { x, y, width, height, payload } = props;
                      const val = payload?.change ?? 0;
                      const pct = payload?.pct;
                      if (val === 0 && Math.abs(height) < 1) {
                        return (
                          <rect
                            x={x + width * 0.2}
                            y={y - 1}
                            width={width * 0.6}
                            height={2}
                            fill="#64748b"
                            rx={1}
                          />
                        );
                      }
                      const barY = height < 0 ? y + height : y;
                      const barHeight = Math.max(2, Math.abs(height));
                      const color = val > 0 ? '#10b981' : val < 0 ? '#ef4444' : '#64748b';
                      const centerX = x + width / 2;
                      const numStr = `${val > 0 ? '+' : ''}${Math.abs(val) >= 10 ? Math.round(val) : val.toFixed(1)}`;
                      const pctStr =
                        pct != null
                          ? `(${pct > 0 ? '+' : ''}${Math.abs(pct) >= 10 ? Math.round(pct) : pct.toFixed(1)}%)`
                          : '';
                      const numLabelY = val >= 0 ? barY - 17 : barY + barHeight + 13;
                      const pctLabelY = val >= 0 ? barY - 4 : barY + barHeight + 26;

                      return (
                        <g>
                          <rect
                            x={x}
                            y={barY}
                            width={width}
                            height={barHeight}
                            fill={color}
                            rx={2}
                          />
                          <text
                            x={centerX}
                            y={numLabelY}
                            textAnchor="middle"
                            fill={color}
                            fontSize={12.5}
                            fontWeight={700}
                          >
                            {numStr}
                          </text>
                          {pctStr && (
                            <text
                              x={centerX}
                              y={pctLabelY}
                              textAnchor="middle"
                              fill="#cbd5e1"
                              fontSize={11}
                              fontWeight={600}
                            >
                              {pctStr}
                            </text>
                          )}
                        </g>
                      );
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>

              {/* Chart 3: Category Breakdown Over Time (Flexicap vs Value) */}
              {stockHistory.length > 0 && (
                <>
                  <Box sx={{ mb: 3 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Category Stacked Contribution (₹ Crore)
                  </Typography>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={drawerChart3Data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                      <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <ChartTooltip
                        formatter={(v: any, name: any) => [`₹${Number(v).toFixed(2)} Cr`, name]}
                        contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                        labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
                        itemStyle={{ color: '#f8fafc' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                      <Bar dataKey="Flexicap" name="Flexicap" fill="#3b82f6" stackId="category" />
                      <Bar dataKey="Value" name="Value" fill="#10b981" stackId="category" />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </Box>
          </Box>
        )}
      </Drawer>

      {/* Screener.in Quick-View Snapshot Modal */}
      <Dialog
        open={screenerModalOpen}
        onClose={() => setScreenerModalOpen(false)}
        maxWidth="xl"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#0f172a',
              border: '1px solid #2a2e43',
              borderRadius: 2,
              backgroundImage: 'none'
            }
          }
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1.5,
            borderBottom: '1px solid #2a2e43',
            py: 1.5,
            px: 2.5
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#f8fafc' }}>
              Screener.in Valuation — {screenerData?.symbol || ''}
            </Typography>
            {screenerData?.captured_at && (
              <Chip
                label={`Snapshot: ${screenerData.captured_at} (${screenerData.age_days ?? 0}d old • Auto-cached 90d)`}
                size="small"
                sx={{
                  bgcolor: 'rgba(16,185,129,0.14)',
                  color: '#34d399',
                  fontWeight: 600,
                  fontSize: 11
                }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {screenerData?.symbol && (
              <>
                <MuiTooltip title="Re-capture fresh screenshots from Screener.in now" arrow>
                  <span>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={screenerLoading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                      onClick={() => handleOpenScreenerSnapshot(screenerData.symbol, true)}
                      disabled={screenerLoading}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 1.5,
                        borderColor: 'rgba(56,189,248,0.4)',
                        color: '#38bdf8'
                      }}
                    >
                      Refresh Snapshot
                    </Button>
                  </span>
                </MuiTooltip>
                <Button
                  variant="contained"
                  size="small"
                  endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                  onClick={() => handleOpenScreenerWeb(screenerData.symbol)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    borderRadius: 1.5,
                    bgcolor: '#2962ff',
                    '&:hover': { bgcolor: '#1e4bd8' }
                  }}
                >
                  Open on Screener.in
                </Button>
              </>
            )}
            <IconButton onClick={() => setScreenerModalOpen(false)} size="small" sx={{ color: 'text.secondary' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 2.5 }}>
          {screenerLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
              <CircularProgress size={38} />
              <Typography variant="body2" color="text.secondary">
                Capturing Quarterly EPS / PE Ratio Chart & Peer Comparison from Screener.in for{' '}
                <strong>{screenerData?.symbol}</strong>...
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Once saved, this snapshot will load instantly for the next 90 days.
              </Typography>
            </Box>
          ) : screenerError ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body1" sx={{ color: '#ef4444', fontWeight: 600, mb: 1 }}>
                {screenerError}
              </Typography>
              {screenerData?.symbol && (
                <Button
                  variant="outlined"
                  size="small"
                  endIcon={<OpenInNewIcon />}
                  onClick={() => handleOpenScreenerWeb(screenerData.symbol)}
                  sx={{ mt: 1, textTransform: 'none' }}
                >
                  Open {screenerData.symbol} directly on Screener.in
                </Button>
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {screenerData?.chart_url && (
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 700, color: '#93c5fd', mb: 1, textTransform: 'uppercase', letterSpacing: 0.6 }}
                  >
                    1. Quarterly TTM EPS Trend & P/E Ratio (3Yr)
                  </Typography>
                  <Box
                    sx={{
                      border: '1px solid #2a2e43',
                      borderRadius: 2,
                      overflow: 'hidden',
                      bgcolor: '#ffffff',
                      p: 1
                    }}
                  >
                    <img
                      src={screenerData.chart_url}
                      alt={`${screenerData.symbol} PE & EPS Chart`}
                      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }}
                    />
                  </Box>
                </Box>
              )}

              {screenerData?.peers_url && (
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 700, color: '#93c5fd', mb: 1, textTransform: 'uppercase', letterSpacing: 0.6 }}
                  >
                    2. Peer Comparison
                  </Typography>
                  <Box
                    sx={{
                      border: '1px solid #2a2e43',
                      borderRadius: 2,
                      overflow: 'hidden',
                      bgcolor: '#ffffff',
                      p: 1
                    }}
                  >
                    <img
                      src={screenerData.peers_url}
                      alt={`${screenerData.symbol} Peer Comparison`}
                      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }}
                    />
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default MutualFundsV1;
