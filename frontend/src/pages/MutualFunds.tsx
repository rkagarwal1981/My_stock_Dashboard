import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import {
  Box, Typography, Card, CardContent, Grid, MenuItem, Select, FormControl,
  InputLabel, TextField, Chip, Button, Drawer, IconButton, Divider, Table,
  TableHead, TableBody, TableRow, TableCell, Tooltip as MuiTooltip, CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import RemoveIcon from '@mui/icons-material/Remove';
import StarIcon from '@mui/icons-material/Star';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip,
  CartesianGrid, Legend, Cell
} from 'recharts';

import AddTargetModal from '../components/AddTargetModal';

interface MutualFundsProps {
  onViewStock: (scrip: string) => void;
}

const FUND_CODES = ['H', 'P', 'Q', 'J'];
const FUND_NAME_TO_CODE: Record<string, string> = {
  'HDFC Flexi Cap': 'H',
  'PPFCF': 'P',
  'Quant Flexi Cap': 'Q',
  'JM Financial': 'J'
};
const FUND_CODE_TO_NAME: Record<string, string> = {
  'H': 'HDFC Flexi Cap Fund',
  'P': 'Parag Parikh Flexi Cap Fund',
  'Q': 'Quant Flexi Cap Fund',
  'J': 'JM Flexicap Fund'
};

const parseFundInitialWord = (rawName: string | undefined): string => {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  if (trimmed === 'PPFCF' || trimmed.startsWith('Parag Parikh')) {
    return 'Parag';
  }
  if (trimmed.startsWith('HDFC')) {
    return 'HDFC';
  }
  if (trimmed.startsWith('Quant')) {
    return 'Quant';
  }
  if (trimmed.startsWith('JM')) {
    return 'JM';
  }
  return trimmed.split(/\s+/)[0];
};

const FILTER_CATEGORIES = [
  { value: 'ALL', label: 'All Stocks' },
  // New Stocks
  { value: 'NEW_LATEST', label: 'New Stocks: Added in Latest Month' },
  { value: 'NEW_2M', label: 'New Stocks: Added in Last 2 Months' },
  { value: 'NEW_3M', label: 'New Stocks: Added in Last 3 Months' },
  // Increased
  { value: 'INC_LATEST', label: 'Increased: In Latest Month' },
  { value: 'INC_2M', label: 'Increased: Continuously for Last 2 Months' },
  { value: 'INC_3M', label: 'Increased: Continuously for Last 3 Months' },
  // Decreased
  { value: 'DEC_LATEST', label: 'Decreased: In Latest Month' },
  { value: 'DEC_2M', label: 'Decreased: Continuously for Last 2 Months' },
  { value: 'DEC_3M', label: 'Decreased: Continuously for Last 3 Months' },
  // Consistent
  { value: 'CONS_5M', label: 'Consistent: Held for Last 5 Months' },
  { value: 'CONS_STABLE', label: 'Consistent & Stable (Configured Tolerance)' },
  { value: 'CONS_INC', label: 'Consistent & Gradually Increasing' },
  { value: 'CONS_DEC', label: 'Consistent & Gradually Decreasing' },
  // High Conviction
  { value: 'TOP_10', label: 'High Conviction: Top 10 Holdings' },
  { value: 'TOP_20', label: 'High Conviction: Top 20 Holdings' },
  { value: 'TOP_30', label: 'High Conviction: Top 30 Holdings' },
  // Fund Manager Activity
  { value: 'BIG_BUY', label: 'Activity: Biggest Monthly Buying' },
  { value: 'BIG_SELL', label: 'Activity: Biggest Monthly Selling' },
  { value: 'AGG_ACC', label: 'Activity: Aggressive Accumulation' },
  { value: 'AGG_RED', label: 'Activity: Aggressive Reduction' },
  { value: 'EXITED', label: 'Activity: Recently Exited Stocks' },
  // Common (Only for ALL view)
  { value: 'COMMON_2', label: 'Common: Held by at least 2 Funds' },
  { value: 'COMMON_3', label: 'Common: Held by at least 3 Funds' },
  { value: 'COMMON_ALL', label: 'Common: Held by All Active Funds' },
  { value: 'COMMON_ACC', label: 'Common: Accumulated by Multiple Funds' },
  { value: 'DIVERGENT', label: 'Common: Divergent Fund Activity' }
];

const MutualFunds: React.FC<MutualFundsProps> = ({ onViewStock }) => {
  const [summary, setSummary] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [selectedFund, setSelectedFund] = useState<string>('ALL');
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [searchText, setSearchText] = useState<string>('');
  
  // Stock details drawer state
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [stockHistory, setStockHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Target modal state
  const [targetModalOpen, setTargetModalOpen] = useState<boolean>(false);
  const [targetModalScript, setTargetModalScript] = useState<string>('');

  // Load Mutual Fund summary and analytics
  const loadData = async () => {
    try {
      setLoading(true);
      const summaryRes = await axios.get('/api/mutual-funds/summary');
      setSummary(summaryRes.data);

      const analyticsRes = await axios.get(`/api/mutual-funds/analytics?fund_code=${selectedFund}`);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      console.error('Error loading mutual fund data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedFund]);

  // Load history for detail view when a stock is clicked
  const loadStockHistory = async (symbol: string) => {
    if (!symbol) return;
    try {
      setHistoryLoading(true);
      const res = await axios.get(`/api/mutual-funds/data?stock=${encodeURIComponent(symbol)}`);
      setStockHistory(res.data);
    } catch (err) {
      console.error('Error loading stock history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Trigger loading of history when selectedStock changes
  useEffect(() => {
    if (selectedStock) {
      loadStockHistory(selectedStock.symbol || selectedStock.stock_name);
    } else {
      setStockHistory([]);
    }
  }, [selectedStock]);

  const months = useMemo(() => {
    return summary?.available_months ?? [];
  }, [summary]);

  const latestMonth = useMemo(() => {
    return summary?.latest_month ?? '';
  }, [summary]);

  // Row filtering logic
  const filteredRows = useMemo(() => {
    let rows = [...analytics];

    // Filter by text search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      rows = rows.filter(r => 
        r.stock_name.toLowerCase().includes(q) || 
        (r.symbol && r.symbol.toLowerCase().includes(q)) ||
        r.industry.toLowerCase().includes(q) ||
        (r.mutual_fund && r.mutual_fund.toLowerCase().includes(q))
      );
    }

    // Filter by Analysis Filter dropdown
    switch (selectedFilter) {
      case 'NEW_LATEST':
        rows = rows.filter(r => r.status === 'NEW');
        break;
      case 'NEW_2M':
        rows = rows.filter(r => {
          const vals = months.slice(-2).map(m => r.month_values[m]?.value_crore ?? 0);
          return vals[0] === 0 && vals[1] > 0;
        });
        break;
      case 'NEW_3M':
        rows = rows.filter(r => {
          const vals = months.slice(-3).map(m => r.month_values[m]?.value_crore ?? 0);
          return vals[0] === 0 && (vals[1] > 0 || vals[2] > 0);
        });
        break;
      case 'INC_LATEST':
        rows = rows.filter(r => r.change_1m_crore > 0.0001 && r.status !== 'NEW');
        break;
      case 'INC_2M':
        rows = rows.filter(r => r.inc_2m);
        break;
      case 'INC_3M':
        rows = rows.filter(r => r.inc_3m);
        break;
      case 'DEC_LATEST':
        rows = rows.filter(r => r.change_1m_crore < -0.0001 && r.status !== 'EXITED');
        break;
      case 'DEC_2M':
        rows = rows.filter(r => r.dec_2m);
        break;
      case 'DEC_3M':
        rows = rows.filter(r => r.dec_3m);
        break;
      case 'CONS_5M':
        rows = rows.filter(r => r.consistent_5m);
        break;
      case 'CONS_STABLE':
        rows = rows.filter(r => r.consistent_5m && r.trend_5m === 'Stable');
        break;
      case 'CONS_INC':
        rows = rows.filter(r => r.consistent_5m && r.trend_5m === 'Gradually Increasing');
        break;
      case 'CONS_DEC':
        rows = rows.filter(r => r.consistent_5m && r.trend_5m === 'Gradually Decreasing');
        break;
      case 'TOP_10':
        rows.sort((a, b) => b.latest_value_crore - a.latest_value_crore);
        rows = rows.slice(0, 10);
        break;
      case 'TOP_20':
        rows.sort((a, b) => b.latest_value_crore - a.latest_value_crore);
        rows = rows.slice(0, 20);
        break;
      case 'TOP_30':
        rows.sort((a, b) => b.latest_value_crore - a.latest_value_crore);
        rows = rows.slice(0, 30);
        break;
      case 'BIG_BUY':
        rows = rows.filter(r => r.change_1m_crore > 0.0001 && r.status !== 'NEW');
        rows.sort((a, b) => b.change_1m_crore - a.change_1m_crore);
        rows = rows.slice(0, 15);
        break;
      case 'BIG_SELL':
        rows = rows.filter(r => r.change_1m_crore < -0.0001 && r.status !== 'EXITED');
        rows.sort((a, b) => a.change_1m_crore - b.change_1m_crore);
        rows = rows.slice(0, 15);
        break;
      case 'AGG_ACC':
        rows = rows.filter(r => r.inc_2m || r.inc_3m);
        rows.sort((a, b) => b.change_1m_crore - a.change_1m_crore);
        break;
      case 'AGG_RED':
        rows = rows.filter(r => r.dec_2m || r.dec_3m);
        rows.sort((a, b) => a.change_1m_crore - b.change_1m_crore);
        break;
      case 'EXITED':
        rows = rows.filter(r => r.status === 'EXITED');
        break;
      case 'COMMON_2':
        rows = rows.filter(r => r.holding_funds && r.holding_funds.length >= 2);
        break;
      case 'COMMON_3':
        rows = rows.filter(r => r.holding_funds && r.holding_funds.length >= 3);
        break;
      case 'COMMON_ALL':
        const activeFundsCount = summary?.number_of_funds ?? 4;
        rows = rows.filter(r => r.holding_funds && r.holding_funds.length === activeFundsCount);
        break;
      case 'COMMON_ACC':
        rows = rows.filter(r => r.accumulating_funds && r.accumulating_funds.length >= 2);
        break;
      case 'DIVERGENT':
        rows = rows.filter(r => r.is_divergent);
        break;
      default:
        break;
    }

    return rows;
  }, [analytics, selectedFilter, searchText, months, summary]);

  // KPI Calculations (based on latestMonth)
  const kpis = useMemo(() => {
    if (!analytics || analytics.length === 0) return {
      stocksHeld: 0,
      totalVal: 0,
      newEntries: 0,
      increased: 0,
      decreased: 0,
      exits: 0,
      held2Plus: 0,
      held3Plus: 0,
      heldAll: 0,
      accumulatedMultiple: 0
    };

    const uniqueSymbols = new Set(analytics.filter(r => r.latest_value_crore > 0).map(r => r.symbol || r.stock_name));
    const stocksHeld = uniqueSymbols.size;
    const totalVal = analytics.reduce((s, r) => s + r.latest_value_crore, 0);
    const newEntries = analytics.filter(r => r.status === 'NEW').length;
    const increased = analytics.filter(r => r.change_1m_crore > 0.0001 && r.status !== 'NEW').length;
    const decreased = analytics.filter(r => r.change_1m_crore < -0.0001 && r.status !== 'EXITED').length;
    const exits = analytics.filter(r => r.status === 'EXITED').length;

    // Multi-fund holdings metrics across unique stocks
    const held2Plus = analytics.filter(r => r.holding_funds && r.holding_funds.length >= 2).length;
    const held3Plus = analytics.filter(r => r.holding_funds && r.holding_funds.length >= 3).length;
    
    const activeFundsCount = summary?.number_of_funds ?? 4;
    const heldAll = analytics.filter(r => r.holding_funds && r.holding_funds.length === activeFundsCount).length;
    const accumulatedMultiple = analytics.filter(r => r.accumulating_funds && r.accumulating_funds.length >= 2).length;

    return {
      stocksHeld,
      totalVal,
      newEntries,
      increased,
      decreased,
      exits,
      held2Plus,
      held3Plus,
      heldAll,
      accumulatedMultiple
    };
  }, [analytics, summary]);

  // AG Grid columns configuration
  const columnDefs = useMemo(() => {
    const colList: any[] = [
      // 1. Portfolio Signal (1st position - far left)
      {
        field: 'portfolio_signal',
        headerName: 'Portfolio Signal',
        flex: 1.3,
        minWidth: 145,
        cellRenderer: (p: any) => {
          if (!p.value) return '—';
          
          let color = '#94a3b8';
          let bg = 'rgba(148,163,184,0.1)';
          let border = '1px solid rgba(148,163,184,0.2)';

          if (p.value === 'New Entry') {
            color = '#10b981';
            bg = 'rgba(16,185,129,0.1)';
            border = '1px solid rgba(16,185,129,0.2)';
          } else if (p.value === 'Strong Accumulation') {
            color = '#047857';
            bg = 'rgba(4,120,87,0.15)';
            border = '1px solid rgba(4,120,87,0.2)';
          } else if (p.value === 'Accumulating') {
            color = '#34d399';
            bg = 'rgba(52,211,153,0.1)';
            border = '1px solid rgba(52,211,153,0.2)';
          } else if (p.value === 'Strong Reduction') {
            color = '#b91c1c';
            bg = 'rgba(185,28,28,0.15)';
            border = '1px solid rgba(185,28,28,0.2)';
          } else if (p.value === 'Reducing') {
            color = '#f87171';
            bg = 'rgba(248,113,113,0.1)';
            border = '1px solid rgba(248,113,113,0.2)';
          } else if (p.value === 'Stable Holding') {
            color = '#3b82f6';
            bg = 'rgba(59,130,246,0.1)';
            border = '1px solid rgba(59,130,246,0.2)';
          } else if (p.value === 'Exited') {
            color = '#ef4444';
            bg = 'rgba(239,68,68,0.1)';
            border = '1px solid rgba(239,68,68,0.2)';
          } else if (p.value === 'Mixed Fund View') {
            color = '#a855f7';
            bg = 'rgba(168,85,247,0.1)';
            border = '1px solid rgba(168,85,247,0.2)';
          }

          return (
            <Chip 
              label={p.value} 
              size="small" 
              sx={{ color, bgcolor: bg, border, fontWeight: 700, fontSize: 10 }} 
            />
          );
        }
      },
      // 2. Mutual Funds Scheme Source (2nd position)
      {
        field: 'mutual_fund',
        headerName: 'Mutual Funds',
        flex: 1.2,
        minWidth: 120,
        cellRenderer: (p: any) => {
          const rawName = p.value || (p.data?.fund_code ? FUND_CODE_TO_NAME[p.data.fund_code] : '');
          const initialWord = parseFundInitialWord(rawName);
          if (!initialWord) return '—';
          return (
            <Chip
              label={initialWord}
              size="small"
              sx={{
                bgcolor: 'rgba(139,92,246,0.15)',
                color: '#a78bfa',
                fontWeight: 700,
                fontSize: 11,
                border: '1px solid rgba(139,92,246,0.3)'
              }}
            />
          );
        }
      },
      // 3. Symbol (3rd position)
      {
        field: 'symbol',
        headerName: 'Symbol',
        flex: 1.5,
        minWidth: 140,
        cellRenderer: (p: any) => {
          if (!p.data) return '';
          const displayText = p.value || p.data.stock_name;
          const tooltipTitle = p.value ? p.data.stock_name : '';
          return (
            <MuiTooltip title={tooltipTitle} arrow>
              <span 
                style={{ cursor: 'pointer', color: '#2962ff', fontWeight: 600 }}
                onClick={() => setSelectedStock(p.data)}
              >
                {displayText}
              </span>
            </MuiTooltip>
          );
        }
      }
    ];

    // Append dynamic month columns chronologically
    months.forEach((m: string) => {
      colList.push({
        headerName: m,
        headerClass: 'grid-header-right',
        flex: 1,
        minWidth: 90,
        valueGetter: (p: any) => {
          if (!p.data) return 0;
          return p.data.month_values[m]?.value_crore ?? 0;
        },
        cellRenderer: (p: any) => {
          if (!p.value || p.value === 0) return <span style={{ display: 'block', textAlign: 'right', width: '100%', color: '#64748b' }}>—</span>;
          return (
            <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
              {Math.round(p.value)}
            </span>
          );
        }
      });
    });

    // 1M, 2M, 3M Change columns
    const changes = [
      { field: 'change_1m_crore', pctField: 'change_1m_pct', label: '1M Change' },
      { field: 'change_2m_crore', pctField: 'change_2m_pct', label: '2M Change' },
      { field: 'change_3m_crore', pctField: 'change_3m_pct', label: '3M Change' }
    ];

    changes.forEach(c => {
      colList.push({
        headerName: c.label,
        headerClass: 'grid-header-right',
        flex: 1.2,
        minWidth: 120,
        valueGetter: (p: any) => {
          if (!p.data) return { val: 0, pct: 0, status: '' };
          return {
            val: p.data[c.field],
            pct: p.data[c.pctField],
            status: p.data.status
          };
        },
        cellRenderer: (p: any) => {
          if (!p.value) return '—';
          const { val, pct, status } = p.value;

          if (c.label === '1M Change' && status === 'NEW') {
            return (
              <Chip 
                label="NEW" 
                size="small" 
                sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 800, fontSize: 10, height: 20 }} 
              />
            );
          }

          if (c.label === '1M Change' && status === 'EXITED') {
            return (
              <Chip 
                label="EXITED" 
                size="small" 
                sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 800, fontSize: 10, height: 20 }} 
              />
            );
          }

          if (val === 0) return <span style={{ display: 'block', textAlign: 'right', width: '100%', color: '#64748b' }}>0</span>;

          const color = val > 0 ? '#10b981' : '#ef4444';
          const arrow = val > 0 ? '▲' : '▼';
          return (
            <span style={{ color, fontWeight: 600, display: 'block', textAlign: 'right', width: '100%' }}>
              {arrow} {Math.round(Math.abs(val))} ({pct >= 0 ? '+' : ''}{Math.round(pct)}%)
            </span>
          );
        }
      });
    });

    // 4. Target Action Column (interactive "Add to" button)
    colList.push({
      field: 'target',
      headerName: 'Target',
      flex: 1,
      minWidth: 100,
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => {
        if (!p.data) return null;
        const scrip = p.data.symbol || p.data.stock_name;
        return (
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setTargetModalScript(scrip);
              setTargetModalOpen(true);
            }}
            sx={{
              borderColor: '#2962ff',
              color: '#2962ff',
              fontSize: 11,
              fontWeight: 700,
              py: 0.2,
              px: 1.2,
              textTransform: 'none',
              borderRadius: 1.5,
              '&:hover': {
                bgcolor: 'rgba(41,98,255,0.1)',
                borderColor: '#2962ff'
              }
            }}
          >
            Add to
          </Button>
        );
      }
    });

    return colList;
  }, [months, summary]);

  // Detail drawer chart data
  const drawerChart1Data = useMemo(() => {
    if (!selectedStock) return [];
    return months.map(m => {
      const mv = selectedStock.month_values[m];
      return {
        month: m,
        value: mv ? mv.value_crore : 0
      };
    });
  }, [selectedStock, months]);

  const drawerChart2Data = useMemo(() => {
    if (!selectedStock) return [];
    return months.map((m, idx) => {
      const current = selectedStock.month_values[m]?.value_crore ?? 0;
      const prev = idx > 0 ? (selectedStock.month_values[months[idx - 1]]?.value_crore ?? 0) : 0;
      return {
        month: m,
        change: idx > 0 ? current - prev : 0
      };
    }).slice(1); // Exclude the first month as there is no previous month
  }, [selectedStock, months]);

  const drawerChart3Data = useMemo(() => {
    if (!selectedStock || stockHistory.length === 0) return [];
    
    return months.map(m => {
      const dataPoint: any = { month: m };
      FUND_CODES.forEach(code => {
        // Find record in stockHistory matching month m and fund_code code
        const rec = stockHistory.find(h => h.month === m && h.fund_code === code);
        dataPoint[code] = rec ? rec.value_crore : 0;
      });
      return dataPoint;
    });
  }, [selectedStock, stockHistory, months]);

  // Stock-wise fund action detail table inside the drawer
  const fundComparisonTable = useMemo(() => {
    if (!selectedStock || stockHistory.length === 0) return [];

    return FUND_CODES.map(code => {
      // Find history records for this fund code
      const fundRecs = stockHistory.filter(h => h.fund_code === code);
      // Sort them by month index
      const sortedRecs = months.map(m => fundRecs.find(h => h.month === m)).filter(Boolean) as any[];

      const latestVal = sortedRecs.length > 0 && sortedRecs[sortedRecs.length - 1].month === latestMonth 
        ? sortedRecs[sortedRecs.length - 1].value_crore 
        : 0;

      const prevVal = sortedRecs.length > 1 && sortedRecs[sortedRecs.length - 2].month === months[months.length - 2]
        ? sortedRecs[sortedRecs.length - 2].value_crore
        : 0;

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
        quantity: sortedRecs.length > 0 ? sortedRecs[sortedRecs.length - 1].quantity : 0,
        pctNav: sortedRecs.length > 0 ? sortedRecs[sortedRecs.length - 1].pct_nav : 0,
        direction,
        isHolding: latestVal > 0
      };
    });
  }, [selectedStock, stockHistory, months, latestMonth]);

  if (loading && !summary) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 450 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="fade-in">
      {/* Header and Selectors */}
      <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Mutual Funds Analytics</Typography>
          <Typography variant="body2" color="text.secondary">
            Flexible Decision Support & Trend Analysis based on latest month ({latestMonth})
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, minWidth: 420 }}>
          <FormControl size="small" sx={{ width: 220 }}>
            <InputLabel id="fund-select-label">Mutual Fund</InputLabel>
            <Select
              labelId="fund-select-label"
              value={selectedFund}
              label="Mutual Fund"
              onChange={(e) => {
                setSelectedFund(e.target.value);
                setSelectedFilter('ALL'); // Reset filter
              }}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="ALL">All Mutual Funds</MenuItem>
              {summary?.available_funds?.map((f: any) => (
                <MenuItem key={f.code} value={f.code}>
                  {FUND_CODE_TO_NAME[f.code] || f.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ width: 260 }}>
            <InputLabel id="filter-select-label">Analysis Perspective</InputLabel>
            <Select
              labelId="filter-select-label"
              value={selectedFilter}
              label="Analysis Perspective"
              onChange={(e) => setSelectedFilter(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              {FILTER_CATEGORIES.map(cat => {
                // Hide common-holdings filters if single fund is selected
                const isCommonFilter = cat.value.startsWith('COMMON') || cat.value === 'DIVERGENT';
                if (selectedFund !== 'ALL' && isCommonFilter) return null;
                return (
                  <MenuItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Stocks Held', val: kpis.stocksHeld, color: '#2962ff' },
          { label: 'Holding Value (Crore)', val: `₹${kpis.totalVal.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`, color: '#8b5cf6' },
          { label: 'New Added (Latest)', val: kpis.newEntries, color: '#10b981' },
          { label: 'Increased (Latest)', val: kpis.increased, color: '#047857' },
          { label: 'Decreased (Latest)', val: kpis.decreased, color: '#f87171' },
          { label: 'Exited (Latest)', val: kpis.exits, color: '#ef4444' }
        ].map(c => (
          <Grid size={{ xs: 6, sm: 4, md: 2 }} key={c.label}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 9 }}>
                  {c.label}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: c.color, mt: 0.5 }}>
                  {c.val}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}

        {/* Additional KPIs for All Mutual Funds view */}
        {selectedFund === 'ALL' && (
          <>
            {[
              { label: 'Held by 2+ Funds', val: kpis.held2Plus, color: '#a855f7' },
              { label: 'Held by 3+ Funds', val: kpis.held3Plus, color: '#ec4899' },
              { label: 'Held by All 4 Funds', val: kpis.heldAll, color: '#eab308' },
              { label: 'Accumulated (2+ Funds)', val: kpis.accumulatedMultiple, color: '#06b6d4' }
            ].map(c => (
              <Grid size={{ xs: 6, sm: 3, md: 3 }} key={c.label}>
                <Card sx={{ background: 'rgba(22,24,36,0.5)', border: '1px solid rgba(42,46,67,0.5)', borderRadius: 2 }}>
                  <CardContent sx={{ p: 1.5, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      {c.label}
                    </Typography>
                    <Chip 
                      label={c.val} 
                      size="small" 
                      sx={{ bgcolor: `${c.color}22`, color: c.color, fontWeight: 800 }} 
                    />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </>
        )}
      </Grid>

      {/* Search and Table Content */}
      <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {selectedFilter === 'ALL' ? 'Mutual Fund Holdings' : FILTER_CATEGORIES.find(f => f.value === selectedFilter)?.label}
          </Typography>
          <TextField
            size="small"
            placeholder="Search stock, symbol, or industry..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            slotProps={{
              input: {
                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
              }
            }}
            sx={{ width: 300, '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
          />
        </Box>

        {/* AG Grid Table */}
        <div className="ag-theme-alpine-dark" style={{ height: 500, width: '100%' }}>
          <AgGridReact
            theme="legacy"
            rowData={filteredRows}
            columnDefs={columnDefs as any}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 20, 50]}
            suppressScrollOnNewData={true}
            animateRows={true}
          />
        </div>
      </Card>

      {/* Stock Detail Drawer */}
      <Drawer
        anchor="right"
        open={Boolean(selectedStock)}
        onClose={() => setSelectedStock(null)}
        slotProps={{
          paper: {
            sx: { width: { xs: '100%', sm: 600 }, bgcolor: '#0c0d14', borderLeft: '1px solid #2a2e43', p: 3 }
          }
        }}
      >
        {selectedStock && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Drawer Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>{selectedStock.stock_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  ISIN: {selectedStock.isin} | Ticker: {selectedStock.symbol || 'N/A'} | Industry: {selectedStock.industry}
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
                      <Typography variant="caption" color="text.secondary">PORTFOLIO SIGNAL</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {selectedStock.portfolio_signal}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Typography variant="caption" color="text.secondary">5-MONTH TREND</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {selectedStock.trend_5m || 'N/A'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Fund Comparison Table */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Mutual Fund Comparison</Typography>
              {historyLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
              ) : (
                <Table size="small" sx={{ mb: 3, border: '1px solid #2a2e43', borderRadius: 2 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'background.paper' }}>
                      <TableCell sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>Mutual Fund Name</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>Shares Qty</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>Value (Crore)</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>% to NAV</TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 600, py: 1 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fundComparisonTable.map(row => (
                      <TableRow key={row.code} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                        <TableCell sx={{ fontWeight: 500 }}>{row.fullName}</TableCell>
                        <TableCell align="right">{row.isHolding ? row.quantity.toLocaleString('en-IN') : '—'}</TableCell>
                        <TableCell align="right">{row.isHolding ? `₹${row.latestValue.toFixed(2)} Cr` : '—'}</TableCell>
                        <TableCell align="right">{row.isHolding ? `${row.pctNav.toFixed(2)}%` : '—'}</TableCell>
                        <TableCell align="center">{row.direction}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Chart 1: Holding Value Over Time */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Month-Wise Holding Value (₹ Crore)</Typography>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={drawerChart1Data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <ChartTooltip 
                    formatter={(v: any) => [`₹${Number(v).toFixed(2)} Cr`, 'Value']} 
                    contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                  />
                  <Bar dataKey="value" fill="#2962ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <Box sx={{ mb: 3 }} />

              {/* Chart 2: MoM Change Value */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Month-on-Month Holding Change (₹ Crore)</Typography>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={drawerChart2Data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <ChartTooltip 
                    formatter={(v: any) => [`${v >= 0 ? '+' : ''}₹${Number(v).toFixed(2)} Cr`, 'Change']} 
                    contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                  />
                  <Bar dataKey="change" fill="#10b981" radius={[4, 4, 0, 0]}>
                    {drawerChart2Data.map((d, i) => (
                      <Cell key={i} fill={d.change >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Chart 3: Fund Breakdown Over Time (Grouped/Stacked) */}
              {selectedFund === 'ALL' && stockHistory.length > 0 && (
                <>
                  <Box sx={{ mb: 3 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Mutual Fund Stacked Contribution (₹ Crore)</Typography>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={drawerChart3Data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                      <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <ChartTooltip 
                        formatter={(v: any) => [`₹${Number(v).toFixed(2)} Cr`, '']}
                        contentStyle={{ background: '#161824', border: '1px solid #2a2e43', borderRadius: 8 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="H" name="HDFC Flexi Cap" fill="#2962ff" stackId="a" />
                      <Bar dataKey="P" name="Parag Parikh" fill="#10b981" stackId="a" />
                      <Bar dataKey="Q" name="Quant" fill="#f59e0b" stackId="a" />
                      <Bar dataKey="J" name="JM Flexicap" fill="#8b5cf6" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </Box>
      </Drawer>

      {/* Add Target Modal */}
      <AddTargetModal
        open={targetModalOpen}
        onClose={() => setTargetModalOpen(false)}
        initialScript={targetModalScript}
        initialCategory="Mutual Funds"
        isLockedScript={true}
        isLockedCategory={true}
        onSuccess={loadData}
      />
    </Box>
  );
};

export default MutualFunds;
