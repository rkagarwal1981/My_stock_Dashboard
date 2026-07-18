import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { useAppSelector } from '../store';
import { setTransactions, setImportHistory } from '../store/portfolioSlice';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import {
  Box, Typography, Card, CardContent, Grid, Button, Tab, Tabs,
  Chip, Alert, Snackbar
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import DownloadIcon from '@mui/icons-material/Download';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';

interface TransactionsProps {
  onViewStock: (scrip: string) => void;
}

const Transactions: React.FC<TransactionsProps> = ({ onViewStock }) => {
  const transactions = useAppSelector((state) => state.portfolio.transactions);
  const importHistory = useAppSelector((state) => state.portfolio.importHistory);
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('transactions');
  const [toast, setToast] = useState('');

  const handleScan = async () => {
    try {
      await axios.post('/api/transactions/scan');
      const [txRes, histRes] = await Promise.all([
        axios.get('/api/transactions'),
        axios.get('/api/transactions/history')
      ]);
      dispatch(setTransactions(txRes.data));
      dispatch(setImportHistory(histRes.data));
      setToast('Directory scanned successfully!');
    } catch {
      setToast('Scan failed.');
    }
  };

  const txColumns = [
    { field: 'transaction_date', headerName: 'Date', flex: 1.2, minWidth: 140,
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString('en-IN') : '' },
    { field: 'broker', headerName: 'Broker', flex: 0.8, minWidth: 90 },
    { field: 'script', headerName: 'Script', flex: 1.5, minWidth: 130,
      cellRenderer: (p: any) => (
        <span style={{ cursor: 'pointer', color: '#2962ff', fontWeight: 600 }} onClick={() => onViewStock(p.value)}>
          {p.value}
        </span>
      )
    },
    {
      field: 'buy_sell', headerName: 'Type', flex: 0.7, minWidth: 80,
      cellRenderer: (p: any) => (
        <Chip label={p.value} size="small"
          sx={{ bgcolor: p.value === 'BUY' ? '#10b98122' : '#ef444422', color: p.value === 'BUY' ? '#10b981' : '#ef4444', fontSize: 11, fontWeight: 700 }} />
      )
    },
    { field: 'quantity', headerName: 'Qty', flex: 0.7, minWidth: 80, type: 'numericColumn' },
    { field: 'price', headerName: 'Price', flex: 1, minWidth: 100, valueFormatter: (p: any) => `₹${Number(p.value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
    { field: 'net_amount', headerName: 'Net Amount', flex: 1.2, minWidth: 120, valueFormatter: (p: any) => `₹${Number(p.value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
    { field: 'exchange', headerName: 'Exchange', flex: 0.8, minWidth: 90 },
    { field: 'order_number', headerName: 'Order No.', flex: 1, minWidth: 110 },
  ];

  const histColumns = [
    { field: 'filename', headerName: 'File Name', flex: 2, minWidth: 200 },
    { field: 'broker', headerName: 'Broker', flex: 1, minWidth: 100 },
    { field: 'import_date', headerName: 'Imported At', flex: 1.5, minWidth: 160,
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleString('en-IN') : '' },
    { field: 'row_count', headerName: 'Records', flex: 0.8, minWidth: 90 },
    {
      field: 'status', headerName: 'Status', flex: 0.8, minWidth: 90,
      cellRenderer: (p: any) => (
        <Chip label={p.value} size="small"
          sx={{ bgcolor: p.value === 'SUCCESS' ? '#10b98122' : '#ef444422', color: p.value === 'SUCCESS' ? '#10b981' : '#ef4444', fontSize: 11 }} />
      )
    }
  ];

  return (
    <Box className="fade-in">
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Consolidated Portfolio</Typography>
          <Typography variant="body2" color="text.secondary">All transactions from all brokers</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={handleScan} size="small">
            Scan Import Folder
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} size="small"
            onClick={() => window.open('http://127.0.0.1:8000/api/settlement/export?format=excel', '_blank')}>
            Export LIFO Excel
          </Button>
        </Box>
      </Box>

      {/* Summary */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: 'Total Records', val: transactions.length },
          { label: 'BUY Orders', val: transactions.filter((t: any) => t.buy_sell === 'BUY').length },
          { label: 'SELL Orders', val: transactions.filter((t: any) => t.buy_sell === 'SELL').length },
          { label: 'Files Imported', val: importHistory.length },
        ].map(c => (
          <Grid item xs={6} md={3} key={c.label}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>{c.val}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2, borderBottom: '1px solid #2a2e43' }}>
        <Tab label="All Transactions" value="transactions" />
        <Tab label="Import History" value="history" />
      </Tabs>

      <div className="ag-theme-alpine-dark" style={{ height: 520, width: '100%' }}>
        {activeTab === 'transactions' ? (
          <AgGridReact
            theme="legacy"
            rowData={transactions}
            columnDefs={txColumns as any}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            pagination={true} paginationPageSize={20} animateRows={true}
          />
        ) : (
          <AgGridReact
            theme="legacy"
            rowData={importHistory}
            columnDefs={histColumns as any}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            pagination={true} paginationPageSize={20} animateRows={true}
          />
        )}
      </div>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="info" onClose={() => setToast('')}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
};

export default Transactions;
