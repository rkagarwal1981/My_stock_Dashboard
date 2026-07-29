import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import {
  Box, Typography, Card, CardContent, Grid, Button, Tab, Tabs, Chip, CircularProgress
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import StorefrontIcon from '@mui/icons-material/Storefront';

interface OrderBookProps {
  onViewStock: (scrip: string) => void;
}

const OrderBook: React.FC<OrderBookProps> = ({ onViewStock }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [gridApi, setGridApi] = useState<any>(null);

  const fetchOrders = async () => {
    try {
      const res = await axios.get('/api/executed-orders');
      setOrders(res.data);
    } catch (err) {
      console.error('Failed to fetch executed orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // Poll every 10 seconds to update LTPs and P&L dynamically
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const fmt = (n: any) => {
    if (n == null || isNaN(n)) return '—';
    return `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
  };

  const columnDefs = useMemo(() => [
    {
      field: 'broker',
      headerName: 'Broker',
      flex: 1,
      minWidth: 100,
      cellRenderer: (p: any) => {
        const colors: Record<string, string> = { MStock: '#2962ff', Zerodha: '#f59e0b', Dhan: '#10b981' };
        return (
          <Chip
            label={p.value}
            size="small"
            sx={{
              bgcolor: `${colors[p.value] || '#888'}22`,
              color: colors[p.value] || '#888',
              fontSize: 11,
              fontWeight: 600
            }}
          />
        );
      }
    },
    {
      field: 'script',
      headerName: 'Script',
      flex: 1.5,
      minWidth: 140,
      cellRenderer: (p: any) => {
        const displayVal = p.value && p.value.endsWith('-EQ') ? p.value.substring(0, p.value.length - 3) : (p.value || '');
        return (
          <span
            style={{ cursor: 'pointer', color: '#2962ff', fontWeight: 600 }}
            onClick={() => onViewStock(p.value)}
          >
            {displayVal}
          </span>
        );
      }
    },
    {
      field: 'buy_sell',
      headerName: 'Type',
      flex: 0.8,
      minWidth: 90,
      cellRenderer: (p: any) => {
        const isBuy = p.value === 'BUY';
        return (
          <Chip
            label={p.value}
            size="small"
            sx={{
              bgcolor: isBuy ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: isBuy ? '#10b981' : '#ef4444',
              fontWeight: 700,
              fontSize: 10
            }}
          />
        );
      }
    },
    {
      field: 'quantity',
      headerName: 'Qty',
      flex: 0.8,
      minWidth: 80,
      type: 'numericColumn',
      headerClass: 'grid-header-center',
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {p.value != null ? p.value.toLocaleString('en-IN') : '—'}
        </span>
      )
    },
    {
      field: 'price',
      headerName: 'Traded Price',
      flex: 1.1,
      minWidth: 110,
      type: 'numericColumn',
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
      type: 'numericColumn',
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {fmt(p.value)}
        </span>
      )
    },
    {
      field: 'amount',
      headerName: 'Amount',
      flex: 1.2,
      minWidth: 120,
      type: 'numericColumn',
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {fmt(p.value)}
        </span>
      )
    },
    {
      field: 'pnl',
      headerName: 'P&L',
      flex: 1.1,
      minWidth: 110,
      type: 'numericColumn',
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
      field: 'pnl_pct',
      headerName: 'P&L %',
      flex: 1.1,
      minWidth: 100,
      type: 'numericColumn',
      cellRenderer: (p: any) => {
        if (p.value == null) return '—';
        const color = p.value >= 0 ? '#10b981' : '#ef4444';
        return (
          <span style={{ color, fontWeight: 600, display: 'block', textAlign: 'right', width: '100%' }}>
            {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
          </span>
        );
      }
    }
  ], [onViewStock]);

  const handleExport = () => {
    if (gridApi) {
      gridApi.exportDataAsCsv({ fileName: `Executed_Orders_${new Date().toISOString().split('T')[0]}.csv` });
    }
  };

  const groupedOrders = useMemo(() => {
    const groups: { [key: string]: any } = {};

    orders.forEach((o) => {
      const key = `${o.script}_${o.buy_sell}`;
      if (!groups[key]) {
        groups[key] = {
          broker: o.broker,
          script: o.script,
          buy_sell: o.buy_sell,
          quantity: 0,
          total_cost: 0,
          ltp: o.ltp || 0,
          amount: 0,
          pnl: 0
        };
      }
      groups[key].quantity += o.quantity || 0;
      groups[key].total_cost += (o.quantity || 0) * (o.price || 0);
      groups[key].amount += o.amount || 0;
      groups[key].pnl += o.pnl || 0;
      if (o.ltp) {
        groups[key].ltp = o.ltp;
      }
    });

    return Object.values(groups).map((g: any) => {
      const avgPrice = g.quantity > 0 ? g.total_cost / g.quantity : 0;
      const pnlPct = g.total_cost > 0 ? (g.pnl / g.total_cost) * 100 : 0;

      return {
        broker: g.broker,
        script: g.script,
        buy_sell: g.buy_sell,
        quantity: g.quantity,
        price: avgPrice,
        ltp: g.ltp,
        amount: g.amount,
        pnl: g.pnl,
        pnl_pct: pnlPct
      };
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return groupedOrders;
    return groupedOrders.filter(o => o.broker?.toLowerCase() === activeTab.toLowerCase());
  }, [groupedOrders, activeTab]);

  const summary = useMemo(() => {
    let purchases = 0;
    let sales = 0;
    filteredOrders.forEach(o => {
      const amt = o.amount || 0;
      if (o.buy_sell === 'BUY') {
        purchases += amt;
      } else if (o.buy_sell === 'SELL') {
        sales += amt;
      }
    });
    const netFlow = sales - purchases;
    const netFlowPct = sales > 0 ? (netFlow / sales) * 100 : 0;
    return { purchases, sales, netFlow, netFlowPct };
  }, [filteredOrders]);

  const brokers = ['all', 'MStock', 'Zerodha'];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="fade-in">
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Executed Order Book</Typography>
          <Typography variant="body2" color="text.secondary">Today's intraday order executions and trade logs</Typography>
        </Box>
        <Button variant="outlined" color="primary" startIcon={<DownloadIcon />} size="small" onClick={handleExport}>
          Export CSV
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Purchase Value', val: fmt(summary.purchases), color: '#10b981' },
          { label: 'Total Sell Value', val: fmt(summary.sales), color: '#ef4444' },
          { label: 'Net Cash Flow', val: `${summary.netFlow >= 0 ? '+' : ''}${fmt(summary.netFlow)}`, color: summary.netFlow >= 0 ? '#10b981' : '#ef4444' },
          { label: '%age of Net Cash Flow', val: `${summary.netFlowPct >= 0 ? '+' : ''}${summary.netFlowPct.toFixed(2)}%`, color: summary.netFlowPct >= 0 ? '#10b981' : '#ef4444' },
        ].map(c => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={c.label}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{c.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: c.color }}>{c.val}</Typography>
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
      <div className="ag-theme-alpine-dark" style={{ height: 950, width: '100%' }}>
        <AgGridReact
          theme="legacy"
          rowData={filteredOrders}
          columnDefs={columnDefs as any}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination={true}
          paginationPageSize={20}
          paginationPageSizeSelector={[10, 20, 50]}
          onGridReady={(params) => setGridApi(params.api)}
          animateRows={true}
        />
      </div>
    </Box>
  );
};

export default OrderBook;
