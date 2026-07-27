import React, { useState, useMemo } from 'react';
import { useAppSelector } from '../store';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Tab, Tabs
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import axios from 'axios';

interface LIFOSettlementProps {
  onViewStock: (scrip: string) => void;
}

const LIFOSettlement: React.FC<LIFOSettlementProps> = ({ onViewStock }) => {
  const settlement = useAppSelector((state) => state.portfolio.settlement);
  const [filter, setFilter] = useState('all');

  const handleExport = async (format: 'excel' | 'csv') => {
    try {
      const response = await axios.get(`/api/settlement/export?format=${format}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `LIFO_Settlement.${format === 'excel' ? 'xlsx' : 'csv'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export error:', err);
    }
  };

  const filtered = filter === 'all' ? settlement :
    settlement.filter((r: any) => r.comment?.toLowerCase().replace(' ', '_') === filter);

  const fmt = (v: any) => v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
  const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('en-IN') : '—';

  const statusColor = (s: string) => {
    if (s === 'Fully Settled') return { bg: '#10b98122', fg: '#10b981' };
    if (s === 'Partially Settled') return { bg: '#f59e0b22', fg: '#f59e0b' };
    return { bg: '#ef444422', fg: '#ef4444' };
  };

  const columns = useMemo(() => [
    { field: 'scrip', headerName: 'Script', flex: 1.5, minWidth: 140, pinned: 'left',
      cellRenderer: (p: any) => (
        <span style={{ cursor: 'pointer', color: '#2962ff', fontWeight: 700 }} onClick={() => onViewStock(p.value)}>
          {p.value}
        </span>
      )
    },
    { field: 'broker', headerName: 'Broker', flex: 0.8, minWidth: 90 },
    { field: 'buy_date', headerName: 'Buy Date', flex: 1, minWidth: 110, valueFormatter: (p: any) => fmtDate(p.value) },
    { field: 'sell_date', headerName: 'Sell Date', flex: 1, minWidth: 110, valueFormatter: (p: any) => fmtDate(p.value) },
    { field: 'qty', headerName: 'Buy Qty', flex: 0.8, minWidth: 90, type: 'numericColumn' },
    { field: 'sum_of_qty', headerName: 'Sell Qty', flex: 0.8, minWidth: 90, type: 'numericColumn' },
    { field: 'price', headerName: 'Buy Price', flex: 1, minWidth: 100, valueFormatter: (p: any) => fmt(p.value) },
    { field: 'average_of_price', headerName: 'Sell Price', flex: 1, minWidth: 100, valueFormatter: (p: any) => fmt(p.value) },
    { field: 'holding_days', headerName: 'Holding Days', flex: 0.9, minWidth: 110, type: 'numericColumn',
      valueFormatter: (p: any) => p.value != null ? `${p.value}d` : '—' },
    {
      field: 'pnl', headerName: 'P&L', flex: 1, minWidth: 110,
      cellStyle: (p: any) => ({
        color: p.value == null ? '#94a3b8' : p.value >= 0 ? '#10b981' : '#ef4444',
        fontWeight: 600
      }),
      valueFormatter: (p: any) => p.value != null ? `${p.value >= 0 ? '+' : ''}${fmt(p.value)}` : '—'
    },
    {
      field: 'comment', headerName: 'Status', flex: 1.2, minWidth: 140,
      cellRenderer: (p: any) => {
        if (!p.value) return null;
        const { bg, fg } = statusColor(p.value);
        return <Chip label={p.value} size="small" sx={{ bgcolor: bg, color: fg, fontWeight: 600, fontSize: 11 }} />;
      },
      cellStyle: (p: any) => {
        const { bg } = statusColor(p.value || '');
        return { backgroundColor: bg };
      }
    },
  ], [onViewStock]);

  const fullySett = settlement.filter((r: any) => r.comment === 'Fully Settled').length;
  const partiallySett = settlement.filter((r: any) => r.comment === 'Partially Settled').length;
  const unsettled = settlement.filter((r: any) => r.comment === 'Unsettled').length;
  const realizedPnl = settlement.reduce((s: number, r: any) => s + (r.pnl ?? 0), 0);

  return (
    <Box className="fade-in">
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>LIFO Settlement</Typography>
          <Typography variant="body2" color="text.secondary">Last-In-First-Out buy/sell matching analysis</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} size="small"
            onClick={() => handleExport('excel')}>
            Export Excel
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} size="small"
            onClick={() => handleExport('csv')}>
            Export CSV
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: 'Fully Settled', val: fullySett, color: '#10b981' },
          { label: 'Partially Settled', val: partiallySett, color: '#f59e0b' },
          { label: 'Unsettled', val: unsettled, color: '#ef4444' },
          { label: 'Realized P&L', val: `${realizedPnl >= 0 ? '+' : ''}₹${Math.abs(realizedPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: realizedPnl >= 0 ? '#10b981' : '#ef4444' },
        ].map(c => (
          <Grid size={{ xs: 6, md: 3 }} key={c.label}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: c.color }}>{c.val}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={filter} onChange={(_, v) => setFilter(v)} sx={{ mb: 2, borderBottom: '1px solid #2a2e43' }}>
        <Tab label={`All (${settlement.length})`} value="all" />
        <Tab label={`Fully Settled (${fullySett})`} value="fully_settled" />
        <Tab label={`Partially Settled (${partiallySett})`} value="partially_settled" />
        <Tab label={`Unsettled (${unsettled})`} value="unsettled" />
      </Tabs>

      <div className="ag-theme-alpine-dark" style={{ height: 540, width: '100%' }}>
        <AgGridReact
          theme="legacy"
          rowData={filtered}
          columnDefs={columns as any}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination={true} paginationPageSize={25} animateRows={true}
          getRowStyle={(p: any) => {
            const comment = p.data?.comment;
            if (comment === 'Fully Settled') return { borderLeft: '3px solid #10b981' };
            if (comment === 'Partially Settled') return { borderLeft: '3px solid #f59e0b' };
            if (comment === 'Unsettled') return { borderLeft: '3px solid #ef4444' };
            return {};
          }}
        />
      </div>
    </Box>
  );
};

export default LIFOSettlement;
