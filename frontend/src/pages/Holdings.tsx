import React, { useState, useMemo, useEffect } from 'react';
import { useAppSelector } from '../store';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import {
  Box, Typography, Card, CardContent, Grid, Chip,
  Tab, Tabs, Button, Popover, Table, TableHead, TableBody, TableRow, TableCell, Tooltip as MuiTooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, TextField, IconButton,
} from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import DownloadIcon from '@mui/icons-material/Download';
import AttachmentIcon from '@mui/icons-material/Attachment';
import AddIcon from '@mui/icons-material/Add';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import DeleteIcon from '@mui/icons-material/Delete';
import FlagIcon from '@mui/icons-material/Flag';
import axios from 'axios';

interface HoldingsProps {
  onViewStock: (scrip: string) => void;
  onScrape: (broker: string) => void;
  showToast?: (message: string, severity: 'success' | 'error' | 'info') => void;
}

const Holdings: React.FC<HoldingsProps> = ({ onViewStock, onScrape, showToast }) => {
  const allHoldings = useAppSelector((state) => state.portfolio.holdings);
  const [activeTab, setActiveTab] = useState('all');
  const brokers = ['all', 'MStock', 'Mstock_KA', 'Zerodha', 'Dhan'];
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [popoverData, setPopoverData] = useState<any[]>([]);
  const [popoverStock, setPopoverStock] = useState<string>('');

  // Research status: maps script → { attachment_count, has_note }
  const [researchStatus, setResearchStatus] = useState<Record<string, { attachment_count: number; has_note: boolean }>>({});

  useEffect(() => {
    axios.get('/api/research/status')
      .then(res => setResearchStatus(res.data || {}))
      .catch(() => { /* non-critical, silently ignore */ });
  }, []);

  // ── Add Target dialog state (self-contained in Holdings) ──────────────────
  const BOOKMARK_COLORS = [
    { key: 'red', color: '#ef4444', label: 'Red' },
    { key: 'orange', color: '#f59e0b', label: 'Orange' },
    { key: 'yellow', color: '#eab308', label: 'Yellow' },
    { key: 'green', color: '#10b981', label: 'Green' },
    { key: 'blue', color: '#2962ff', label: 'Blue' },
  ];
  const [tgtDialogOpen, setTgtDialogOpen] = useState(false);
  const [tgtRows, setTgtRows] = useState<{ type: string; target_price: string }[]>([{ type: 'Buy', target_price: '' }]);
  const [tgtCommon, setTgtCommon] = useState({ script: '', category: '', comment: '', bookmark: '' });
  const [tgtCategories, setTgtCategories] = useState<string[]>([]);

  // Fetch categories once on mount
  useEffect(() => {
    axios.get('/api/target-categories')
      .then(res => setTgtCategories(res.data || []))
      .catch(() => {});
  }, []);

  const resetTgtDialog = () => {
    setTgtDialogOpen(false);
    setTgtRows([{ type: 'Buy', target_price: '' }]);
    setTgtCommon({ script: '', category: '', comment: '', bookmark: '' });
  };

  const openAddTargetForScript = (script: string) => {
    setTgtRows([{ type: 'Buy', target_price: '' }]);
    setTgtCommon({ script, category: '', comment: '', bookmark: '' });
    setTgtDialogOpen(true);
  };

  const handleSaveTargets = async () => {
    if (!tgtCommon.script) return;
    const validRows = tgtRows.filter(r => r.target_price);
    if (validRows.length === 0) return;
    try {
      for (const row of validRows) {
        await axios.post('/api/targets', {
          script: tgtCommon.script,
          type: row.type,
          target_price: parseFloat(row.target_price),
          category: tgtCommon.category || null,
          comment: tgtCommon.comment || null,
          bookmark: tgtCommon.bookmark || null,
        });
      }
      if (showToast) showToast(`${validRows.length} target(s) added for ${tgtCommon.script}`, 'success');
      resetTgtDialog();
    } catch (e: any) {
      console.error('Failed to save target:', e);
      if (showToast) showToast(e.response?.data?.detail || 'Failed to add target.', 'error');
    }
  };

  const handleExport = async (format: 'excel' | 'csv') => {
    try {
      const response = await axios.get(`/api/holdings/export?format=${format}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Live_Holdings.${format === 'excel' ? 'xlsx' : 'csv'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export error:', err);
    }
  };

  const filteredHoldings = activeTab === 'all'
    ? allHoldings
    : allHoldings.filter((h: any) => h.broker?.toLowerCase() === activeTab.toLowerCase());

  const fmt = (n: any) => {
    if (n == null || isNaN(n)) return '—';
    return `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
  };

  const columnDefs = useMemo(() => [
    { field: 'script', headerName: 'Script', flex: 1.5, minWidth: 140,
      cellRenderer: (p: any) => {
        const displayVal = p.value && p.value.endsWith('-EQ') ? p.value.substring(0, p.value.length - 3) : (p.value || '');
        const info = researchStatus[p.value];
        const hasResearch = info && (info.attachment_count > 0 || info.has_note);
        const tipParts: string[] = [];
        if (info?.attachment_count > 0) tipParts.push(`${info.attachment_count} PDF${info.attachment_count > 1 ? 's' : ''}`);
        if (info?.has_note) tipParts.push('Research note');
        const tipText = tipParts.length ? tipParts.join(' · ') : '';
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <span style={{ color: '#2962ff', fontWeight: 600 }} onClick={() => onViewStock(p.value)}>
              {displayVal}
            </span>
            {hasResearch && (
              <MuiTooltip title={tipText} arrow placement="right">
                <AttachmentIcon
                  sx={{
                    fontSize: 14,
                    color: '#f59e0b',
                    verticalAlign: 'middle',
                    opacity: 0.9,
                    cursor: 'default',
                    flexShrink: 0,
                  }}
                />
              </MuiTooltip>
            )}
          </span>
        );
      }
    },
    {
      field: 'mutual_funds',
      headerName: 'Mutual Funds',
      flex: 1.1,
      minWidth: 120,
      cellRenderer: (p: any) => {
        const funds = p.value || [];
        if (funds.length === 0) return <span style={{ color: '#64748b' }}>—</span>;
        
        const FUND_CODE_TO_OFFICIAL_NAME: Record<string, string> = {
          'H': 'HDFC Flexi Cap Fund',
          'P': 'Parag Parikh Flexi Cap Fund',
          'Q': 'Quant Flexi Cap Fund',
          'J': 'JM Flexicap Fund',
          'HV': 'HDFC Value Fund',
          'HS': 'HSBC Value Fund',
          'IC': 'ICICI Value Fund'
        };

        const flexiFunds = funds.filter((m: any) => m.mf_category === 'Flexicap' || ['H', 'P', 'Q', 'J'].includes(m.fund_code));
        const valueFunds = funds.filter((m: any) => m.mf_category === 'Value' || ['HV', 'HS', 'IC'].includes(m.fund_code));
        
        const fCount = new Set(flexiFunds.map((m: any) => m.fund_code || m.fund_name)).size;
        const vCount = new Set(valueFunds.map((m: any) => m.fund_code || m.fund_name)).size;
        
        const parts: string[] = [];
        if (fCount > 0) parts.push(`F${fCount}`);
        if (vCount > 0) parts.push(`V${vCount}`);
        const badgeText = p.data?.mf_badge || (parts.length > 0 ? parts.join('|') : '—');
        
        if (badgeText === '—' || parts.length === 0) return <span style={{ color: '#64748b' }}>—</span>;

        const tooltipContent = (
          <Box sx={{ p: 0.5, maxWidth: 300 }}>
            {fCount > 0 && (
              <Box sx={{ mb: vCount > 0 ? 1 : 0 }}>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#38bdf8' }}>
                  Flexicap ({fCount}):
                </Typography>
                {flexiFunds.map((m: any) => (
                  <Typography key={m.fund_code} variant="caption" sx={{ display: 'block', pl: 1, color: '#e2e8f0', fontSize: 11 }}>
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
                  <Typography key={m.fund_code} variant="caption" sx={{ display: 'block', pl: 1, color: '#e2e8f0', fontSize: 11 }}>
                    • {FUND_CODE_TO_OFFICIAL_NAME[m.fund_code] || m.fund_name} ({m.fund_code})
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        );

        return (
          <MuiTooltip title={tooltipContent} arrow>
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
                letterSpacing: '0.5px'
              }}
              onClick={(e) => {
                setPopoverAnchor(e.currentTarget);
                setPopoverData(p.value);
                setPopoverStock(p.data.script);
              }}
            >
              {badgeText}
            </span>
          </MuiTooltip>
        );
      }
    },
    { field: 'broker', headerName: 'Broker', flex: 1, minWidth: 100,
      cellRenderer: (p: any) => {
        const colors: Record<string, string> = { MStock: '#2962ff', Mstock_KA: '#b229ff', Zerodha: '#f59e0b', Dhan: '#10b981' };
        return <Chip label={p.value} size="small" sx={{ bgcolor: `${colors[p.value] || '#888'}22`, color: colors[p.value] || '#888', fontSize: 11 }} />;
      }
    },
    {
      field: 'quantity',
      headerName: 'Qty',
      flex: 0.8,
      minWidth: 80,
      headerClass: 'grid-header-center',
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {p.value != null ? p.value.toLocaleString('en-IN') : '—'}
        </span>
      )
    },
    {
      field: 'avg_price',
      headerName: 'Avg Price',
      flex: 1,
      minWidth: 100,
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {fmt(p.value)}
        </span>
      )
    },
    {
      field: 'ltp',
      headerName: 'LTP',
      flex: 1,
      minWidth: 100,
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {fmt(p.value)}
        </span>
      )
    },
    {
      field: 'change_in_ltp_pct',
      headerName: 'LTP Chg %',
      flex: 1.1,
      minWidth: 100,
      cellRenderer: (p: any) => {
        if (p.value == null) return '—';
        const color = p.value >= 0 ? '#10b981' : '#ef4444';
        return (
          <span style={{ color, fontWeight: 600, display: 'block', textAlign: 'right', width: '100%' }}>
            {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
          </span>
        );
      }
    },
    {
      field: 'current_value',
      headerName: 'Current Value',
      flex: 1.2,
      minWidth: 120,
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {fmt(p.value)}
        </span>
      )
    },
    {
      field: 'pnl',
      headerName: 'P&L',
      flex: 1,
      minWidth: 110,
      cellRenderer: (p: any) => {
        if (p.value == null) return '—';
        const color = p.value >= 0 ? '#10b981' : '#ef4444';
        return (
          <span style={{ color, fontWeight: 600, display: 'block', textAlign: 'right', width: '100%' }}>
            {p.value >= 0 ? '+' : ''}{fmt(p.value)}
          </span>
        );
      }
    },
    {
      headerName: 'P&L %',
      flex: 1.1,
      minWidth: 100,
      valueGetter: (p: any) => {
        if (!p.data) return 0;
        const cost = p.data.quantity * p.data.avg_price;
        if (!cost) return 0;
        return (p.data.pnl / cost) * 100;
      },
      cellRenderer: (p: any) => {
        if (p.value == null) return '—';
        const color = p.value >= 0 ? '#10b981' : '#ef4444';
        return (
          <span style={{ color, fontWeight: 600, display: 'block', textAlign: 'right', width: '100%' }}>
            {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
          </span>
        );
      }
    },
    {
      headerName: 'Target',
      flex: 1,
      minWidth: 110,
      cellRenderer: (p: any) => {
        return (
          <Button
            variant="contained"
            size="small"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              openAddTargetForScript(p.data.script);
            }}
            sx={{
              textTransform: 'none',
              fontSize: '11px',
              bgcolor: 'rgba(41,98,255,0.15)',
              color: '#2962ff',
              border: '1px solid rgba(41,98,255,0.3)',
              '&:hover': {
                bgcolor: 'rgba(41,98,255,0.3)',
              },
              height: '24px',
              borderRadius: '4px',
              fontWeight: 600,
              mt: '4px'
            }}
          >
            Add Tgt
          </Button>
        );
      }
    },
    {
      headerName: 'Watchlist',
      flex: 1.2,
      minWidth: 145,
      cellRenderer: (p: any) => {
        const handleMove = async (e: React.MouseEvent) => {
          e.stopPropagation();
          try {
            await axios.post('/api/watchlist/manual', { script: p.data.script });
            if (showToast) {
              showToast(`Moved ${p.data.script} to Watchlist manually!`, 'success');
            }
          } catch (e: any) {
            console.error(e);
            if (showToast) {
              showToast(e.response?.data?.detail || 'Failed to move to watchlist.', 'error');
            }
          }
        };
        return (
          <Button
            variant="contained"
            size="small"
            onClick={handleMove}
            sx={{
              textTransform: 'none',
              fontSize: '11px',
              bgcolor: 'rgba(234,179,8,0.15)',
              color: '#eab308',
              border: '1px solid rgba(234,179,8,0.3)',
              '&:hover': {
                bgcolor: 'rgba(234,179,8,0.3)',
              },
              height: '24px',
              borderRadius: '4px',
              fontWeight: 600,
              mt: '4px'
            }}
          >
            Add to
          </Button>
        );
      }
    },
    {
      field: 'dip_pct',
      headerName: 'Dip %age',
      flex: 1.1,
      minWidth: 100,
      cellStyle: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
      cellRenderer: (p: any) => {
        if (p.value == null) return '—';
        const color = p.value >= 0 ? '#10b981' : '#ef4444';
        return (
          <span style={{ color, fontWeight: 600, display: 'block', textAlign: 'right', width: '100%' }}>
            {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
          </span>
        );
      }
    },
    {
      field: 'latest_tx_date',
      headerName: 'Date',
      flex: 1.2,
      minWidth: 110,
      cellStyle: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString('en-IN') : '—'
    },
    {
      field: 'latest_tx_days',
      headerName: '# of Days',
      flex: 1,
      minWidth: 100,
      cellStyle: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {p.value != null ? p.value.toLocaleString('en-IN') : '—'}
        </span>
      )
    },
    {
      field: 'latest_tx_type',
      headerName: 'Last Tx Type',
      flex: 1.1,
      minWidth: 110,
      cellStyle: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
      cellRenderer: (p: any) => {
        if (!p.value) return '—';
        const isBuy = p.value.toLowerCase() === 'buy';
        return (
          <Chip 
            label={p.value} 
            size="small" 
            sx={{ 
              bgcolor: isBuy ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', 
              color: isBuy ? '#10b981' : '#ef4444', 
              fontWeight: 700, 
              fontSize: 11 
            }} 
          />
        );
      }
    },
    {
      field: 'target_type',
      headerName: 'Type',
      flex: 1,
      minWidth: 90,
      cellRenderer: (p: any) => {
        if (!p.value) return '—';
        const isBuy = p.value === 'Buy';
        return (
          <Chip 
            label={p.value} 
            size="small" 
            sx={{ 
              bgcolor: isBuy ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', 
              color: isBuy ? '#10b981' : '#ef4444', 
              fontWeight: 700, 
              fontSize: 11 
            }} 
          />
        );
      }
    },
    {
      field: 'target_comment',
      headerName: 'Comments',
      flex: 1.5,
      minWidth: 150,
      cellRenderer: (p: any) => p.value || '—'
    },
    {
      field: 'latest_comment_category',
      headerName: 'Category',
      flex: 1,
      minWidth: 110,
      cellRenderer: (p: any) => p.value ? <Chip label={p.value} size="small" sx={{ bgcolor: 'rgba(41,98,255,0.1)', color: '#2962ff', border: '1px solid rgba(41,98,255,0.2)', fontSize: 11 }} /> : '—'
    },
    {
      field: 'target_price',
      headerName: 'Target',
      flex: 1,
      minWidth: 100,
      valueFormatter: (p: any) => p.value ? fmt(p.value) : '—'
    },
    {
      field: 'distance_from_target',
      headerName: 'Distance from target',
      flex: 1.3,
      minWidth: 140,
      cellStyle: (p: any) => {
        if (p.value == null) return {};
        return { color: p.value >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 };
      },
      valueFormatter: (p: any) => {
        if (p.value == null) return '—';
        return `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}%`;
      }
    },
  ], [onViewStock, showToast, researchStatus]);

  const totalValue = filteredHoldings.reduce((s: number, h: any) => s + (h.current_value || 0), 0);
  const totalPnl = filteredHoldings.reduce((s: number, h: any) => s + (h.pnl || 0), 0);
  const totalCost = filteredHoldings.reduce((s: number, h: any) => s + (h.quantity * h.avg_price || 0), 0);

  // ─── Avg. Holding Days: derived from global LIFO settlement data ─────────────
  // Filters to rows with valid numeric holding_days, respects the active broker
  // tab filter by checking if the scrip appears in filteredHoldings.
  const settlement = useAppSelector((state) => state.portfolio.settlement);
  const filteredScripts = useMemo(
    () => new Set(filteredHoldings.map((h: any) => h.script)),
    [filteredHoldings]
  );
  const avgHoldingDays = useMemo(() => {
    const settled = settlement.filter(
      (r: any) =>
        r.holding_days != null &&
        !isNaN(Number(r.holding_days)) &&
        r.pnl != null &&          // only fully/partially settled rows
        (activeTab === 'all' || filteredScripts.has(r.scrip))
    );
    if (settled.length === 0) return null;
    const sum = settled.reduce((acc: number, r: any) => acc + Number(r.holding_days), 0);
    return Math.round(sum / settled.length);
  }, [settlement, activeTab, filteredScripts]);

  return (
    <Box className="fade-in">
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Live Holdings</Typography>
          <Typography variant="body2" color="text.secondary">All positions across all broker accounts</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" color="primary" startIcon={<DownloadIcon />} size="small"
            onClick={() => handleExport('excel')}>
            Export Excel
          </Button>
          <Button variant="outlined" color="primary" startIcon={<DownloadIcon />} size="small"
            onClick={() => handleExport('csv')}>
            Export CSV
          </Button>
          {['mstock', 'mstock_ka', 'zerodha', 'dhan'].map(b => {
            const labels: Record<string, string> = {
              mstock: 'MStock',
              mstock_ka: 'Mstock KA',
              zerodha: 'Zerodha',
              dhan: 'Dhan'
            };
            return (
              <Button key={b} variant="outlined" size="small" startIcon={<StorefrontIcon />}
                onClick={() => onScrape(b)} sx={{ textTransform: 'capitalize' }}>
                Sync {labels[b]}
              </Button>
            );
          })}
        </Box>
      </Box>

      {/* Aggregate Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: 'Stocks Held', val: filteredHoldings.length, color: '#2962ff', highlight: false },
          { label: 'Total Cost', val: `₹${totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: '#06b6d4', highlight: false },
          { label: 'Market Value', val: `₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: '#8b5cf6', highlight: true },
          { label: 'Realized Profit', val: `${totalPnl >= 0 ? '+' : ''}₹${Math.abs(totalPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: totalPnl >= 0 ? '#10b981' : '#ef4444', highlight: true },
          {
            label: 'Total Return %',
            val: totalCost > 0 ? `${totalPnl >= 0 ? '+' : ''}${((totalPnl / totalCost) * 100).toFixed(2)}%` : '—',
            color: totalPnl >= 0 ? '#10b981' : '#ef4444',
            highlight: true
          },
          {
            label: 'Avg. Holding Days',
            val: avgHoldingDays != null ? `${avgHoldingDays}d` : '—',
            color: '#f59e0b',
            highlight: false
          },
        ].map(c => (
          <Grid size={{ xs: 6, md: 2 }} key={c.label}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography
                  variant="caption"
                  sx={{
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    display: 'block',
                    color: c.highlight ? '#eab308' : 'text.secondary',
                  }}
                >
                  {c.highlight && (
                    <span style={{ fontSize: '130%', lineHeight: 1, marginRight: 3 }}>💡</span>
                  )}
                  {c.label}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: c.color }}>{c.val}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Broker Tabs */}
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2, borderBottom: '1px solid #2a2e43' }}>
        {brokers.map(b => <Tab key={b} label={b === 'all' ? 'All Brokers' : b} value={b} />)}
      </Tabs>

      {/* AG Grid */}
      <div className="ag-theme-alpine-dark" style={{ height: 1150, width: '100%' }}>
        <AgGridReact
          theme="legacy"
          rowData={filteredHoldings}
          columnDefs={columnDefs as any}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination={false}
          suppressScrollOnNewData={true}
          animateRows={true}
        />
      </div>

      {/* Mutual Funds popover for compact details */}
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
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
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
            Mutual Fund Activity: {popoverStock && (popoverStock.endsWith('-EQ') ? popoverStock.substring(0, popoverStock.length - 3) : popoverStock)}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>Category</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>Fund</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>Holding (Cr)</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>1M Change</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>2M Change</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>3M Change</TableCell>
                <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>3M Trend</TableCell>
                <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>Portfolio Signal</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {popoverData.map((m: any) => {
                const FUND_CODE_TO_OFFICIAL_NAME: Record<string, string> = {
                  'H': 'HDFC Flexi Cap',
                  'P': 'Parag Parikh',
                  'Q': 'Quant Flexi Cap',
                  'J': 'JM Flexicap',
                  'HV': 'HDFC Value',
                  'HS': 'HSBC Value',
                  'IC': 'ICICI Value'
                };
                const fundDisplayName = FUND_CODE_TO_OFFICIAL_NAME[m.fund_code] || m.fund_name;
                const latestVal = m.latest_value;
                const category = m.mf_category || (['HV', 'HS', 'IC'].includes(m.fund_code) ? 'Value' : 'Flexicap');
                const isValue = category === 'Value';

                const renderChangeEl = (change: number, pct: number) => {
                  if (change > 0.0001) {
                    return <span style={{ color: '#10b981', fontWeight: 600 }}>▲ {Math.round(change)} ({pct >= 0 ? '+' : ''}{Math.round(pct)}%)</span>;
                  } else if (change < -0.0001) {
                    return <span style={{ color: '#ef4444', fontWeight: 600 }}>▼ {Math.round(Math.abs(change))} ({Math.round(pct)}%)</span>;
                  }
                  return <span style={{ color: '#64748b' }}>0</span>;
                };

                let trendColor = '#3b82f6'; // blue for Stable
                if (m.trend_3m === 'Accumulating') trendColor = '#10b981';
                if (m.trend_3m === 'Reducing') trendColor = '#ef4444';
                if (m.trend_3m === 'New Entry') trendColor = '#059669';

                let signalColor = '#64748b'; // default grey/slate
                if (m.portfolio_signal === 'New Entry') signalColor = '#059669'; // forest green
                else if (m.portfolio_signal === 'Strong Accumulation') signalColor = '#10b981'; // vibrant green
                else if (m.portfolio_signal === 'Accumulating') signalColor = '#34d399'; // medium green
                else if (m.portfolio_signal === 'Strong Reduction') signalColor = '#ef4444'; // deep red
                else if (m.portfolio_signal === 'Reducing') signalColor = '#f87171'; // soft red
                else if (m.portfolio_signal === 'Stable Holding') signalColor = '#3b82f6'; // bright blue
                else if (m.portfolio_signal === 'Active') signalColor = '#f59e0b'; // amber

                return (
                  <TableRow key={m.fund_code}>
                    <TableCell sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)' }}>
                      <Chip
                        label={category}
                        size="small"
                        sx={{
                          bgcolor: isValue ? 'rgba(192, 132, 252, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: isValue ? '#c084fc' : '#38bdf8',
                          border: `1px solid ${isValue ? 'rgba(192, 132, 252, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
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

      {/* ── Add Target Dialog (same as Target Setting) ──────────────────── */}
      <Dialog
        open={tgtDialogOpen}
        onClose={resetTgtDialog}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { background: '#161824', border: '1px solid #2a2e43', borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrackChangesIcon sx={{ color: '#2962ff' }} />
            Add New Target
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* Stock Name — read-only, auto-filled */}
          <TextField
            label="Stock Name"
            size="small"
            fullWidth
            value={tgtCommon.script.endsWith('-EQ') ? tgtCommon.script.slice(0, -3) : tgtCommon.script}
            disabled
            sx={{ mt: 1.5, mb: 2 }}
          />

          {/* Type / Target Price rows */}
          {tgtRows.map((row, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 2, mb: 1.5, alignItems: 'center' }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={row.type}
                  label="Type"
                  onChange={(e) => {
                    const updated = [...tgtRows];
                    updated[idx] = { ...updated[idx], type: e.target.value };
                    setTgtRows(updated);
                  }}
                >
                  <MenuItem value="Buy">Buy</MenuItem>
                  <MenuItem value="Sell">Sell</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Target Price"
                type="number"
                size="small"
                value={row.target_price}
                onChange={(e) => {
                  const updated = [...tgtRows];
                  updated[idx] = { ...updated[idx], target_price: e.target.value };
                  setTgtRows(updated);
                }}
                sx={{ flex: 1 }}
              />
              {tgtRows.length > 1 && (
                <IconButton
                  size="small"
                  onClick={() => setTgtRows(tgtRows.filter((_, i) => i !== idx))}
                  sx={{ color: '#ef4444', '&:hover': { bgcolor: 'rgba(239,68,68,0.1)' } }}
                >
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Box>
          ))}

          {/* +Add More */}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setTgtRows([...tgtRows, { type: 'Buy', target_price: '' }])}
            sx={{
              textTransform: 'none', fontSize: 12, fontWeight: 600,
              color: '#2962ff', mb: 2,
              '&:hover': { bgcolor: 'rgba(41,98,255,0.08)' },
            }}
          >
            Add More
          </Button>

          {/* Category */}
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={tgtCommon.category}
              label="Category"
              onChange={(e) => setTgtCommon({ ...tgtCommon, category: e.target.value })}
            >
              {tgtCategories.map(cat => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Comment */}
          <TextField
            fullWidth multiline rows={3} size="small" label="Comments"
            value={tgtCommon.comment}
            onChange={(e) => setTgtCommon({ ...tgtCommon, comment: e.target.value })}
            sx={{ mb: 2 }}
          />

          {/* Bookmark */}
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Bookmark</InputLabel>
            <Select
              value={tgtCommon.bookmark}
              label="Bookmark"
              onChange={(e) => setTgtCommon({ ...tgtCommon, bookmark: e.target.value })}
              renderValue={(value) => {
                const sel = BOOKMARK_COLORS.find(b => b.key === value);
                return sel ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlagIcon sx={{ fontSize: 16, color: sel.color }} /> {sel.label}
                  </Box>
                ) : 'None';
              }}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {BOOKMARK_COLORS.map(b => (
                <MenuItem key={b.key} value={b.key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlagIcon sx={{ fontSize: 16, color: b.color }} /> {b.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={resetTgtDialog} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveTargets}
            disabled={tgtRows.every(r => !r.target_price)}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {`Add Target${tgtRows.length > 1 ? `s (${tgtRows.filter(r => r.target_price).length})` : ''}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Holdings;
