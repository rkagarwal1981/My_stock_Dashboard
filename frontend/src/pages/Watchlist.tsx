import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAppSelector } from '../store';
import {
  Box, Typography, Card, CardContent, Grid, Button,
  CircularProgress, Chip, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, Tooltip, Checkbox, Slider, Tabs, Tab, TextField,
  Radio, RadioGroup, FormControlLabel, FormControl, FormLabel,
  TableSortLabel, Menu, MenuItem, Dialog, DialogTitle, DialogContent, Popover
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import StarIcon from '@mui/icons-material/Star';
import FilterListIcon from '@mui/icons-material/FilterList';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloseIcon from '@mui/icons-material/Close';

interface WatchlistProps {
  onViewStock: (scrip: string) => void;
  showToast?: (message: string, severity: 'success' | 'error' | 'info') => void;
}

type SortDirection = 'asc' | 'desc';
type ActionFilterValue = 'all' | 'checked' | 'unchecked';

interface SortState {
  field: string;
  dir: SortDirection;
}

interface ColumnDef {
  label: string;
  field: string;
  type?: 'string' | 'number' | 'date' | 'boolean';
  isHighlight?: boolean;
  isAction?: boolean;
  minWidth?: number;
  width?: string | number;
}

const SECTION1_COLUMNS: ColumnDef[] = [
  { label: 'Broker', field: 'broker', type: 'string' },
  { label: 'Mutual Funds', field: 'mf_badge', type: 'string' },
  { label: 'Stock Name', field: 'script', type: 'string', minWidth: 260, width: '20%' },
  { label: 'Total Market Value', field: 'total_market_value', type: 'number' },
  { label: 'Lot Value %age', field: 'lot_value_pct', type: 'number' },
  { label: 'Target Lot Buying Price', field: 'buying_price', type: 'number' },
  { label: 'LTP chg %', field: 'change_in_ltp_pct', type: 'number' },
  { label: 'LTP', field: 'ltp', type: 'number' },
  { label: '%age Gain', field: 'gain_pct', type: 'number', isHighlight: true },
  { label: 'Remaining Lot Qty', field: 'quantity', type: 'number' },
  { label: 'Remaining Lot Value', field: 'value', type: 'number' },
  { label: 'Potential Profit (for this lot only)', field: 'potential_profit', type: 'number' },
  { label: 'Action (24h)', field: 'action_checked', type: 'boolean', isAction: true },
  { label: 'Options', field: 'tag_type', type: 'string' },
  { label: 'Comments', field: 'comment', type: 'string', minWidth: 210 }
];

const SECTION2_COLUMNS: ColumnDef[] = [
  { label: 'Script', field: 'script', type: 'string' },
  { label: 'Broker', field: 'broker', type: 'string' },
  { label: 'Qty', field: 'quantity', type: 'number' },
  { label: 'Avg Price', field: 'avg_price', type: 'number' },
  { label: 'LTP', field: 'ltp', type: 'number' },
  { label: 'LTP Chg %', field: 'change_in_ltp_pct', type: 'number', isHighlight: true },
  { label: 'P&L %', field: 'pnl_pct', type: 'number' },
  { label: 'Current Value', field: 'current_value', type: 'number' },
  { label: 'Dip %age', field: 'dip_pct', type: 'number' },
  { label: 'Date', field: 'latest_tx_date', type: 'date' },
  { label: '# of Days', field: 'latest_tx_days', type: 'number' },
  { label: 'Last Tx Type', field: 'latest_tx_type', type: 'string' },
  { label: 'Action (24h)', field: 'action_checked', type: 'boolean', isAction: true }
];

const SECTION3_COLUMNS: ColumnDef[] = [
  { label: 'Script', field: 'script', type: 'string' },
  { label: 'Broker', field: 'broker', type: 'string' },
  { label: 'Qty', field: 'quantity', type: 'number' },
  { label: 'Avg Price', field: 'avg_price', type: 'number' },
  { label: 'LTP', field: 'ltp', type: 'number' },
  { label: 'LTP Chg %', field: 'change_in_ltp_pct', type: 'number' },
  { label: 'P&L %', field: 'pnl_pct', type: 'number' },
  { label: 'Current Value', field: 'current_value', type: 'number' },
  { label: 'Dip %age', field: 'dip_pct', type: 'number', isHighlight: true },
  { label: 'Date', field: 'latest_tx_date', type: 'date' },
  { label: '# of Days', field: 'latest_tx_days', type: 'number' },
  { label: 'Last Tx Type', field: 'latest_tx_type', type: 'string' },
  { label: 'Action (24h)', field: 'action_checked', type: 'boolean', isAction: true }
];

const SECTION4_COLUMNS: ColumnDef[] = [
  { label: 'Stock Name', field: 'script', type: 'string' },
  { label: 'Broker', field: 'broker', type: 'string' },
  { label: 'Exit Price (Sell)', field: 'exit_price', type: 'number' },
  { label: 'Exit Date', field: 'exit_date', type: 'date' },
  { label: 'Days Since Exit', field: 'days_since_exit', type: 'number' },
  { label: 'LTP Now', field: 'ltp', type: 'number' },
  { label: 'Today Chg %', field: 'change_in_ltp_pct', type: 'number' },
  { label: 'Drop from Exit %', field: 'drop_from_exit_pct', type: 'number', isHighlight: true },
  { label: 'Action (24h)', field: 'action_checked', type: 'boolean', isAction: true }
];

const Watchlist: React.FC<WatchlistProps> = ({ onViewStock, showToast }) => {
  const allHoldings = useAppSelector((state) => state.portfolio.holdings);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [popoverData, setPopoverData] = useState<any[]>([]);
  const [popoverStock, setPopoverStock] = useState<string>('');
  const [activeTab, setActiveTab] = useState(0);
  const [section1Data, setSection1Data] = useState<any[]>([]);
  const [section2Data, setSection2Data] = useState<{ top_movers: any[]; bottom_movers: any[] }>({
    top_movers: [],
    bottom_movers: []
  });
  const [section3Data, setSection3Data] = useState<{ top_movers: any[]; bottom_movers: any[] }>({
    top_movers: [],
    bottom_movers: []
  });
  const [section4Data, setSection4Data] = useState<any[]>([]);
  const [section4N, setSection4N] = useState<number>(10);
  const [N, setN] = useState<number>(10);
  const [section3TxTypeFilter, setSection3TxTypeFilter] = useState<'Buy' | 'Sell'>('Buy');
  const [loading, setLoading] = useState(true);
  const [copiedAlert, setCopiedAlert] = useState(false);
  const [exportingSection1, setExportingSection1] = useState(false);
  const commentSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Screener.in Snapshot Modal & Batch Pre-fetch state
  const [screenerModalOpen, setScreenerModalOpen] = useState(false);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [screenerData, setScreenerData] = useState<{
    symbol: string;
    screener_url: string;
    chart_url: string | null;
    peers_url: string | null;
    captured_at: string | null;
    age_days: number | null;
    status?: string;
  } | null>(null);
  const [batchCapturing, setBatchCapturing] = useState(false);

  // Sorting state per table
  const [sortConfig, setSortConfig] = useState<Record<string, SortState>>({
    section1: { field: 'gain_pct', dir: 'desc' },
    section2_top: { field: 'change_in_ltp_pct', dir: 'desc' },
    section2_bottom: { field: 'change_in_ltp_pct', dir: 'asc' },
    section3_top: { field: 'dip_pct', dir: 'desc' },
    section3_bottom: { field: 'dip_pct', dir: 'asc' },
    section4: { field: 'drop_from_exit_pct', dir: 'asc' }
  });

  // Action (24h) filter state per table
  const [actionFilter, setActionFilter] = useState<Record<string, ActionFilterValue>>({
    section1: 'all',
    section2_top: 'all',
    section2_bottom: 'all',
    section3_top: 'all',
    section3_bottom: 'all',
    section4: 'all'
  });

  // Filter menu anchor state
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<{ el: HTMLElement | null; tableId: string | null }>({
    el: null,
    tableId: null
  });

  const handleSortClick = (tableId: string, col: ColumnDef) => {
    setSortConfig(prev => {
      const current = prev[tableId];
      if (current && current.field === col.field) {
        return {
          ...prev,
          [tableId]: { field: col.field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        };
      }
      const defaultDir: SortDirection = col.type === 'string' ? 'asc' : 'desc';
      return {
        ...prev,
        [tableId]: { field: col.field, dir: defaultDir }
      };
    });
  };

  const applyFilterAndSort = (rows: any[], tableId: string, columns: ColumnDef[]) => {
    const filterVal = actionFilter[tableId] || 'all';
    const filtered = rows.filter(r => {
      if (filterVal === 'checked') return Boolean(r.action_checked);
      if (filterVal === 'unchecked') return !r.action_checked;
      return true;
    });

    const sort = sortConfig[tableId];
    if (!sort) return filtered;

    const colDef = columns.find(c => c.field === sort.field);
    const colType = colDef?.type || 'number';
    const mult = sort.dir === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const va = a[sort.field];
      const vb = b[sort.field];

      // Always push null / undefined to the bottom
      const aNull = va === null || va === undefined || va === '';
      const bNull = vb === null || vb === undefined || vb === '';
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;

      if (colType === 'date') {
        const ta = new Date(va).getTime();
        const tb = new Date(vb).getTime();
        if (isNaN(ta) && isNaN(tb)) return String(va).localeCompare(String(vb)) * mult;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return (ta - tb) * mult;
      }

      if (colType === 'string') {
        return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * mult;
      }

      if (colType === 'boolean') {
        return ((va ? 1 : 0) - (vb ? 1 : 0)) * mult;
      }

      return (Number(va) - Number(vb)) * mult;
    });
  };

  const renderTableHeaderCell = (tableId: string, col: ColumnDef, fontSize: number = 11, py: number = 1.5) => {
    const currentSort = sortConfig[tableId];
    const isSorted = currentSort?.field === col.field;
    const sortDir = isSorted ? currentSort.dir : 'asc';
    const currentActionFilter = actionFilter[tableId] || 'all';
    const isFilterActive = col.isAction && currentActionFilter !== 'all';

    return (
      <TableCell
        key={col.field}
        sortDirection={isSorted ? sortDir : false}
        sx={{
          color: col.isHighlight ? '#FFD700' : 'text.secondary',
          fontWeight: 700,
          py,
          fontSize,
          borderBottom: '1px solid #2a2e43',
          whiteSpace: 'nowrap',
          ...(col.minWidth != null && { minWidth: col.minWidth }),
          ...(col.width != null && { width: col.width }),
          ...(col.isHighlight && {
            borderLeft: '2px solid rgba(255,215,0,0.3)'
          })
        }}
      >
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <TableSortLabel
            active={isSorted}
            direction={isSorted ? sortDir : 'asc'}
            onClick={() => handleSortClick(tableId, col)}
            sx={{
              color: col.isHighlight ? '#FFD700 !important' : 'inherit',
              '&.Mui-active': {
                color: col.isHighlight ? '#FFD700 !important' : '#e2e8f0 !important',
                '& .MuiTableSortLabel-icon': {
                  color: col.isHighlight ? '#FFD700 !important' : '#2962ff !important'
                }
              }
            }}
          >
            {col.isHighlight ? (
              <>
                <span style={{ fontSize: '130%', lineHeight: 1, marginRight: 3 }}>💡</span>
                {col.label}
              </>
            ) : (
              col.label
            )}
          </TableSortLabel>

          {col.isAction && (
            <Tooltip
              title={
                currentActionFilter === 'all'
                  ? 'Filter Action (24h)'
                  : `Filtered: ${currentActionFilter === 'checked' ? 'Checked (✓)' : 'Unchecked (☐)'}`
              }
            >
              <IconButton
                size="small"
                onClick={e => {
                  e.stopPropagation();
                  setFilterMenuAnchor({ el: e.currentTarget, tableId });
                }}
                sx={{
                  p: 0.25,
                  color: isFilterActive ? '#FFD700' : 'text.secondary',
                  bgcolor: isFilterActive ? 'rgba(255,215,0,0.12)' : 'transparent',
                  '&:hover': { color: '#2962ff' }
                }}
              >
                <FilterListIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </TableCell>
    );
  };

  const fetchSection1 = async () => {
    try {
      const res = await axios.get('/api/watchlist/section1');
      setSection1Data(res.data || []);
    } catch (e) {
      console.error('Failed to fetch section1:', e);
    }
  };

  const fetchSection2 = async (num: number) => {
    try {
      const res = await axios.get(`/api/watchlist/section2?N=${num}`);
      setSection2Data(res.data || { top_movers: [], bottom_movers: [] });
    } catch (e) {
      console.error('Failed to fetch section2:', e);
    }
  };

  const fetchSection3 = async (num: number, txType: string = section3TxTypeFilter) => {
    try {
      const res = await axios.get(`/api/watchlist/section3?N=${num}&tx_type=${txType}`);
      setSection3Data(res.data || { top_movers: [], bottom_movers: [] });
    } catch (e) {
      console.error('Failed to fetch section3:', e);
    }
  };

  const fetchSection4 = async (num: number = section4N) => {
    try {
      const res = await axios.get(`/api/watchlist/section4?N=${num}`);
      setSection4Data(res.data?.reentry_candidates || []);
    } catch (e) {
      console.error('Failed to fetch section4:', e);
    }
  };

  const loadAllData = useCallback(async (currentN: number, txType: string = section3TxTypeFilter) => {
    setLoading(true);
    await Promise.all([
      fetchSection1(),
      fetchSection2(currentN),
      fetchSection3(currentN, txType),
      fetchSection4(section4N)
    ]);
    setLoading(false);
  }, [section3TxTypeFilter, section4N]);

  useEffect(() => {
    loadAllData(N, section3TxTypeFilter);
  }, [loadAllData]);

  const handleActionToggle = async (script: string, section: string, currentChecked: boolean) => {
    try {
      const newChecked = !currentChecked;
      await axios.post('/api/watchlist/action', {
        script,
        section,
        checked: newChecked
      });

      // Update state locally
      if (section === 'section1') {
        setSection1Data(prev =>
          prev.map(item =>
            item.script === script ? { ...item, action_checked: newChecked, action_type: newChecked ? 'MANUAL' : null } : item
          )
        );
      } else if (section === 'section2') {
        setSection2Data(prev => ({
          top_movers: prev.top_movers.map(item =>
            item.script === script ? { ...item, action_checked: newChecked, action_type: newChecked ? 'MANUAL' : null } : item
          ),
          bottom_movers: prev.bottom_movers.map(item =>
            item.script === script ? { ...item, action_checked: newChecked, action_type: newChecked ? 'MANUAL' : null } : item
          )
        }));
      } else if (section === 'section3') {
        setSection3Data(prev => ({
          top_movers: prev.top_movers.map(item =>
            item.script === script ? { ...item, action_checked: newChecked, action_type: newChecked ? 'MANUAL' : null } : item
          ),
          bottom_movers: prev.bottom_movers.map(item =>
            item.script === script ? { ...item, action_checked: newChecked, action_type: newChecked ? 'MANUAL' : null } : item
          )
        }));
      } else if (section === 'section4') {
        setSection4Data(prev =>
          prev.map(item =>
            item.script === script ? { ...item, action_checked: newChecked, action_type: newChecked ? 'MANUAL' : null } : item
          )
        );
      }

      if (showToast) {
        showToast(
          `${newChecked ? 'Checked' : 'Unchecked'} action for ${script}. Resets in 24 hours.`,
          'success'
        );
      }
    } catch (e) {
      console.error('Failed to toggle action:', e);
      if (showToast) {
        showToast('Failed to toggle action state.', 'error');
      }
    }
  };

  const handleRemoveManual = async (script: string) => {
    try {
      await axios.delete(`/api/watchlist/manual/${encodeURIComponent(script)}`);
      if (showToast) {
        showToast(`Removed ${script} from watchlist.`, 'info');
      }
      fetchSection1();
    } catch (e) {
      console.error('Failed to remove manual script:', e);
      if (showToast) {
        showToast('Failed to remove script.', 'error');
      }
    }
  };

  const saveCommentToBackend = async (script: string, commentText: string) => {
    try {
      await axios.put('/api/watchlist/comment', {
        script,
        comment: commentText
      });
    } catch (e) {
      console.error('Failed to save watchlist comment:', e);
      if (showToast) {
        showToast('Failed to save comment.', 'error');
      }
    }
  };

  const handleCommentChange = (script: string, newComment: string) => {
    setSection1Data(prev =>
      prev.map(item => (item.script === script ? { ...item, comment: newComment } : item))
    );
    if (commentSaveTimers.current[script]) {
      clearTimeout(commentSaveTimers.current[script]);
    }
    commentSaveTimers.current[script] = setTimeout(() => {
      saveCommentToBackend(script, newComment);
    }, 800);
  };

  const handleCommentBlur = (script: string, commentText: string) => {
    if (commentSaveTimers.current[script]) {
      clearTimeout(commentSaveTimers.current[script]);
      delete commentSaveTimers.current[script];
    }
    saveCommentToBackend(script, commentText);
  };

  const fmt = (v: number | null) =>
    v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';

  const holdingsMfMap = useMemo(() => {
    const map: Record<string, { mf_badge: string | null; mutual_funds: any[] }> = {};
    for (const h of allHoldings || []) {
      const raw = String(h.script || '').trim().toUpperCase();
      const base = raw.endsWith('-EQ') ? raw.slice(0, -3).trim() : raw;
      if (h.mutual_funds && h.mutual_funds.length > 0) {
        map[raw] = { mf_badge: h.mf_badge || null, mutual_funds: h.mutual_funds };
        map[base] = { mf_badge: h.mf_badge || null, mutual_funds: h.mutual_funds };
      }
    }
    return map;
  }, [allHoldings]);

  const enrichedSection1Data = useMemo(() => {
    return section1Data.map(row => {
      if (row.mutual_funds && row.mutual_funds.length > 0) return row;
      const raw = String(row.script || '').split('|')[0].trim().toUpperCase();
      const base = raw.endsWith('-EQ') ? raw.slice(0, -3).trim() : raw;
      const mfInfo = holdingsMfMap[raw] || holdingsMfMap[base];
      if (mfInfo) {
        return {
          ...row,
          mf_badge: row.mf_badge || mfInfo.mf_badge,
          mutual_funds: mfInfo.mutual_funds
        };
      }
      return row;
    });
  }, [section1Data, holdingsMfMap]);

  // Filtered & sorted rows for each table
  const displaySection1 = applyFilterAndSort(enrichedSection1Data, 'section1', SECTION1_COLUMNS);
  const displaySection2Top = applyFilterAndSort(section2Data.top_movers, 'section2_top', SECTION2_COLUMNS);
  const displaySection2Bottom = applyFilterAndSort(section2Data.bottom_movers, 'section2_bottom', SECTION2_COLUMNS);
  const displaySection3Top = applyFilterAndSort(section3Data.top_movers, 'section3_top', SECTION3_COLUMNS);
  const displaySection3Bottom = applyFilterAndSort(section3Data.bottom_movers, 'section3_bottom', SECTION3_COLUMNS);
  const displaySection4 = applyFilterAndSort(section4Data, 'section4', SECTION4_COLUMNS);

  // TradingView Watchlist string for Section 1 (strips -EQ and any "| Partially Settled" suffix)
  const section1TradingViewString = useMemo(() => {
    if (!displaySection1 || displaySection1.length === 0) return '';
    const rawSymbols = displaySection1
      .map((r: any) => {
        let sym = String(r.script || '').split('|')[0].trim();
        if (sym.toUpperCase().endsWith('-EQ')) {
          sym = sym.slice(0, -3).trim();
        }
        return sym.toUpperCase();
      })
      .filter(Boolean);
    const uniqueSymbols = Array.from(new Set(rawSymbols));
    return uniqueSymbols.join(', ');
  }, [displaySection1]);

  const handleCopySection1Watchlist = () => {
    if (!section1TradingViewString) return;
    navigator.clipboard.writeText(section1TradingViewString);
    setCopiedAlert(true);
    setTimeout(() => setCopiedAlert(false), 2500);
  };

  const handleExportSection1Excel = async () => {
    try {
      setExportingSection1(true);
      const response = await axios.post(
        '/api/watchlist/section1/export',
        { rows: displaySection1 },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Watchlist_LIFO_Profit_Booker.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to export Section 1 Excel:', err);
      if (showToast) {
        showToast('Failed to export Excel.', 'error');
      }
    } finally {
      setExportingSection1(false);
    }
  };

  const cleanScreenerSymbol = (rawScript: string) => {
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
    window.open(`https://www.screener.in/company/${encodeURIComponent(sym)}/`, '_blank', 'noopener,noreferrer');
  };

  const handleOpenScreenerSnapshot = async (rawScript: string, force: boolean = false, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const sym = cleanScreenerSymbol(rawScript);
    if (!sym) return;

    setScreenerModalOpen(true);
    setScreenerLoading(true);
    setScreenerError(null);
    if (!force || !screenerData || screenerData.symbol !== sym) {
      setScreenerData({
        symbol: sym,
        screener_url: `https://www.screener.in/company/${sym}/`,
        chart_url: null,
        peers_url: null,
        captured_at: null,
        age_days: null
      });
    }

    try {
      const res = await axios.get(`/api/watchlist/screener/${encodeURIComponent(sym)}?force=${force}`);
      setScreenerData(res.data);
      if (force && showToast) {
        showToast(`Refreshed Screener.in snapshots for ${sym}.`, 'success');
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || `Failed to load Screener.in snapshot for ${sym}.`;
      setScreenerError(detail);
    } finally {
      setScreenerLoading(false);
    }
  };

  const handleBatchCaptureScreener = async () => {
    if (!displaySection1 || displaySection1.length === 0) return;
    const scripts = displaySection1.map(r => cleanScreenerSymbol(r.script)).filter(Boolean);
    try {
      setBatchCapturing(true);
      if (showToast) {
        showToast(`Checking/capturing Screener.in snapshots for ${scripts.length} stocks...`, 'info');
      }
      const res = await axios.post('/api/watchlist/screener/batch', {
        scripts,
        force: false
      });
      const { captured_count = 0, cached_count = 0 } = res.data || {};
      if (showToast) {
        showToast(
          `Screener snapshots ready: ${captured_count} newly captured, ${cached_count} already cached (valid 90d).`,
          'success'
        );
      }
    } catch (err) {
      console.error('Failed batch Screener capture:', err);
      if (showToast) {
        showToast('Failed to batch-capture Screener snapshots.', 'error');
      }
    } finally {
      setBatchCapturing(false);
    }
  };

  const renderScreenerActions = (rawScript: string) => {
    const sym = cleanScreenerSymbol(rawScript);
    if (!sym) return null;
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, ml: 0.5 }}>
        <Tooltip title={`View ${sym} Screener Snapshot (PE/EPS Chart & Peers — Cached 90d)`}>
          <IconButton
            size="small"
            onClick={e => handleOpenScreenerSnapshot(sym, false, e)}
            sx={{
              p: 0.35,
              color: '#38bdf8',
              bgcolor: 'rgba(56,189,248,0.1)',
              border: '1px solid rgba(56,189,248,0.25)',
              borderRadius: 1,
              '&:hover': { bgcolor: 'rgba(56,189,248,0.22)', color: '#7dd3fc' }
            }}
          >
            <CameraAltIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={`Open ${sym} on Screener.in in new tab`}>
          <IconButton
            size="small"
            onClick={e => handleOpenScreenerWeb(sym, e)}
            sx={{
              p: 0.35,
              color: '#a78bfa',
              bgcolor: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.25)',
              borderRadius: 1,
              '&:hover': { bgcolor: 'rgba(167,139,250,0.22)', color: '#c4b5fd' }
            }}
          >
            <OpenInNewIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  const renderMutualFundsCell = (row: any) => {
    const funds = row.mutual_funds || [];
    if (funds.length === 0) return <span style={{ color: '#64748b' }}>—</span>;

    const FUND_CODE_TO_OFFICIAL_NAME: Record<string, string> = {
      H: 'HDFC Flexi Cap Fund',
      P: 'Parag Parikh Flexi Cap Fund',
      Q: 'Quant Flexi Cap Fund',
      J: 'JM Flexicap Fund',
      HV: 'HDFC Value Fund',
      HS: 'HSBC Value Fund',
      IC: 'ICICI Value Fund'
    };

    const flexiFunds = funds.filter(
      (m: any) => m.mf_category === 'Flexicap' || ['H', 'P', 'Q', 'J'].includes(m.fund_code)
    );
    const valueFunds = funds.filter(
      (m: any) => m.mf_category === 'Value' || ['HV', 'HS', 'IC'].includes(m.fund_code)
    );

    const fCount = new Set(flexiFunds.map((m: any) => m.fund_code || m.fund_name)).size;
    const vCount = new Set(valueFunds.map((m: any) => m.fund_code || m.fund_name)).size;

    const parts: string[] = [];
    if (fCount > 0) parts.push(`F${fCount}`);
    if (vCount > 0) parts.push(`V${vCount}`);
    const badgeText = row.mf_badge || (parts.length > 0 ? parts.join('|') : '—');

    if (badgeText === '—' || parts.length === 0) {
      return <span style={{ color: '#64748b' }}>—</span>;
    }

    const tooltipContent = (
      <Box sx={{ p: 0.5, maxWidth: 300 }}>
        {fCount > 0 && (
          <Box sx={{ mb: vCount > 0 ? 1 : 0 }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#38bdf8' }}>
              Flexicap ({fCount}):
            </Typography>
            {flexiFunds.map((m: any) => (
              <Typography
                key={m.fund_code}
                variant="caption"
                sx={{ display: 'block', pl: 1, color: '#e2e8f0', fontSize: 11 }}
              >
                • {FUND_CODE_TO_OFFICIAL_NAME[m.fund_code] || m.fund_name} ({m.fund_code})
              </Typography>
            ))}
          </Box>
        )}
        {vCount > 0 && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#c084fc' }}>
              Value ({vCount}):
            </Typography>
            {valueFunds.map((m: any) => (
              <Typography
                key={m.fund_code}
                variant="caption"
                sx={{ display: 'block', pl: 1, color: '#e2e8f0', fontSize: 11 }}
              >
                • {FUND_CODE_TO_OFFICIAL_NAME[m.fund_code] || m.fund_name} ({m.fund_code})
              </Typography>
            ))}
          </Box>
        )}
      </Box>
    );

    return (
      <Tooltip title={tooltipContent} arrow>
        <span
          style={{
            cursor: 'pointer',
            color: '#a78bfa',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'rgba(167, 139, 250, 0.14)',
            border: '1px solid rgba(167, 139, 250, 0.3)',
            display: 'inline-block',
            textAlign: 'center',
            letterSpacing: '0.5px',
            fontSize: '12px'
          }}
          onClick={e => {
            e.stopPropagation();
            setPopoverAnchor(e.currentTarget);
            setPopoverData(funds);
            setPopoverStock(row.script);
          }}
        >
          {badgeText}
        </span>
      </Tooltip>
    );
  };

  // Computed Section 1 Aggregates (reflecting active filter)
  const totalPotentialProfit = displaySection1.reduce(
    (acc, curr) => acc + (curr.potential_profit || 0),
    0
  );
  const avgGain =
    displaySection1.length > 0
      ? displaySection1.reduce((acc, curr) => acc + (curr.gain_pct || 0), 0) / displaySection1.length
      : 0;

  return (
    <Box className="fade-in">
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <StarIcon sx={{ color: 'primary.main' }} /> Watchlist Control Centre
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Identify booking opportunities and track high-volatility moves.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {activeTab === 0 && (
            <>
              <Tooltip title="Pre-capture Screener.in PE/EPS & Peer Comparison screenshots for all Section 1 stocks not cached within the last 90 days">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={batchCapturing ? <CircularProgress size={14} color="inherit" /> : <CameraAltIcon />}
                    onClick={handleBatchCaptureScreener}
                    disabled={batchCapturing || displaySection1.length === 0}
                    sx={{
                      borderRadius: 2,
                      px: 2,
                      height: 38,
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      borderColor: 'rgba(56,189,248,0.45)',
                      color: '#38bdf8',
                      '&:hover': { borderColor: '#38bdf8', bgcolor: 'rgba(56,189,248,0.08)' }
                    }}
                  >
                    {batchCapturing ? 'Capturing Snapshots...' : 'Sync Screener Snapshots'}
                  </Button>
                </span>
              </Tooltip>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExportSection1Excel}
                disabled={exportingSection1 || displaySection1.length === 0}
                sx={{ borderRadius: 2, px: 2, height: 38, whiteSpace: 'nowrap', fontWeight: 600 }}
              >
                {exportingSection1 ? 'Exporting...' : 'Export Excel'}
              </Button>
            </>
          )}
          <IconButton
            onClick={() => loadAllData(N)}
            disabled={loading}
            sx={{ color: 'primary.main', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Action (24h) Filter Dropdown Menu */}
      <Menu
        anchorEl={filterMenuAnchor.el}
        open={Boolean(filterMenuAnchor.el)}
        onClose={() => setFilterMenuAnchor({ el: null, tableId: null })}
      >
        {[
          { val: 'all' as ActionFilterValue, label: 'All Rows' },
          { val: 'checked' as ActionFilterValue, label: 'Checked (✓ Action Taken)' },
          { val: 'unchecked' as ActionFilterValue, label: 'Unchecked (☐ Pending)' }
        ].map(opt => {
          const activeVal = filterMenuAnchor.tableId ? actionFilter[filterMenuAnchor.tableId] : 'all';
          return (
            <MenuItem
              key={opt.val}
              selected={activeVal === opt.val}
              onClick={() => {
                if (filterMenuAnchor.tableId) {
                  setActionFilter(prev => ({ ...prev, [filterMenuAnchor.tableId!]: opt.val }));
                }
                setFilterMenuAnchor({ el: null, tableId: null });
              }}
              sx={{ fontSize: 12, fontWeight: activeVal === opt.val ? 700 : 400 }}
            >
              {opt.label}
            </MenuItem>
          );
        })}
      </Menu>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, val) => setActiveTab(val)}
        sx={{ mb: 3, borderBottom: '1px solid #2a2e43' }}
      >
        <Tab label="Section 1: LIFO Profit Booker" sx={{ fontWeight: 600 }} />
        <Tab label="Section 2: Portfolio Movers" sx={{ fontWeight: 600 }} />
        <Tab label="Section 3: Portfolio Dips" sx={{ fontWeight: 600 }} />
        <Tab label="Section 4: Re-entry Opportunities" sx={{ fontWeight: 600 }} />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {activeTab === 0 && (
            <Box>
              {/* Aggregates row */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { label: 'Watchlist Candidates', val: displaySection1.length, color: '#2962ff' },
                  {
                    label: 'Total Potential Profit',
                    val: fmt(totalPotentialProfit),
                    color: '#10b981'
                  },
                  { label: 'Average Candidate Gain', val: `${avgGain.toFixed(2)}%`, color: '#f59e0b' }
                ].map(card => (
                  <Grid size={{ xs: 12, sm: 4 }} key={card.label}>
                    <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                        >
                          {card.label}
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: card.color }}>
                          {card.val}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {/* Data grid */}
              <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
                <CardContent sx={{ p: 0 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#161824' }}>
                        {SECTION1_COLUMNS.map(col => renderTableHeaderCell('section1', col, 11, 1.5))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {displaySection1.length > 0 ? (
                        displaySection1.map((row, i) => {
                          const isManual = row.tag_type === 'MANUAL';
                          const ltpChg = row.change_in_ltp_pct ?? 0;
                          return (
                            <TableRow key={row.script || i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12, whiteSpace: 'nowrap' }}>
                                <Chip
                                  label={row.broker || '—'}
                                  size="small"
                                  sx={{
                                    bgcolor: 'rgba(41,98,255,0.12)',
                                    color: '#93c5fd',
                                    fontWeight: 600,
                                    fontSize: 10,
                                    height: 20
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12, whiteSpace: 'nowrap' }}>
                                {renderMutualFundsCell(row)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  borderBottom: '1px solid #2a2e43',
                                  fontWeight: 700,
                                  minWidth: 280,
                                  width: '24%',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
                                  <span
                                    style={{ color: '#2962ff', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    onClick={() => onViewStock(row.script)}
                                  >
                                    {row.script && row.script.endsWith('-EQ')
                                      ? row.script.substring(0, row.script.length - 3)
                                      : row.script}
                                    {row.is_partial ? ' | Partially Settled' : ''}
                                  </span>
                                  {renderScreenerActions(row.script)}
                                  {isManual && (
                                    <Chip
                                      label="MANUAL"
                                      size="small"
                                      sx={{
                                        bgcolor: 'rgba(234,179,8,0.15)',
                                        color: '#eab308',
                                        fontWeight: 700,
                                        fontSize: 9,
                                        height: 18
                                      }}
                                    />
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12, fontWeight: 600 }}>
                                {row.total_market_value != null
                                  ? `₹${Number(row.total_market_value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                                  : '—'}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                                {row.lot_value_pct != null ? `${Number(row.lot_value_pct).toFixed(1)}%` : '—'}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12 }}>
                                {fmt(row.buying_price)}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                <Chip
                                  label={`${ltpChg >= 0 ? '+' : ''}${ltpChg.toFixed(2)}%`}
                                  size="small"
                                  sx={{
                                    bgcolor: ltpChg >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                    color: ltpChg >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: 800,
                                    fontSize: 10,
                                    height: 20
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12 }}>
                                {fmt(row.ltp)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  borderBottom: '1px solid #2a2e43',
                                  borderLeft: '2px solid rgba(255,215,0,0.3)',
                                  color: row.gain_pct >= 0 ? '#10b981' : '#ef4444',
                                  fontWeight: 700,
                                  fontSize: 12
                                }}
                              >
                                {row.gain_pct >= 0 ? '+' : ''}
                                {row.gain_pct.toFixed(2)}%
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12 }}>
                                {row.quantity}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12 }}>
                                {fmt(row.value)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  borderBottom: '1px solid #2a2e43',
                                  color: row.potential_profit >= 0 ? '#10b981' : '#ef4444',
                                  fontWeight: 700,
                                  fontSize: 12
                                }}
                              >
                                {row.potential_profit >= 0 ? '+' : ''}
                                {fmt(row.potential_profit)}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                <Tooltip title="Persists for 24h only">
                                  <Checkbox
                                    checked={row.action_checked}
                                    onChange={() =>
                                      handleActionToggle(row.script, 'section1', row.action_checked)
                                    }
                                    sx={{
                                      p: 0.5,
                                      color: '#2a2e43',
                                      '&.Mui-checked': {
                                        color: row.action_type === 'SELL' ? '#ef4444' : '#10b981'
                                      }
                                    }}
                                  />
                                </Tooltip>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                {isManual ? (
                                  <Tooltip title="Remove manual item">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => handleRemoveManual(row.script)}
                                      sx={{ p: 0.5 }}
                                    >
                                      <DeleteIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  <span style={{ color: '#64748b', fontSize: 11 }}>Auto</span>
                                )}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', minWidth: 210 }}>
                                <TextField
                                  size="small"
                                  fullWidth
                                  variant="standard"
                                  placeholder="Add comment..."
                                  value={row.comment || ''}
                                  onChange={e => handleCommentChange(row.script, e.target.value)}
                                  onBlur={e => handleCommentBlur(row.script, e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  slotProps={{
                                    input: {
                                      disableUnderline: true,
                                      sx: {
                                        fontSize: 12,
                                        color: '#e2e8f0',
                                        px: 1,
                                        py: 0.4,
                                        borderRadius: 1,
                                        bgcolor: 'rgba(15, 23, 42, 0.45)',
                                        border: '1px solid transparent',
                                        transition: 'border-color 0.2s, background-color 0.2s',
                                        '&:hover': {
                                          borderColor: '#2a2e43',
                                          bgcolor: 'rgba(15, 23, 42, 0.75)'
                                        },
                                        '&.Mui-focused': {
                                          borderColor: '#2962ff',
                                          bgcolor: 'rgba(15, 23, 42, 0.9)'
                                        }
                                      }
                                    }
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={14} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                            No matching profit booking candidates currently.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* TradingView Watchlist Extraction Tool (Section 1 only) */}
              <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, p: 3, mt: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    TradingView Watchlist String:
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {copiedAlert && (
                      <Chip
                        label="Copied to Clipboard!"
                        size="small"
                        sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700, fontSize: 12 }}
                      />
                    )}
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadIcon />}
                      onClick={handleExportSection1Excel}
                      disabled={exportingSection1 || displaySection1.length === 0}
                      sx={{ borderRadius: 2, px: 2, py: 0.7, whiteSpace: 'nowrap', textTransform: 'none', fontWeight: 600 }}
                    >
                      {exportingSection1 ? 'Exporting...' : 'Export Excel'}
                    </Button>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <TextField
                    fullWidth
                    size="small"
                    value={section1TradingViewString}
                    slotProps={{
                      input: {
                        readOnly: true,
                        sx: {
                          fontFamily: 'monospace',
                          fontSize: 13,
                          color: '#e2e8f0',
                          bgcolor: 'rgba(15, 23, 42, 0.6)'
                        }
                      }
                    }}
                    placeholder="No stocks visible in Section 1..."
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <Tooltip title="Copy string for TradingView watchlist import">
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleCopySection1Watchlist}
                      disabled={!section1TradingViewString}
                      startIcon={<ContentCopyIcon />}
                      sx={{
                        borderRadius: 2,
                        px: 2.5,
                        py: 1,
                        whiteSpace: 'nowrap',
                        textTransform: 'none',
                        fontWeight: 700
                      }}
                    >
                      {copiedAlert ? 'Copied!' : 'Copy'}
                    </Button>
                  </Tooltip>
                </Box>
              </Card>
            </Box>
          )}

          {activeTab === 1 && (
            <Box>
              {/* Controls bar */}
              <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, mb: 3 }}>
                <CardContent sx={{ p: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                  <Box sx={{ width: 300 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Mover Count (N):</span>
                      <span style={{ color: '#2962ff' }}>{N}</span>
                    </Typography>
                    <Slider
                      value={N}
                      onChange={(_, v) => setN(v as number)}
                      onChangeCommitted={(_, v) => {
                        fetchSection2(v as number);
                        fetchSection3(v as number);
                      }}
                      min={1}
                      max={15}
                      step={1}
                      marks
                      valueLabelDisplay="auto"
                    />
                  </Box>

                  <TextField
                    label="Mover Volume count"
                    type="number"
                    size="small"
                    value={N}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(15, parseInt(e.target.value) || 1));
                      setN(val);
                      fetchSection2(val);
                      fetchSection3(val);
                    }}
                    slotProps={{ htmlInput: { min: 1, max: 15 } }}
                    sx={{ width: 150 }}
                  />

                  <Typography variant="caption" color="text.secondary">
                    Displays top N positive gainers and bottom N negative losers daily.
                  </Typography>
                </CardContent>
              </Card>

              {/* Side-by-side or combined split views */}
              <Grid container spacing={3}>
                {/* Top Gainers (Positive Movers) */}
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, color: '#10b981' }}
                  >
                    <TrendingUpIcon /> Top {N} Positive Movers
                  </Typography>
                  <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
                    <CardContent sx={{ p: 0, overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#161824' }}>
                            {SECTION2_COLUMNS.map(col => renderTableHeaderCell('section2_top', col, 10, 1.2))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {displaySection2Top.length > 0 ? (
                            displaySection2Top.map((row, i) => (
                              <TableRow key={row.script || i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <span
                                      style={{ color: '#2962ff', cursor: 'pointer' }}
                                      onClick={() => onViewStock(row.script)}
                                    >
                                      {row.script && row.script.endsWith('-EQ')
                                        ? row.script.substring(0, row.script.length - 3)
                                        : row.script}
                                    </span>
                                    {renderScreenerActions(row.script)}
                                  </Box>
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{row.broker}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{row.quantity}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{fmt(row.avg_price)}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{fmt(row.ltp)}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', borderLeft: '2px solid rgba(255,215,0,0.3)' }}>
                                  <Chip
                                    label={`+${row.change_in_ltp_pct.toFixed(2)}%`}
                                    size="small"
                                    sx={{
                                      bgcolor: 'rgba(16,185,129,0.15)',
                                      color: '#10b981',
                                      fontWeight: 800,
                                      fontSize: 10,
                                      height: 20
                                    }}
                                  />
                                </TableCell>
                                <TableCell
                                  sx={{
                                    borderBottom: '1px solid #2a2e43',
                                    color: row.pnl_pct >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: 700,
                                    fontSize: 11
                                  }}
                                >
                                  {row.pnl_pct >= 0 ? '+' : ''}{row.pnl_pct.toFixed(2)}%
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {fmt(row.current_value)}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  {row.dip_pct != null ? (
                                    <span style={{ color: row.dip_pct >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: 11 }}>
                                      {row.dip_pct >= 0 ? '+' : ''}{row.dip_pct.toFixed(2)}%
                                    </span>
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                                  )}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {row.latest_tx_date ? new Date(row.latest_tx_date).toLocaleDateString('en-IN') : '—'}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {row.latest_tx_days != null ? row.latest_tx_days : '—'}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  {row.latest_tx_type ? (
                                    <Chip
                                      label={row.latest_tx_type}
                                      size="small"
                                      sx={{
                                        bgcolor: row.latest_tx_type.toLowerCase() === 'buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: row.latest_tx_type.toLowerCase() === 'buy' ? '#10b981' : '#ef4444',
                                        fontWeight: 700,
                                        fontSize: 10,
                                        height: 18
                                      }}
                                    />
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                                  )}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  <Checkbox
                                    checked={row.action_checked}
                                    onChange={() =>
                                      handleActionToggle(row.script, 'section2', row.action_checked)
                                    }
                                    sx={{
                                      p: 0.5,
                                      color: '#2a2e43',
                                      '&.Mui-checked': {
                                        color: row.action_type === 'SELL' ? '#ef4444' : '#10b981'
                                      }
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No matching positive movers.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Top Losers (Negative Movers) */}
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, color: '#ef4444' }}
                  >
                    <TrendingDownIcon /> Top {N} Negative Movers
                  </Typography>
                  <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
                    <CardContent sx={{ p: 0, overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#161824' }}>
                            {SECTION2_COLUMNS.map(col => renderTableHeaderCell('section2_bottom', col, 10, 1.2))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {displaySection2Bottom.length > 0 ? (
                            displaySection2Bottom.map((row, i) => (
                              <TableRow key={row.script || i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <span
                                      style={{ color: '#2962ff', cursor: 'pointer' }}
                                      onClick={() => onViewStock(row.script)}
                                    >
                                      {row.script && row.script.endsWith('-EQ')
                                        ? row.script.substring(0, row.script.length - 3)
                                        : row.script}
                                    </span>
                                    {renderScreenerActions(row.script)}
                                  </Box>
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{row.broker}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{row.quantity}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{fmt(row.avg_price)}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{fmt(row.ltp)}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', borderLeft: '2px solid rgba(255,215,0,0.3)' }}>
                                  <Chip
                                    label={`${row.change_in_ltp_pct.toFixed(2)}%`}
                                    size="small"
                                    sx={{
                                      bgcolor: 'rgba(239,68,68,0.15)',
                                      color: '#ef4444',
                                      fontWeight: 800,
                                      fontSize: 10,
                                      height: 20
                                    }}
                                  />
                                </TableCell>
                                <TableCell
                                  sx={{
                                    borderBottom: '1px solid #2a2e43',
                                    color: row.pnl_pct >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: 700,
                                    fontSize: 11
                                  }}
                                >
                                  {row.pnl_pct >= 0 ? '+' : ''}{row.pnl_pct.toFixed(2)}%
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {fmt(row.current_value)}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  {row.dip_pct != null ? (
                                    <span style={{ color: row.dip_pct >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: 11 }}>
                                      {row.dip_pct >= 0 ? '+' : ''}{row.dip_pct.toFixed(2)}%
                                    </span>
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                                  )}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {row.latest_tx_date ? new Date(row.latest_tx_date).toLocaleDateString('en-IN') : '—'}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {row.latest_tx_days != null ? row.latest_tx_days : '—'}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  {row.latest_tx_type ? (
                                    <Chip
                                      label={row.latest_tx_type}
                                      size="small"
                                      sx={{
                                        bgcolor: row.latest_tx_type.toLowerCase() === 'buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: row.latest_tx_type.toLowerCase() === 'buy' ? '#10b981' : '#ef4444',
                                        fontWeight: 700,
                                        fontSize: 10,
                                        height: 18
                                      }}
                                    />
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                                  )}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  <Checkbox
                                    checked={row.action_checked}
                                    onChange={() =>
                                      handleActionToggle(row.script, 'section2', row.action_checked)
                                    }
                                    sx={{
                                      p: 0.5,
                                      color: '#2a2e43',
                                      '&.Mui-checked': {
                                        color: row.action_type === 'SELL' ? '#ef4444' : '#10b981'
                                      }
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No matching negative movers.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {activeTab === 2 && (
            <Box>
              {/* Controls bar */}
              <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, mb: 3 }}>
                <CardContent sx={{ p: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                    <Box sx={{ width: 260 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Mover Count (N):</span>
                        <span style={{ color: '#2962ff' }}>{N}</span>
                      </Typography>
                      <Slider
                        value={N}
                        onChange={(_, v) => setN(v as number)}
                        onChangeCommitted={(_, v) => {
                          fetchSection2(v as number);
                          fetchSection3(v as number, section3TxTypeFilter);
                        }}
                        min={1}
                        max={15}
                        step={1}
                        marks
                        valueLabelDisplay="auto"
                      />
                    </Box>

                    <TextField
                      label="Mover Volume count"
                      type="number"
                      size="small"
                      value={N}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(15, parseInt(e.target.value) || 1));
                        setN(val);
                        fetchSection2(val);
                        fetchSection3(val, section3TxTypeFilter);
                      }}
                      slotProps={{ htmlInput: { min: 1, max: 15 } }}
                      sx={{ width: 140 }}
                    />

                    <Typography variant="caption" color="text.secondary">
                      Displays top N positive dippers and bottom N negative dippers daily.
                    </Typography>
                  </Box>

                  {/* Buy / Sell Radio Button Controls */}
                  <Box sx={{ borderLeft: { sm: '1px solid #2a2e43' }, pl: { sm: 3 } }}>
                    <FormControl component="fieldset">
                      <FormLabel component="legend" sx={{ fontSize: 11, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                        Last Transaction Type Filter
                      </FormLabel>
                      <RadioGroup
                        row
                        name="section3-tx-type-filter"
                        value={section3TxTypeFilter}
                        onChange={(e) => {
                          const newFilter = e.target.value as 'Buy' | 'Sell';
                          setSection3TxTypeFilter(newFilter);
                          fetchSection3(N, newFilter);
                        }}
                      >
                        <FormControlLabel
                          value="Buy"
                          control={<Radio size="small" sx={{ color: '#10b981', '&.Mui-checked': { color: '#10b981' } }} />}
                          label={<Typography variant="body2" sx={{ fontWeight: 700, color: '#10b981' }}>Buy</Typography>}
                        />
                        <FormControlLabel
                          value="Sell"
                          control={<Radio size="small" sx={{ color: '#ef4444', '&.Mui-checked': { color: '#ef4444' } }} />}
                          label={<Typography variant="body2" sx={{ fontWeight: 700, color: '#ef4444' }}>Sell</Typography>}
                        />
                      </RadioGroup>
                    </FormControl>
                  </Box>
                </CardContent>
              </Card>

              {/* Side-by-side or combined split views */}
              <Grid container spacing={3}>
                {/* Top Positive Dips */}
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, color: '#10b981' }}
                  >
                    <TrendingUpIcon /> Top {N} Positive Dips
                  </Typography>
                  <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
                    <CardContent sx={{ p: 0, overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#161824' }}>
                            {SECTION3_COLUMNS.map(col => renderTableHeaderCell('section3_top', col, 10, 1.2))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {displaySection3Top.length > 0 ? (
                            displaySection3Top.map((row, i) => (
                              <TableRow key={row.script || i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <span
                                      style={{ color: '#2962ff', cursor: 'pointer' }}
                                      onClick={() => onViewStock(row.script)}
                                    >
                                      {row.script && row.script.endsWith('-EQ')
                                        ? row.script.substring(0, row.script.length - 3)
                                        : row.script}
                                    </span>
                                    {renderScreenerActions(row.script)}
                                  </Box>
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{row.broker}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{row.quantity}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{fmt(row.avg_price)}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{fmt(row.ltp)}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  <Chip
                                    label={`${row.change_in_ltp_pct >= 0 ? '+' : ''}${row.change_in_ltp_pct.toFixed(2)}%`}
                                    size="small"
                                    sx={{
                                      bgcolor: row.change_in_ltp_pct >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                      color: row.change_in_ltp_pct >= 0 ? '#10b981' : '#ef4444',
                                      fontWeight: 800,
                                      fontSize: 10,
                                      height: 20
                                    }}
                                  />
                                </TableCell>
                                <TableCell
                                  sx={{
                                    borderBottom: '1px solid #2a2e43',
                                    color: row.pnl_pct >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: 700,
                                    fontSize: 11
                                  }}
                                >
                                  {row.pnl_pct >= 0 ? '+' : ''}{row.pnl_pct.toFixed(2)}%
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {fmt(row.current_value)}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', borderLeft: '2px solid rgba(255,215,0,0.3)' }}>
                                  {row.dip_pct != null ? (
                                    <span style={{ color: row.dip_pct >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: 11 }}>
                                      {row.dip_pct >= 0 ? '+' : ''}{row.dip_pct.toFixed(2)}%
                                    </span>
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                                  )}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {row.latest_tx_date ? new Date(row.latest_tx_date).toLocaleDateString('en-IN') : '—'}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {row.latest_tx_days != null ? row.latest_tx_days : '—'}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  {row.latest_tx_type ? (
                                    <Chip
                                      label={row.latest_tx_type}
                                      size="small"
                                      sx={{
                                        bgcolor: row.latest_tx_type.toLowerCase() === 'buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: row.latest_tx_type.toLowerCase() === 'buy' ? '#10b981' : '#ef4444',
                                        fontWeight: 700,
                                        fontSize: 10,
                                        height: 18
                                      }}
                                    />
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                                  )}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  <Checkbox
                                    checked={row.action_checked}
                                    onChange={() =>
                                      handleActionToggle(row.script, 'section3', row.action_checked)
                                    }
                                    sx={{
                                      p: 0.5,
                                      color: '#2a2e43',
                                      '&.Mui-checked': {
                                        color: row.action_type === 'SELL' ? '#ef4444' : '#10b981'
                                      }
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No matching positive dippers.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Top Negative Dips */}
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, color: '#ef4444' }}
                  >
                    <TrendingDownIcon /> Top {N} Negative Dips
                  </Typography>
                  <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
                    <CardContent sx={{ p: 0, overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#161824' }}>
                            {SECTION3_COLUMNS.map(col => renderTableHeaderCell('section3_bottom', col, 10, 1.2))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {displaySection3Bottom.length > 0 ? (
                            displaySection3Bottom.map((row, i) => (
                              <TableRow key={row.script || i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <span
                                      style={{ color: '#2962ff', cursor: 'pointer' }}
                                      onClick={() => onViewStock(row.script)}
                                    >
                                      {row.script && row.script.endsWith('-EQ')
                                        ? row.script.substring(0, row.script.length - 3)
                                        : row.script}
                                    </span>
                                    {renderScreenerActions(row.script)}
                                  </Box>
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{row.broker}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{row.quantity}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{fmt(row.avg_price)}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>{fmt(row.ltp)}</TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  <Chip
                                    label={`${row.change_in_ltp_pct >= 0 ? '+' : ''}${row.change_in_ltp_pct.toFixed(2)}%`}
                                    size="small"
                                    sx={{
                                      bgcolor: row.change_in_ltp_pct >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                      color: row.change_in_ltp_pct >= 0 ? '#10b981' : '#ef4444',
                                      fontWeight: 800,
                                      fontSize: 10,
                                      height: 20
                                    }}
                                  />
                                </TableCell>
                                <TableCell
                                  sx={{
                                    borderBottom: '1px solid #2a2e43',
                                    color: row.pnl_pct >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: 700,
                                    fontSize: 11
                                  }}
                                >
                                  {row.pnl_pct >= 0 ? '+' : ''}{row.pnl_pct.toFixed(2)}%
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {fmt(row.current_value)}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', borderLeft: '2px solid rgba(255,215,0,0.3)' }}>
                                  {row.dip_pct != null ? (
                                    <span style={{ color: row.dip_pct >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: 11 }}>
                                      {row.dip_pct >= 0 ? '+' : ''}{row.dip_pct.toFixed(2)}%
                                    </span>
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                                  )}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {row.latest_tx_date ? new Date(row.latest_tx_date).toLocaleDateString('en-IN') : '—'}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                  {row.latest_tx_days != null ? row.latest_tx_days : '—'}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  {row.latest_tx_type ? (
                                    <Chip
                                      label={row.latest_tx_type}
                                      size="small"
                                      sx={{
                                        bgcolor: row.latest_tx_type.toLowerCase() === 'buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: row.latest_tx_type.toLowerCase() === 'buy' ? '#10b981' : '#ef4444',
                                        fontWeight: 700,
                                        fontSize: 10,
                                        height: 18
                                      }}
                                    />
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: 11 }}>—</span>
                                  )}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                  <Checkbox
                                    checked={row.action_checked}
                                    onChange={() =>
                                      handleActionToggle(row.script, 'section3', row.action_checked)
                                    }
                                    sx={{
                                      p: 0.5,
                                      color: '#2a2e43',
                                      '&.Mui-checked': {
                                        color: row.action_type === 'SELL' ? '#ef4444' : '#10b981'
                                      }
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No matching negative dippers.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* ======================================================= */}
          {/*  Section 4 — Re-entry Opportunities                      */}
          {/* ======================================================= */}
          {activeTab === 3 && (
            <Box>
              {/* Controls bar */}
              <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, mb: 3 }}>
                <CardContent sx={{ p: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                  {/* Description */}
                  <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#f59e0b', mb: 0.5 }}>
                      🎯 Stocks Fully Exited in the Last 6 Months
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Shows scripts sold &amp; not currently held — ranked by biggest drop from your exit price.
                      A large negative % = the stock has fallen since you sold it → potential cheap re-entry.
                    </Typography>
                  </Box>

                  {/* Top N input */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <TextField
                      label="Top N results"
                      type="number"
                      size="small"
                      value={section4N}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(50, parseInt(e.target.value) || 10));
                        setSection4N(val);
                        fetchSection4(val);
                      }}
                      slotProps={{ htmlInput: { min: 1, max: 50 } }}
                      sx={{ width: 130 }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<RefreshIcon />}
                      onClick={() => fetchSection4(section4N)}
                      sx={{ borderColor: '#2a2e43', color: 'text.secondary', '&:hover': { borderColor: '#f59e0b', color: '#f59e0b' } }}
                    >
                      Refresh
                    </Button>
                  </Box>
                </CardContent>
              </Card>

              {/* Summary stat chips */}
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Chip
                  label={`${displaySection4.length} Re-entry Candidates`}
                  sx={{ bgcolor: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, fontSize: 12 }}
                />
                {displaySection4.length > 0 && (
                  <Chip
                    label={`Biggest Drop: ${displaySection4[0]?.drop_from_exit_pct?.toFixed(2)}% from exit`}
                    sx={{ bgcolor: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 700, fontSize: 12 }}
                  />
                )}
              </Box>

              {/* Table */}
              <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
                <CardContent sx={{ p: 0 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#161824' }}>
                        {SECTION4_COLUMNS.map(col => renderTableHeaderCell('section4', col, 11, 1.5))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {displaySection4.length > 0 ? (
                        displaySection4.map((row, i) => {
                          const drop = row.drop_from_exit_pct ?? 0;
                          const chg = row.change_in_ltp_pct ?? 0;
                          return (
                            <TableRow
                              key={row.script || i}
                              sx={{
                                '&:hover': { bgcolor: 'rgba(245,158,11,0.04)' },
                                ...(i < 3 ? { borderLeft: '3px solid #f59e0b' } : {})
                              }}
                            >
                              {/* Stock Name */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  {i < 3 && (
                                    <Chip
                                      label={`#${i + 1}`}
                                      size="small"
                                      sx={{
                                        bgcolor: 'rgba(245,158,11,0.15)',
                                        color: '#f59e0b',
                                        fontWeight: 800,
                                        fontSize: 9,
                                        height: 18,
                                        minWidth: 28
                                      }}
                                    />
                                  )}
                                  <span
                                    style={{ color: '#2962ff', cursor: 'pointer' }}
                                    onClick={() => onViewStock(row.script)}
                                  >
                                    {row.script && row.script.endsWith('-EQ')
                                      ? row.script.substring(0, row.script.length - 3)
                                      : row.script}
                                  </span>
                                  {renderScreenerActions(row.script)}
                                </Box>
                              </TableCell>

                              {/* Broker */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                {row.broker}
                              </TableCell>

                              {/* Exit Price */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
                                {fmt(row.exit_price)}
                              </TableCell>

                              {/* Exit Date */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                {row.exit_date ? new Date(row.exit_date).toLocaleDateString('en-IN') : '—'}
                              </TableCell>

                              {/* Days since exit */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 11 }}>
                                {row.days_since_exit != null ? `${row.days_since_exit}d` : '—'}
                              </TableCell>

                              {/* LTP */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12, fontWeight: 700 }}>
                                {fmt(row.ltp)}
                              </TableCell>

                              {/* Today's LTP change % */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                <Chip
                                  label={`${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`}
                                  size="small"
                                  sx={{
                                    bgcolor: chg >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                    color: chg >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: 800,
                                    fontSize: 10,
                                    height: 20
                                  }}
                                />
                              </TableCell>

                              {/* Drop from Exit % — the key signal */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', borderLeft: '2px solid rgba(255,215,0,0.3)' }}>
                                <Chip
                                  label={`${drop >= 0 ? '+' : ''}${drop.toFixed(2)}%`}
                                  size="small"
                                  sx={{
                                    bgcolor: drop < 0 ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)',
                                    color: drop < 0 ? '#ef4444' : '#10b981',
                                    fontWeight: 800,
                                    fontSize: 11,
                                    height: 22
                                  }}
                                />
                              </TableCell>

                              {/* Action checkbox */}
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43' }}>
                                <Tooltip title="Mark as reviewed (resets in 24h)">
                                  <Checkbox
                                    checked={row.action_checked}
                                    onChange={() =>
                                      handleActionToggle(row.script, 'section4', row.action_checked)
                                    }
                                    sx={{
                                      p: 0.5,
                                      color: '#2a2e43',
                                      '&.Mui-checked': {
                                        color: row.action_type === 'SELL' ? '#ef4444' : '#10b981'
                                      }
                                    }}
                                  />
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ color: '#f59e0b', fontWeight: 600 }}>
                                No matching re-entry candidates found
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                No stocks were fully exited in the last 6 months outside of live holdings,
                                or no rows match the active filter.
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </Box>
          )}
        </Box>
      )}

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
                <Tooltip title="Re-capture fresh screenshots from Screener.in now">
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
                </Tooltip>
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

      {/* Mutual Funds popover for compact details (same as Live Holdings) */}
      <Popover
        open={Boolean(popoverAnchor)}
        anchorEl={popoverAnchor}
        onClose={() => {
          setPopoverAnchor(null);
          setPopoverData([]);
          setPopoverStock('');
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center'
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center'
        }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#161824',
              border: '1px solid #2a2e43',
              borderRadius: 2,
              p: 2,
              minWidth: 780,
              boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.5)'
            }
          }
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#8b5cf6' }}>
            Mutual Fund Activity:{' '}
            {popoverStock &&
              (popoverStock.endsWith('-EQ')
                ? popoverStock.substring(0, popoverStock.length - 3)
                : popoverStock)}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>
                  Category
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>
                  Fund
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>
                  Holding (Cr)
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>
                  1M Change
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>
                  2M Change
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>
                  3M Change
                </TableCell>
                <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>
                  3M Trend
                </TableCell>
                <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>
                  Portfolio Signal
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {popoverData.map((m: any) => {
                const FUND_CODE_TO_OFFICIAL_NAME: Record<string, string> = {
                  H: 'HDFC Flexi Cap',
                  P: 'Parag Parikh',
                  Q: 'Quant Flexi Cap',
                  J: 'JM Flexicap',
                  HV: 'HDFC Value',
                  HS: 'HSBC Value',
                  IC: 'ICICI Value'
                };
                const fundDisplayName = FUND_CODE_TO_OFFICIAL_NAME[m.fund_code] || m.fund_name;
                const latestVal = m.latest_value;
                const category =
                  m.mf_category || (['HV', 'HS', 'IC'].includes(m.fund_code) ? 'Value' : 'Flexicap');
                const isValue = category === 'Value';

                const renderChangeEl = (change: number, pct: number) => {
                  if (change > 0.0001) {
                    return (
                      <span style={{ color: '#10b981', fontWeight: 600 }}>
                        ▲ {Math.round(change)} ({pct >= 0 ? '+' : ''}
                        {Math.round(pct)}%)
                      </span>
                    );
                  } else if (change < -0.0001) {
                    return (
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>
                        ▼ {Math.round(Math.abs(change))} ({Math.round(pct)}%)
                      </span>
                    );
                  }
                  return <span style={{ color: '#64748b' }}>0</span>;
                };

                let trendColor = '#3b82f6';
                if (m.trend_3m === 'Accumulating') trendColor = '#10b981';
                if (m.trend_3m === 'Reducing') trendColor = '#ef4444';
                if (m.trend_3m === 'New Entry') trendColor = '#059669';

                let signalColor = '#64748b';
                if (m.portfolio_signal === 'New Entry') signalColor = '#059669';
                else if (m.portfolio_signal === 'Strong Accumulation') signalColor = '#10b981';
                else if (m.portfolio_signal === 'Accumulating') signalColor = '#34d399';
                else if (m.portfolio_signal === 'Strong Reduction') signalColor = '#ef4444';
                else if (m.portfolio_signal === 'Reducing') signalColor = '#f87171';
                else if (m.portfolio_signal === 'Stable Holding') signalColor = '#3b82f6';
                else if (m.portfolio_signal === 'Active') signalColor = '#f59e0b';

                return (
                  <TableRow key={m.fund_code}>
                    <TableCell sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)' }}>
                      <Chip
                        label={category}
                        size="small"
                        sx={{
                          bgcolor: isValue ? 'rgba(192, 132, 252, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: isValue ? '#c084fc' : '#38bdf8',
                          border: `1px solid ${
                            isValue ? 'rgba(192, 132, 252, 0.3)' : 'rgba(56, 189, 248, 0.3)'
                          }`,
                          fontWeight: 700,
                          fontSize: 10,
                          height: 20
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)', fontWeight: 600 }}>
                      {fundDisplayName}
                    </TableCell>
                    <TableCell align="right" sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)' }}>
                      {Math.round(latestVal)}
                    </TableCell>
                    <TableCell align="right" sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)' }}>
                      {renderChangeEl(m.change_1m, m.change_1m_pct)}
                    </TableCell>
                    <TableCell align="right" sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)' }}>
                      {renderChangeEl(m.change_2m, m.change_2m_pct)}
                    </TableCell>
                    <TableCell align="right" sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)' }}>
                      {renderChangeEl(m.change_3m, m.change_3m_pct)}
                    </TableCell>
                    <TableCell align="center" sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)' }}>
                      <Chip
                        label={m.trend_3m}
                        size="small"
                        sx={{
                          bgcolor: `${trendColor}22`,
                          color: trendColor,
                          border: `1px solid ${trendColor}33`,
                          fontWeight: 700,
                          fontSize: 9,
                          height: 18
                        }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)' }}>
                      <Chip
                        label={m.portfolio_signal || 'Active'}
                        size="small"
                        sx={{
                          bgcolor: `${signalColor}22`,
                          color: signalColor,
                          border: `1px solid ${signalColor}33`,
                          fontWeight: 700,
                          fontSize: 9,
                          height: 18
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Popover>
    </Box>
  );
};

export default Watchlist;
