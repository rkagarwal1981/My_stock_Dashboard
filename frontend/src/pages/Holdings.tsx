import React, { useState } from 'react';
import { useAppSelector } from '../store';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import {
  Box, Typography, Card, CardContent, Grid, Chip,
  Tab, Tabs, Button, Popover, Table, TableHead, TableBody, TableRow, TableCell, Tooltip as MuiTooltip
} from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import DownloadIcon from '@mui/icons-material/Download';
import axios from 'axios';

interface HoldingsProps {
  onViewStock: (scrip: string) => void;
  onScrape: (broker: string) => void;
}

const Holdings: React.FC<HoldingsProps> = ({ onViewStock, onScrape }) => {
  const allHoldings = useAppSelector((state) => state.portfolio.holdings);
  const [activeTab, setActiveTab] = useState('all');
  const brokers = ['all', 'MStock', 'Zerodha', 'Dhan'];
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [popoverData, setPopoverData] = useState<any[]>([]);
  const [popoverStock, setPopoverStock] = useState<string>('');

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

  const columnDefs = [
    { field: 'script', headerName: 'Script', flex: 1.5, minWidth: 140,
      cellRenderer: (p: any) => {
        const displayVal = p.value && p.value.endsWith('-EQ') ? p.value.substring(0, p.value.length - 3) : (p.value || '');
        return (
          <span style={{ cursor: 'pointer', color: '#2962ff', fontWeight: 600 }} onClick={() => onViewStock(p.value)}>
            {displayVal}
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
        if (!p.value || p.value.length === 0) return <span style={{ color: '#64748b' }}>—</span>;
        
        const codes = p.value.map((m: any) => m.fund_code).join('|');
        
        const FUND_CODE_TO_OFFICIAL_NAME: Record<string, string> = {
          'H': 'HDFC Flexi Cap Fund',
          'P': 'Parag Parikh Flexi Cap Fund',
          'Q': 'Quant Flexi Cap Fund',
          'J': 'JM Flexicap Fund'
        };

        const tooltipContent = (
          <Box sx={{ p: 0.5 }}>
            {p.value.map((m: any) => (
              <Typography key={m.fund_code} variant="caption" display="block" sx={{ fontWeight: 600 }}>
                {m.fund_code} - {FUND_CODE_TO_OFFICIAL_NAME[m.fund_code] || m.fund_name}
              </Typography>
            ))}
          </Box>
        );

        return (
          <MuiTooltip title={tooltipContent} arrow>
            <span
              style={{
                cursor: 'pointer',
                color: '#8b5cf6',
                fontWeight: 700,
                textDecoration: 'underline',
                textDecorationStyle: 'dotted'
              }}
              onClick={(e) => {
                setPopoverAnchor(e.currentTarget);
                setPopoverData(p.value);
                setPopoverStock(p.data.script);
              }}
            >
              {codes}
            </span>
          </MuiTooltip>
        );
      }
    },
    { field: 'broker', headerName: 'Broker', flex: 1, minWidth: 100,
      cellRenderer: (p: any) => {
        const colors: Record<string, string> = { MStock: '#2962ff', Zerodha: '#f59e0b', Dhan: '#10b981' };
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
  ];

  const totalValue = filteredHoldings.reduce((s: number, h: any) => s + (h.current_value || 0), 0);
  const totalPnl = filteredHoldings.reduce((s: number, h: any) => s + (h.pnl || 0), 0);
  const totalCost = filteredHoldings.reduce((s: number, h: any) => s + (h.quantity * h.avg_price || 0), 0);

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
          {['mstock', 'zerodha', 'dhan'].map(b => (
            <Button key={b} variant="outlined" size="small" startIcon={<StorefrontIcon />}
              onClick={() => onScrape(b)} sx={{ textTransform: 'capitalize' }}>
              Sync {b}
            </Button>
          ))}
        </Box>
      </Box>

      {/* Aggregate Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: 'Stocks Held', val: filteredHoldings.length, color: '#2962ff' },
          { label: 'Total Cost', val: `₹${totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: '#06b6d4' },
          { label: 'Market Value', val: `₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: '#8b5cf6' },
          { label: 'Overall P&L', val: `${totalPnl >= 0 ? '+' : ''}₹${Math.abs(totalPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: totalPnl >= 0 ? '#10b981' : '#ef4444' },
        ].map(c => (
          <Grid item xs={6} md={3} key={c.label}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</Typography>
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
      <div className="ag-theme-alpine-dark" style={{ height: 600, width: '100%' }}>
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
                <TableCell sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>Fund</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, py: 0.5, borderBottom: '1px solid #2a2e43' }}>Holding</TableCell>
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
                  'Q': 'Quant',
                  'J': 'JM Flexicap'
                };
                const fundDisplayName = FUND_CODE_TO_OFFICIAL_NAME[m.fund_code] || m.fund_name;
                const latestVal = m.latest_value;

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
                    <TableCell sx={{ py: 1, borderBottom: '1px solid rgba(42,46,67,0.3)', fontWeight: 500 }}>
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

export default Holdings;
