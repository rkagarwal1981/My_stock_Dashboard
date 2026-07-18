import React, { useState } from 'react';
import { useAppSelector } from '../store';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Box, Typography, Card, CardContent, Grid, Chip, Tab, Tabs } from '@mui/material';

const AuditLogs: React.FC = () => {
  const logs = useAppSelector((state) => state.portfolio.auditLogs);
  const [filter, setFilter] = useState('all');

  const categories = ['all', 'LOGIN', 'IMPORT', 'REFRESH', 'SETTLEMENT', 'SYSTEM_ERROR'];
  const filtered = filter === 'all' ? logs : logs.filter((l: any) => l.category === filter);

  const catColor: Record<string, { bg: string; fg: string }> = {
    LOGIN: { bg: '#2962ff22', fg: '#2962ff' },
    IMPORT: { bg: '#10b98122', fg: '#10b981' },
    REFRESH: { bg: '#06b6d422', fg: '#06b6d4' },
    SETTLEMENT: { bg: '#8b5cf622', fg: '#8b5cf6' },
    SYSTEM_ERROR: { bg: '#ef444422', fg: '#ef4444' },
  };

  const columns = [
    { field: 'timestamp', headerName: 'Time', flex: 1.5, minWidth: 170,
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleString('en-IN') : '' },
    {
      field: 'category', headerName: 'Category', flex: 1, minWidth: 120,
      cellRenderer: (p: any) => {
        const c = catColor[p.value] || { bg: '#88888822', fg: '#888' };
        return <Chip label={p.value} size="small" sx={{ bgcolor: c.bg, color: c.fg, fontWeight: 600, fontSize: 11 }} />;
      }
    },
    { field: 'description', headerName: 'Description', flex: 3, minWidth: 300 },
    { field: 'details', headerName: 'Details', flex: 2, minWidth: 200 },
  ];

  const counts = categories.slice(1).map(c => ({ cat: c, count: logs.filter((l: any) => l.category === c).length }));

  return (
    <Box className="fade-in">
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Audit Logs</Typography>
        <Typography variant="body2" color="text.secondary">System activity and event history</Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {counts.map(c => (
          <Grid item xs={6} md={2.4} key={c.cat}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 10 }}>{c.cat}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: catColor[c.cat]?.fg || '#888' }}>{c.count}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={filter} onChange={(_, v) => setFilter(v)} sx={{ mb: 2, borderBottom: '1px solid #2a2e43' }}>
        {categories.map(c => <Tab key={c} label={c === 'all' ? `All (${logs.length})` : c} value={c} />)}
      </Tabs>

      <div className="ag-theme-alpine-dark" style={{ height: 520, width: '100%' }}>
        <AgGridReact
          theme="legacy"
          rowData={filtered}
          columnDefs={columns as any}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination={true} paginationPageSize={20} animateRows={true}
        />
      </div>
    </Box>
  );
};

export default AuditLogs;
