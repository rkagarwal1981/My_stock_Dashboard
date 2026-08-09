import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppSelector } from '../store';
import axios from 'axios';
import {
  Box, Grid, Card, CardContent, Typography, Divider, Button,
  FormControl, InputLabel, Select, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
} from '@mui/material';
import {
  ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ReferenceLine
} from 'recharts';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import StorefrontIcon from '@mui/icons-material/Storefront';
import CachedIcon from '@mui/icons-material/Cached';

const COLORS = ['#2962ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

interface DashboardProps {
  onViewStock: (scrip: string) => void;
  onScrape: (broker: string) => void;
}

const SummaryCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  positive?: boolean | null;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, subtitle, positive, icon, color }) => (
  <Card className="glass-panel fade-in" sx={{
    background: 'rgba(22, 24, 36, 0.7)',
    border: '1px solid #2a2e43',
    borderRadius: 2, height: '100%',
    transition: 'transform 0.2s, box-shadow 0.2s',
    '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 8px 32px ${color}30` }
  }}>
    <CardContent sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, color }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ mt: 0.5, color: positive === true ? '#10b981' : positive === false ? '#ef4444' : 'text.secondary' }}>
              {positive === true && <TrendingUpIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />}
              {positive === false && <TrendingDownIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />}
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: `${color}20`, color }}>{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

const Dashboard: React.FC<DashboardProps> = ({ onViewStock, onScrape }) => {
  const analytics = useAppSelector((state) => state.portfolio.analytics);
  const transactions = useAppSelector((state) => state.portfolio.transactions);

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedBroker, setSelectedBroker] = useState<string>('All');

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const fmtIndianShort = (v: number): string => {
    const absVal = Math.abs(v);
    const sign = v >= 0 ? '' : '-';
    if (absVal >= 100_000) {
      return `₹${sign}${parseFloat((absVal / 100_000).toFixed(2))}L`;
    }
    if (absVal >= 1_000) {
      return `₹${sign}${parseFloat((absVal / 1_000).toFixed(1))}K`;
    }
    return `₹${sign}${Math.round(absVal)}`;
  };

  const totalInvestment = analytics?.summary?.total_investment ?? 0;
  const totalMarketValue = analytics?.summary?.total_market_value ?? 0;
  const unrealizedPnl = analytics?.summary?.unrealized_pnl ?? 0;
  const realizedPnl = analytics?.summary?.realized_pnl ?? 0;
  const unrealizedPct = totalInvestment > 0 ? (unrealizedPnl / totalInvestment) * 100 : 0;

  // Extract unique months (YYYY-MM) dynamically from transactions
  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.transaction_date) {
        months.add(tx.transaction_date.substring(0, 7));
      }
    });
    return Array.from(months).sort().reverse();
  }, [transactions]);

  // Extract unique brokers dynamically from transactions
  const uniqueBrokers = useMemo(() => {
    const brokers = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.broker) {
        brokers.add(tx.broker);
      }
    });
    return Array.from(brokers).sort();
  }, [transactions]);

  // ── Capital Efficiency data from backend ──────────────────────────────────
  const [efficiencyData, setEfficiencyData] = useState<any[]>([]);

  const fetchEfficiency = useCallback(async () => {
    try {
      const params: any = {};
      if (selectedBroker !== 'All') params.broker = selectedBroker;
      const res = await axios.get('/api/analytics/capital-efficiency', { params });
      setEfficiencyData(res.data);
    } catch {
      setEfficiencyData([]);
    }
  }, [selectedBroker]);

  useEffect(() => { fetchEfficiency(); }, [fetchEfficiency]);

  // Map efficiency data by month for quick lookup
  const efficiencyMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const row of efficiencyData) {
      map[row.month] = row;
    }
    return map;
  }, [efficiencyData]);

  // Set default selected month to latest month
  useEffect(() => {
    if (uniqueMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(uniqueMonths[0]);
    }
  }, [uniqueMonths, selectedMonth]);

  const formatMonthYear = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatCompactValue = (v: number) => {
    if (!v) return '';
    if (v >= 100000) {
      return `₹${(v / 100000).toFixed(1)}L`;
    }
    if (v >= 1000) {
      return `₹${(v / 1000).toFixed(0)}K`;
    }
    return `₹${v}`;
  };

  // Compute daily buys/sells for the selected month and broker
  const dailyRotationData = useMemo(() => {
    if (!selectedMonth) return [];

    const dailyMap: { [day: string]: { purchase: number; sell: number } } = {};

    transactions.forEach((tx) => {
      if (!tx.transaction_date) return;
      const month = tx.transaction_date.substring(0, 7);
      if (month !== selectedMonth) return;

      if (selectedBroker !== 'All' && tx.broker !== selectedBroker) return;

      const dateStr = tx.transaction_date.substring(0, 10);
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { purchase: 0, sell: 0 };
      }

      const val = (tx.quantity ?? 0) * (tx.price ?? 0);
      if (tx.buy_sell?.toUpperCase() === 'BUY') {
        dailyMap[dateStr].purchase += val;
      } else if (tx.buy_sell?.toUpperCase() === 'SELL') {
        dailyMap[dateStr].sell += val;
      }
    });

    return Object.keys(dailyMap)
      .sort()
      .map((dateStr) => {
        const d = new Date(dateStr);
        const dayLabel = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        return {
          rawDate: dateStr,
          date: dayLabel,
          purchase: Math.round(dailyMap[dateStr].purchase),
          sell: Math.round(dailyMap[dateStr].sell),
        };
      });
  }, [transactions, selectedMonth, selectedBroker]);

  // Compute average daily buy & sell for trendlines
  const avgDailyBuy = useMemo(() => {
    if (dailyRotationData.length === 0) return 0;
    const sum = dailyRotationData.reduce((a, d) => a + d.purchase, 0);
    return Math.round(sum / dailyRotationData.length);
  }, [dailyRotationData]);

  const avgDailySell = useMemo(() => {
    if (dailyRotationData.length === 0) return 0;
    const sum = dailyRotationData.reduce((a, d) => a + d.sell, 0);
    return Math.round(sum / dailyRotationData.length);
  }, [dailyRotationData]);

  // Compute rotation summary cards data
  const rotationSummary = useMemo(() => {
    let totalPurchases = 0;
    let totalSales = 0;

    transactions.forEach((tx) => {
      if (!tx.transaction_date) return;
      const month = tx.transaction_date.substring(0, 7);
      if (month !== selectedMonth) return;

      if (selectedBroker !== 'All' && tx.broker !== selectedBroker) return;

      const val = (tx.quantity ?? 0) * (tx.price ?? 0);
      if (tx.buy_sell?.toUpperCase() === 'BUY') {
        totalPurchases += val;
      } else if (tx.buy_sell?.toUpperCase() === 'SELL') {
        totalSales += val;
      }
    });

    return {
      purchases: totalPurchases,
      sales: totalSales,
      rotated: totalPurchases + totalSales,
      netFlow: totalSales - totalPurchases,
    };
  }, [transactions, selectedMonth, selectedBroker]);

  // Compute monthly breakup table data
  const monthlyBreakupData = useMemo(() => {
    const monthlyMap: { [month: string]: { purchase: number; sell: number } } = {};

    transactions.forEach((tx) => {
      if (!tx.transaction_date) return;
      const month = tx.transaction_date.substring(0, 7);

      if (selectedBroker !== 'All' && tx.broker !== selectedBroker) return;

      if (!monthlyMap[month]) {
        monthlyMap[month] = { purchase: 0, sell: 0 };
      }

      const val = (tx.quantity ?? 0) * (tx.price ?? 0);
      if (tx.buy_sell?.toUpperCase() === 'BUY') {
        monthlyMap[month].purchase += val;
      } else if (tx.buy_sell?.toUpperCase() === 'SELL') {
        monthlyMap[month].sell += val;
      }
    });

    return Object.keys(monthlyMap)
      .sort()
      .reverse()
      .map((month) => {
        const purchase = monthlyMap[month].purchase;
        const sell = monthlyMap[month].sell;
        return {
          month,
          monthLabel: formatMonthYear(month),
          purchase: Math.round(purchase),
          sell: Math.round(sell),
          rotated: Math.round(purchase + sell),
          netFlow: Math.round(sell - purchase),
        };
      });
  }, [transactions, selectedBroker]);

  return (
    <Box className="fade-in">
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Portfolio Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">Real-time portfolio overview across all brokers</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {['mstock', 'mstock_ka', 'zerodha', 'dhan'].map(broker => {
            const labels: Record<string, string> = {
              mstock: 'MStock',
              mstock_ka: 'Mstock KA',
              zerodha: 'Zerodha',
              dhan: 'Dhan'
            };
            return (
              <Button
                key={broker}
                variant="outlined"
                size="small"
                startIcon={<StorefrontIcon />}
                onClick={() => onScrape(broker)}
                sx={{ textTransform: 'capitalize' }}
              >
                Sync {labels[broker]}
              </Button>
            );
          })}
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Total Investment"
            value={fmt(totalInvestment)}
            icon={<AccountBalanceWalletIcon />}
            color="#2962ff"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Market Value"
            value={fmt(totalMarketValue)}
            icon={<TrendingUpIcon />}
            color="#06b6d4"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Unrealized P&L"
            value={`${unrealizedPnl >= 0 ? '+' : '-'}${fmt(unrealizedPnl)}`}
            subtitle={fmtPct(unrealizedPct)}
            positive={unrealizedPnl >= 0}
            icon={unrealizedPnl >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
            color={unrealizedPnl >= 0 ? '#10b981' : '#ef4444'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Realized P&L"
            value={`${realizedPnl >= 0 ? '+' : '-'}${fmt(realizedPnl)}`}
            positive={realizedPnl >= 0}
            icon={realizedPnl >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
            color={realizedPnl >= 0 ? '#10b981' : '#ef4444'}
          />
        </Grid>
      </Grid>

      {/* Money Rotation Section */}
      <Card className="glass-panel" sx={{ background: 'rgba(22, 24, 36, 0.7)', border: '1px solid #2a2e43', borderRadius: 2, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CachedIcon color="primary" /> Money Rotation Analysis
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Daily buy vs sell comparison and rotation summary
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, minWidth: 320 }}>
            {/* Month Dropdown */}
            <FormControl size="small" sx={{ flexGrow: 1, minWidth: 150 }}>
              <InputLabel id="month-select-label" sx={{ color: 'text.secondary' }}>Select Month</InputLabel>
              <Select
                labelId="month-select-label"
                id="month-select"
                value={selectedMonth}
                label="Select Month"
                onChange={(e) => setSelectedMonth(e.target.value)}
                sx={{ 
                  color: 'text.primary', 
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a2e43' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' }
                }}
              >
                {uniqueMonths.map((m) => (
                  <MenuItem key={m} value={m}>
                    {formatMonthYear(m)}
                  </MenuItem>
                ))}
                {uniqueMonths.length === 0 && (
                  <MenuItem value="">No Data</MenuItem>
                )}
              </Select>
            </FormControl>

            {/* Broker Dropdown */}
            <FormControl size="small" sx={{ flexGrow: 1, minWidth: 150 }}>
              <InputLabel id="broker-select-label" sx={{ color: 'text.secondary' }}>Select Broker</InputLabel>
              <Select
                labelId="broker-select-label"
                id="broker-select"
                value={selectedBroker}
                label="Select Broker"
                onChange={(e) => setSelectedBroker(e.target.value)}
                sx={{ 
                  color: 'text.primary', 
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a2e43' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' }
                }}
              >
                <MenuItem value="All">All Brokers</MenuItem>
                {uniqueBrokers.map((b) => (
                  <MenuItem key={b} value={b}>
                    {b}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* Rotation Metrics Row */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid #2a2e43' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Total Purchases (Deployed)
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: '#10b981' }}>
                {fmt(rotationSummary.purchases)}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid #2a2e43' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Total Sales (Released)
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: '#ef4444' }}>
                {fmt(rotationSummary.sales)}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid #2a2e43' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Money Rotated (Volume)
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: '#2962ff' }}>
                {fmt(rotationSummary.rotated)}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid #2a2e43' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Net Cash Flow
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: rotationSummary.netFlow >= 0 ? '#10b981' : '#ef4444' }}>
                {rotationSummary.netFlow >= 0 ? '+' : '-'}{fmt(rotationSummary.netFlow)}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Daily Rotation Chart */}
        <Box sx={{ height: 380, width: '100%', mb: 4, mt: 1 }}>
          {dailyRotationData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dailyRotationData}
                margin={{ top: 25, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#94a3b8" 
                  tickLine={false}
                  style={{ fontSize: 12, fontWeight: 500 }}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : v >= 1000 ? `₹${(v/1000).toFixed(0)}K` : `₹${v}`}
                  style={{ fontSize: 11 }}
                />
                <Tooltip 
                  cursor={{ fill: 'none' }}
                  contentStyle={{ backgroundColor: '#161824', borderColor: '#2a2e43', borderRadius: 8 }}
                  itemStyle={{ fontSize: 13 }}
                  labelStyle={{ fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}
                  formatter={(value: any, name: any) => [
                    `₹${Number(value).toLocaleString('en-IN')}`, 
                    name === 'purchase' ? 'Total Buy' : 'Total Sell'
                  ]}
                />
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  formatter={(value) => value === 'purchase' ? 'Daily Purchase' : 'Daily Sell'}
                />
                {avgDailyBuy > 0 && (
                  <ReferenceLine
                    y={avgDailyBuy}
                    stroke="#FFFFFF"
                    strokeDasharray="4 4"
                    label={{
                      value: `Avg Buy: ${formatCompactValue(avgDailyBuy)}`,
                      fill: '#FFFFFF',
                      position: 'insideTopLeft',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  />
                )}
                {avgDailySell > 0 && (
                  <ReferenceLine
                    y={avgDailySell}
                    stroke="#FFFFFF"
                    strokeDasharray="4 4"
                    label={{
                      value: `Avg Sell: ${formatCompactValue(avgDailySell)}`,
                      fill: '#FFFFFF',
                      position: 'insideBottomLeft',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  />
                )}
                <Bar dataKey="purchase" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                  <LabelList 
                    dataKey="purchase" 
                    position="top" 
                    formatter={formatCompactValue}
                    style={{ fill: '#94a3b8', fontSize: 13, fontWeight: 600 }}
                  />
                </Bar>
                <Bar dataKey="sell" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                  <LabelList 
                    dataKey="sell" 
                    position="top" 
                    formatter={formatCompactValue}
                    style={{ fill: '#94a3b8', fontSize: 13, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.secondary">No transactions found for the selected month/broker filter.</Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 4 }} />

        {/* Monthly Breakup Table */}
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Monthly Rotation Breakup ({selectedBroker === 'All' ? 'All Brokers' : selectedBroker})
          </Typography>
          <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none', border: '1px solid #2a2e43', borderRadius: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="monthly breakup table">
              <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Month</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Total Purchase Value</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Total Sell Value</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Total Rotated (Volume)</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Net Cash Flow</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>%age of Net cash flow</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Trading Eff %</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Rotation Eff %</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Avg. Buy</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Avg. Sell</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid #2a2e43' }}>Realized Profit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {monthlyBreakupData.map((row) => (
                  <TableRow
                    key={row.month}
                    sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.01)' } }}
                  >
                    <TableCell component="th" scope="row" sx={{ color: 'text.primary', borderBottom: '1px solid #2a2e43', fontWeight: 500 }}>
                      {row.monthLabel}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#10b981', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                      {fmt(row.purchase)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#ef4444', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                      {fmt(row.sell)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#2962ff', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                      {fmt(row.rotated)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: row.netFlow >= 0 ? '#10b981' : '#ef4444', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                      {row.netFlow >= 0 ? '+' : '-'}{fmt(row.netFlow)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: row.netFlow >= 0 ? '#10b981' : '#ef4444', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                      {row.sell > 0 ? `${row.netFlow >= 0 ? '+' : ''}${((row.netFlow / row.sell) * 100).toFixed(1)}%` : '0.0%'}
                    </TableCell>
                    {(() => {
                      const eff = efficiencyMap[row.month];
                      return (
                        <>
                          <TableCell align="right" sx={{ color: '#8b5cf6', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                            {eff ? `${eff.trading_eff.toFixed(2)}%` : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ color: '#f59e0b', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                            {eff ? `${eff.rotation_eff.toFixed(2)}%` : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ color: '#06b6d4', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                            {eff ? fmtIndianShort(eff.avg_buy) : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ color: '#ef4444', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                            {eff ? fmtIndianShort(eff.avg_sell) : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ color: eff && eff.realized_profit >= 0 ? '#10b981' : '#ef4444', borderBottom: '1px solid #2a2e43', fontWeight: 600 }}>
                            {eff ? `${eff.realized_profit >= 0 ? '+' : '-'}${fmt(eff.realized_profit)}` : '—'}
                          </TableCell>
                        </>
                      );
                    })()}
                  </TableRow>
                ))}
                {monthlyBreakupData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                      No data available for the selected broker.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Card>
    </Box>
  );
};

export default Dashboard;
