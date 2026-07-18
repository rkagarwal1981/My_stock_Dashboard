import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, Grid, Button, Divider,
  CircularProgress, Chip, Table, TableBody, TableCell, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Radio, RadioGroup, FormControlLabel,
  Tooltip, Autocomplete
} from '@mui/material';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import FlagIcon from '@mui/icons-material/Flag';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, LabelList
} from 'recharts';

interface StockSummaryProps {
  scrip: string;
  onBack: () => void;
  scripList?: string[];
  onSelectScrip?: (scrip: string) => void;
  onRefreshData?: () => void;
}

const BOOKMARK_COLORS: { key: string; color: string; label: string }[] = [
  { key: 'red', color: '#ef4444', label: 'Red' },
  { key: 'orange', color: '#f59e0b', label: 'Orange' },
  { key: 'yellow', color: '#eab308', label: 'Yellow' },
  { key: 'green', color: '#10b981', label: 'Green' },
  { key: 'blue', color: '#2962ff', label: 'Blue' },
];

const EMPTY_TARGET_FORM = {
  type: 'Buy',
  target_price: '',
  category: '',
  comment: '',
  bookmark: '',
};

const StockSummary: React.FC<StockSummaryProps> = ({
  scrip,
  onBack,
  scripList,
  onSelectScrip,
  onRefreshData
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [chartMode, setChartMode] = useState<'qty' | 'price'>('qty');

  // Target setting state for this scrip
  const [scripTargets, setScripTargets] = useState<any[]>([]);

  // Target dialog state (shared create/edit)
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null); // null = create mode
  const [targetForm, setTargetForm] = useState({ ...EMPTY_TARGET_FORM });

  // Categories for the target form
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const loadStockData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/stock/${encodeURIComponent(scrip)}`);
      setData(res.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to load stock data.');
    } finally {
      setLoading(false);
    }
  };

  const loadScripTargets = useCallback(async () => {
    try {
      const res = await axios.get('/api/targets');
      const all = res.data || [];
      setScripTargets(all.filter((t: any) => t.script === scrip));
    } catch (e) {
      console.error('Failed to load targets:', e);
    }
  }, [scrip]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await axios.get('/api/target-categories');
      setCategories(res.data);
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  }, []);

  useEffect(() => {
    loadStockData();
    loadScripTargets();
    loadCategories();
  }, [scrip]);

  // ─── Target Dialog helpers ──────────────────────────────────────────────────

  const openCreateDialog = () => {
    setEditTarget(null);
    setTargetForm({ ...EMPTY_TARGET_FORM });
    setTargetDialogOpen(true);
  };

  const openEditDialog = (t: any) => {
    setEditTarget(t);
    setTargetForm({
      type: t.type || 'Buy',
      target_price: t.target_price != null ? String(t.target_price) : '',
      category: t.category || '',
      comment: t.comment || '',
      bookmark: t.bookmark || '',
    });
    setTargetDialogOpen(true);
  };

  const closeTargetDialog = () => {
    setTargetDialogOpen(false);
    setEditTarget(null);
    setTargetForm({ ...EMPTY_TARGET_FORM });
  };

  const handleAddOrSaveTarget = async () => {
    if (!targetForm.target_price) return;
    try {
      if (editTarget) {
        // Edit mode — PUT (backend will auto-overwrite date)
        await axios.put(`/api/targets/${editTarget.id}`, {
          type: targetForm.type,
          target_price: parseFloat(targetForm.target_price),
          category: targetForm.category || null,
          comment: targetForm.comment || null,
          bookmark: targetForm.bookmark || null,
        });
      } else {
        // Create mode — POST
        await axios.post('/api/targets', {
          script: scrip,
          type: targetForm.type,
          target_price: parseFloat(targetForm.target_price),
          category: targetForm.category || null,
          comment: targetForm.comment || null,
          bookmark: targetForm.bookmark || null,
        });
      }
      closeTargetDialog();
      loadScripTargets();
      if (onRefreshData) onRefreshData();
    } catch (e) {
      console.error('Failed to save target:', e);
    }
  };

  const handleDeleteTarget = async (id: number) => {
    try {
      await axios.delete(`/api/targets/${id}`);
      loadScripTargets();
      if (onRefreshData) onRefreshData();
    } catch (e) {
      console.error('Failed to delete target:', e);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await axios.post('/api/target-categories', { name: newCategoryName.trim() });
      setNewCategoryName('');
      setCategoryDialogOpen(false);
      loadCategories();
    } catch (e) {
      console.error('Failed to add category:', e);
    }
  };

  // ─── Formatting ─────────────────────────────────────────────────────────────

  const fmt = (v: number | null) => v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
  const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('en-IN') : '—';

  // ─── Navigation ─────────────────────────────────────────────────────────────

  const currentIndex = scripList ? scripList.indexOf(scrip) : -1;

  const handlePrev = () => {
    if (scripList && currentIndex > 0 && onSelectScrip) {
      onSelectScrip(scripList[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (scripList && currentIndex < scripList.length - 1 && onSelectScrip) {
      onSelectScrip(scripList[currentIndex + 1]);
    }
  };

  // ─── Chart ──────────────────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    if (!data) return [];

    const dateMap: {
      [dateStr: string]: {
        date: string;
        buyQty: number;
        sellQty: number;
        buyValue?: number;
        sellValue?: number;
        pnl: number;
        holdingDaysSum: number;
        holdingDaysCount: number;
      };
    } = {};

    const getDateStr = (d: any) => {
      if (!d) return '';
      return d.split('T')[0].split(' ')[0];
    };

    (data.timeline ?? []).forEach((t: any) => {
      const dStr = getDateStr(t.date);
      if (!dStr) return;

      if (!dateMap[dStr]) {
        dateMap[dStr] = {
          date: dStr,
          buyQty: 0,
          sellQty: 0,
          buyValue: 0,
          sellValue: 0,
          pnl: 0,
          holdingDaysSum: 0,
          holdingDaysCount: 0
        };
      }

      if (t.buy_sell === 'BUY') {
        dateMap[dStr].buyQty += Number(t.quantity);
        dateMap[dStr].buyValue = (dateMap[dStr].buyValue ?? 0) + (Number(t.quantity) * Number(t.price));
      } else if (t.buy_sell === 'SELL') {
        dateMap[dStr].sellQty += Number(t.quantity);
        dateMap[dStr].sellValue = (dateMap[dStr].sellValue ?? 0) + (Number(t.quantity) * Number(t.price));
      }
    });

    (data.settlement_history ?? []).forEach((sh: any) => {
      const dStr = getDateStr(sh.sell_date);
      if (!dStr) return;

      if (!dateMap[dStr]) {
        dateMap[dStr] = {
          date: dStr,
          buyQty: 0,
          sellQty: 0,
          buyValue: 0,
          sellValue: 0,
          pnl: 0,
          holdingDaysSum: 0,
          holdingDaysCount: 0
        };
      }

      if (sh.pnl != null) {
        dateMap[dStr].pnl += Number(sh.pnl);
      }

      if (sh.holding_days != null) {
        const qty = sh.qty ?? sh.sum_of_qty ?? 1;
        dateMap[dStr].holdingDaysSum += Number(sh.holding_days) * Number(qty);
        dateMap[dStr].holdingDaysCount += Number(qty);
      }
    });

    return Object.values(dateMap)
      .map(item => ({
        ...item,
        buyPrice: item.buyQty > 0 ? (item.buyValue ?? 0) / item.buyQty : 0,
        sellPrice: item.sellQty > 0 ? (item.sellValue ?? 0) / item.sellQty : 0,
        holdingDays: item.holdingDaysCount > 0 ? (item.holdingDaysSum / item.holdingDaysCount) : null
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const buyItems = useMemo(() => chartData.filter(d => d.buyQty > 0), [chartData]);
  const sellItems = useMemo(() => chartData.filter(d => d.sellQty > 0), [chartData]);

  const calculateRowReturn = (r: any) => {
    const buyPrice = Number(r.price || 0);
    const qty = Number(r.qty ?? r.sum_of_qty ?? 0);
    const pnl = Number(r.pnl ?? 0);
    const buyingAmount = buyPrice * qty;
    if (buyingAmount <= 0) return 0;
    return (pnl / buyingAmount) * 100;
  };

  const totalReturnPct = useMemo(() => {
    if (!data || !data.settlement_history || data.settlement_history.length === 0) return 0;

    let totalBuyingAmount = 0;
    let totalPnl = 0;

    data.settlement_history.forEach((r: any) => {
      const qty = Number(r.qty ?? r.sum_of_qty ?? 0);
      const buyPrice = Number(r.price || 0);
      const pnl = Number(r.pnl ?? 0);
      if (buyPrice <= 0 || qty <= 0) return;

      totalBuyingAmount += buyPrice * qty;
      totalPnl += pnl;
    });

    if (totalBuyingAmount <= 0) return 0;
    return (totalPnl / totalBuyingAmount) * 100;
  }, [data]);

  const latestTx = data?.timeline && data.timeline.length > 0 ? data.timeline[0] : null;
  const dipInfo = useMemo(() => {
    if (!latestTx || data?.ltp == null) return null;
    const txPrice = latestTx.price || 0;
    const ltp = data.ltp || 0;
    const dip = ltp - txPrice;
    const dipPct = txPrice > 0 ? (dip / txPrice) * 100 : 0;
    return {
      type: latestTx.buy_sell === 'BUY' ? 'Buy' : 'Sell',
      price: txPrice,
      dip,
      dipPct
    };
  }, [latestTx, data]);

  // ─── Chart label renderers ───────────────────────────────────────────────────

  const renderBuyLabel = (props: any) => {
    const { x, y, width, value, index } = props;
    if (!value || value === 0) return null;
    const item = buyItems[index];
    if (!item) return null;
    const buyVal = item.buyValue ?? 0;
    const formattedVal = Math.round(buyVal).toLocaleString('en-IN');
    return (
      <text
        x={x + width / 2}
        y={y - 20}
        fill="#10b981"
        fontSize={13}
        fontWeight={600}
        textAnchor="middle"
      >
        <tspan x={x + width / 2} dy="0">{`+${value}`}</tspan>
        <tspan x={x + width / 2} dy="14">{formattedVal}</tspan>
      </text>
    );
  };

  const renderSellLabel = (props: any) => {
    const { x, y, width, value, index } = props;
    if (!value || value === 0) return null;
    const item = sellItems[index];
    if (!item) return null;
    const sellVal = item.sellValue ?? 0;
    const formattedVal = Math.round(sellVal).toLocaleString('en-IN');
    return (
      <text
        x={x + width / 2}
        y={y - 20}
        fill="#ef4444"
        fontSize={13}
        fontWeight={600}
        textAnchor="middle"
      >
        <tspan x={x + width / 2} dy="0">{`-${value}`}</tspan>
        <tspan x={x + width / 2} dy="14">{formattedVal}</tspan>
      </text>
    );
  };

  const renderBuyPriceLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!value || value === 0) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill="#10b981"
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
      >
        {`₹${Math.round(value).toLocaleString('en-IN')}`}
      </text>
    );
  };

  const renderSellPriceLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!value || value === 0) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill="#ef4444"
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
      >
        {`₹${Math.round(value).toLocaleString('en-IN')}`}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <Box sx={{
          background: '#161824',
          border: '1px solid #2a2e43',
          borderRadius: 2,
          p: 1.5,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: '#cbd5e1' }}>
            {fmtDate(item.date)}
          </Typography>
          {item.buyQty > 0 && (
            <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600 }}>
              Bought: {item.buyQty} shares {item.buyPrice > 0 ? `@ ${fmt(Math.round(item.buyPrice))}` : ''}
            </Typography>
          )}
          {item.sellQty > 0 && (
            <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 600 }}>
              Sold: {item.sellQty} shares {item.sellPrice > 0 ? `@ ${fmt(Math.round(item.sellPrice))}` : ''}
            </Typography>
          )}
          {item.pnl !== 0 && item.pnl != null && (
            <Typography variant="body2" sx={{ color: item.pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 700, mt: 0.5 }}>
              Realized P&L: {item.pnl >= 0 ? '+' : ''}₹{Number(item.pnl).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </Typography>
          )}
          {item.holdingDays !== null && item.holdingDays !== undefined && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11, mt: 0.5 }}>
              Avg Holding: {Math.round(item.holdingDays)} days
            </Typography>
          )}
        </Box>
      );
    }
    return null;
  };

  // ─── Loading / Error states ──────────────────────────────────────────────────

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
      <CircularProgress />
    </Box>
  );

  if (error) return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>Back</Button>
      <Typography color="error">{error}</Typography>
    </Box>
  );

  const unrealizedPct = data?.avg_price > 0 ? ((data.ltp - data.avg_price) / data.avg_price * 100) : 0;

  return (
    <Box className="fade-in">
      {/* Top Header Navigation */}
      <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ textTransform: 'none' }}>
          Back to Holdings
        </Button>

        {scripList && scripList.length > 0 && onSelectScrip && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              sx={{ color: 'text.primary', '&.Mui-disabled': { color: 'text.disabled' } }}
            >
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>

            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="stock-select-label">Select Stock</InputLabel>
              <Select
                labelId="stock-select-label"
                value={scrip}
                label="Select Stock"
                onChange={(e) => onSelectScrip(e.target.value as string)}
                sx={{ borderRadius: 2 }}
              >
                {scripList.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <IconButton
              onClick={handleNext}
              disabled={currentIndex >= scripList.length - 1}
              sx={{ color: 'text.primary', '&.Mui-disabled': { color: 'text.disabled' } }}
            >
              <ArrowForwardIosIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>{scrip}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Stock Summary & Settlement History</Typography>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Current Qty', val: data.current_quantity, color: '#2962ff' },
          { label: 'Avg Buy Price', val: fmt(data.avg_price), color: '#94a3b8' },
          { label: 'LTP', val: fmt(data.ltp), color: '#06b6d4' },
          { label: 'Market Value', val: fmt(data.current_value), color: '#8b5cf6' },
          { label: 'Unrealized P&L', val: `${data.unrealized_pnl >= 0 ? '+' : ''}${fmt(data.unrealized_pnl)}`, color: data.unrealized_pnl >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Return %', val: `${unrealizedPct >= 0 ? '+' : ''}${unrealizedPct.toFixed(2)}%`, color: unrealizedPct >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Realized Profit', val: fmt(data.realized_profit), color: '#10b981' },
          { label: 'Realized Loss', val: `-${fmt(data.realized_loss)}`, color: '#ef4444' },
          { label: 'Total Return %', val: `${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%`, color: totalReturnPct >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Current PE', val: data.current_pe != null ? Number(data.current_pe).toFixed(2) : '—', color: '#f59e0b' },
          { label: '3Y Avg PE', val: data.avg_pe_3y != null ? Number(data.avg_pe_3y).toFixed(2) : '—', color: '#ec4899' },
        ].map(c => (
          <Grid item xs={6} sm={4} md={3} key={c.label}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10 }}>{c.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: c.color }}>{c.val}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Chart Section */}
      {chartData.length > 0 && (
        <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Transaction Flow & Realized Profitability
              </Typography>
              <RadioGroup
                row
                value={chartMode}
                onChange={(e) => setChartMode(e.target.value as 'qty' | 'price')}
                sx={{ color: 'text.secondary' }}
              >
                <FormControlLabel
                  value="qty"
                  control={<Radio size="small" sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#2962ff' } }} />}
                  label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Quantity</Typography>}
                />
                <FormControlLabel
                  value="price"
                  control={<Radio size="small" sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#2962ff' } }} />}
                  label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Price</Typography>}
                />
              </RadioGroup>
            </Box>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e43" />
                <XAxis
                  dataKey="date"
                  tickFormatter={v => {
                    const parts = v.split('-');
                    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : v;
                  }}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <YAxis
                  label={{
                    value: chartMode === 'qty' ? 'Shares (Qty)' : 'Price (₹)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 0,
                    style: { fill: '#94a3b8', fontSize: 12 }
                  }}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={chartMode === 'price' ? (v) => `₹${Math.round(v).toLocaleString('en-IN')}` : undefined}
                />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                {chartMode === 'qty' ? (
                  <>
                    <Bar dataKey="buyQty" name="Bought Qty" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false}>
                      <LabelList dataKey="buyQty" content={renderBuyLabel} />
                    </Bar>
                    <Bar dataKey="sellQty" name="Sold Qty" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false}>
                      <LabelList dataKey="sellQty" content={renderSellLabel} />
                    </Bar>
                  </>
                ) : (
                  <>
                    <Bar dataKey="buyPrice" name="Bought Price" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false}>
                      <LabelList dataKey="buyPrice" content={renderBuyPriceLabel} />
                    </Bar>
                    <Bar dataKey="sellPrice" name="Sold Price" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false}>
                      <LabelList dataKey="sellPrice" content={renderSellPriceLabel} />
                    </Bar>
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Details Sections: 3-column grid ─────────────────────────────────────── */}
      {/*   Col 1: Broker Holdings (top) + Active Targets (bottom)                  */}
      {/*   Col 2: Transaction Timeline                                              */}
      {/*   Col 3: Settlement History                                                */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '2.2fr 2.5fr 3.3fr' },
        gap: 2,
        mb: 3,
        alignItems: 'stretch'
      }}>

        {/* ── Column 1: Broker Holdings (top) + Active Targets (bottom) ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Broker Holdings Card */}
          <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, flexShrink: 0 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Broker Holdings</Typography>
              <Box sx={{ pr: 0.5 }}>
                {dipInfo ? (() => {
                  const dipValFormatted = dipInfo.dip >= 0
                    ? `+₹${dipInfo.dip.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `-₹${Math.abs(dipInfo.dip).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  const dipPctFormatted = `${dipInfo.dipPct >= 0 ? '+' : ''}${dipInfo.dipPct.toFixed(2)}%`;
                  return (
                    <Typography
                      sx={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: dipInfo.dip >= 0 ? '#10b981' : '#ef4444'
                      }}
                    >
                      {dipInfo.type} | {dipValFormatted} | {dipPctFormatted}
                    </Typography>
                  );
                })() : (
                  <Typography color="text.secondary" variant="body2" sx={{ fontSize: '18px' }}>
                    No recent transaction info
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Active Targets Card — relocated from column 2 */}
          <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: 'calc(100% - 48px)' }}>

              {/* Header row with +Add Target button */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrackChangesIcon sx={{ color: '#2962ff', fontSize: 20 }} />
                  Active Targets
                </Typography>
                <Button
                  id="add-target-btn-details"
                  startIcon={<AddIcon />}
                  variant="contained"
                  size="small"
                  onClick={openCreateDialog}
                  sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
                >
                  Add Target
                </Button>
              </Box>

              {/* Target list */}
              <Box sx={{ overflowY: 'auto', pr: 0.5, flex: 1, maxHeight: 350 }}>
                {scripTargets.length > 0 ? scripTargets.map((t: any) => {
                  const bookmarkColor = t.bookmark
                    ? ({ red: '#ef4444', orange: '#f59e0b', yellow: '#eab308', green: '#10b981', blue: '#2962ff' }[t.bookmark as string] || '#64748b')
                    : null;
                  return (
                    <Box key={t.id} sx={{ mb: 2, pb: 1.5, borderBottom: '1px solid #2a2e43' }}>
                      {/* Row 1: chips + date + action icons */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Chip
                            label={t.type}
                            size="small"
                            sx={{
                              bgcolor: t.type === 'Buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                              color: t.type === 'Buy' ? '#10b981' : '#ef4444',
                              fontWeight: 700, fontSize: 10
                            }}
                          />
                          {t.category && (
                            <Chip label={t.category} size="small" sx={{ bgcolor: 'rgba(41,98,255,0.1)', color: '#2962ff', fontSize: 10 }} />
                          )}
                          {bookmarkColor && <FlagIcon sx={{ fontSize: 14, color: bookmarkColor }} />}
                          {t.triggered && <Chip label="TRIGGERED" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.2)', color: '#10b981', fontSize: 9, fontWeight: 800 }} />}
                        </Box>
                        {/* Date + Edit + Delete */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {t.date ? new Date(t.date).toLocaleDateString('en-IN') : ''}
                          </Typography>
                          <Tooltip title="Edit target">
                            <IconButton
                              size="small"
                              onClick={() => openEditDialog(t)}
                              sx={{ p: 0.3, color: '#64748b', '&:hover': { color: '#2962ff' } }}
                            >
                              <EditIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete target">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteTarget(t.id)}
                              sx={{ p: 0.3 }}
                            >
                              <DeleteIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>

                      {/* Row 2: Target price + distance */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                          Target: {fmt(t.target_price)}
                        </Typography>
                        {t.distance_pct != null && (
                          <Typography sx={{
                            fontSize: 12, fontWeight: 600,
                            color: Math.abs(t.distance_pct) <= 5 ? '#10b981' : Math.abs(t.distance_pct) <= 15 ? '#f59e0b' : '#ef4444'
                          }}>
                            {t.distance_pct >= 0 ? '+' : ''}{t.distance_pct.toFixed(2)}% away
                          </Typography>
                        )}
                      </Box>

                      {/* Row 3: Comment */}
                      {t.comment && (
                        <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: 12, mt: 0.5 }}>
                          {t.comment}
                        </Typography>
                      )}
                    </Box>
                  );
                }) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    No targets set for this stock yet.<br />Click <strong>Add Target</strong> to create one.
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* ── Column 2: Transaction Timeline ── */}
        <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: 'calc(100% - 48px)' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Transaction Timeline</Typography>
            <Box sx={{ overflowY: 'auto', pr: 0.5, flex: 1, maxHeight: 600 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {['Date', 'Broker', 'Type', 'Qty', 'Price', 'Value'].map(h => (
                      <TableCell
                        key={h}
                        align={h === 'Price' || h === 'Value' ? 'right' : 'left'}
                        sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11, py: 1, bgcolor: '#161824' }}
                      >
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.timeline ?? []).map((t: any, i: number) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(t.date)}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{t.broker}</TableCell>
                      <TableCell>
                        <Chip label={t.buy_sell} size="small"
                          sx={{ bgcolor: t.buy_sell === 'BUY' ? '#10b98122' : '#ef444422', color: t.buy_sell === 'BUY' ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{t.quantity}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>{fmt(Math.round(t.price))}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>{fmt(Math.round(t.quantity * t.price))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(data.timeline ?? []).length === 0 && (
                <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>No transactions found</Typography>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* ── Column 3: Settlement History ── */}
        <Card sx={{ background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: 'calc(100% - 48px)' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Settlement History</Typography>
            <Box sx={{ overflowY: 'auto', pr: 0.5, flex: 1, maxHeight: 600 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {['Buy Date', 'Sell Date', 'Matched Qty', 'Buy Price', 'Sell Price', 'Holding Days', 'Return %age', 'P&L', 'Status'].map(h => (
                      <TableCell
                        key={h}
                        align={h === 'Buy Price' || h === 'Sell Price' || h === 'P&L' ? 'right' : 'left'}
                        sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11, py: 1, bgcolor: '#161824' }}
                      >
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.settlement_history ?? []).map((r: any, i: number) => (
                    <TableRow key={i} sx={{ borderLeft: `3px solid ${r.comment === 'Fully Settled' ? '#10b981' : r.comment === 'Partially Settled' ? '#f59e0b' : '#ef4444'}` }}>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(r.buy_date)}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(r.sell_date)}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{r.qty ?? r.sum_of_qty}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>{fmt(Math.round(r.price))}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>{fmt(Math.round(r.average_of_price))}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{r.holding_days != null ? `${r.holding_days}d` : '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: r.holding_days != null && r.price > 0 && calculateRowReturn(r) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {r.holding_days != null && r.price > 0 ? (
                          `${calculateRowReturn(r) >= 0 ? '+' : ''}${calculateRowReturn(r).toFixed(2)}%`
                        ) : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12, color: (r.pnl ?? 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {r.pnl != null ? `${r.pnl >= 0 ? '+' : ''}${fmt(Math.round(r.pnl))}` : '—'}
                      </TableCell>
                      <TableCell>
                        <Chip label={r.comment} size="small" sx={{
                          bgcolor: r.comment === 'Fully Settled' ? '#10b98122' : r.comment === 'Partially Settled' ? '#f59e0b22' : '#ef444422',
                          color: r.comment === 'Fully Settled' ? '#10b981' : r.comment === 'Partially Settled' ? '#f59e0b' : '#ef4444',
                          fontSize: 10, fontWeight: 600
                        }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(data.settlement_history ?? []).length === 0 && (
                <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>No settlement history</Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* ════════════════════════════════════════════════════════════════════════
          Target Create / Edit Dialog
          Identical fields to TargetSetting.tsx; stock name pre-filled & locked.
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={targetDialogOpen}
        onClose={closeTargetDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { background: '#161824', border: '1px solid #2a2e43', borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrackChangesIcon sx={{ color: '#2962ff' }} />
            {editTarget ? 'Edit Target' : 'Add New Target'}
          </Box>
        </DialogTitle>

        <DialogContent>
          {/* Stock Name — pre-filled, read-only */}
          <TextField
            label="Stock Name"
            size="small"
            fullWidth
            value={scrip}
            disabled
            sx={{ mt: 1.5, mb: 2 }}
          />

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            {/* Type */}
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={targetForm.type}
                label="Type"
                onChange={(e) => setTargetForm({ ...targetForm, type: e.target.value })}
              >
                <MenuItem value="Buy">Buy</MenuItem>
                <MenuItem value="Sell">Sell</MenuItem>
              </Select>
            </FormControl>

            {/* Target Price */}
            <TextField
              label="Target Price"
              type="number"
              size="small"
              value={targetForm.target_price}
              onChange={(e) => setTargetForm({ ...targetForm, target_price: e.target.value })}
              sx={{ flex: 1 }}
            />
          </Box>

          {/* Category */}
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={targetForm.category}
              label="Category"
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  setCategoryDialogOpen(true);
                } else {
                  setTargetForm({ ...targetForm, category: e.target.value });
                }
              }}
            >
              {categories.map(cat => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
              <MenuItem value="__add_new__" sx={{ color: '#2962ff', fontWeight: 600, borderTop: '1px solid #2a2e43' }}>
                <AddIcon sx={{ fontSize: 16, mr: 0.5 }} /> Add New Category
              </MenuItem>
            </Select>
          </FormControl>

          {/* Comment */}
          <TextField
            fullWidth
            multiline
            rows={3}
            size="small"
            label="Comments"
            value={targetForm.comment}
            onChange={(e) => setTargetForm({ ...targetForm, comment: e.target.value })}
            sx={{ mb: 2 }}
          />

          {/* Bookmark color picker */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontSize: 13, mr: 1 }}>Bookmark:</Typography>
            {BOOKMARK_COLORS.map(b => (
              <Tooltip key={b.key} title={b.label}>
                <IconButton
                  size="small"
                  onClick={() => setTargetForm({ ...targetForm, bookmark: targetForm.bookmark === b.key ? '' : b.key })}
                  sx={{
                    color: targetForm.bookmark === b.key ? b.color : 'rgba(255,255,255,0.2)',
                    border: targetForm.bookmark === b.key ? `2px solid ${b.color}` : '2px solid transparent',
                    borderRadius: 1,
                    transition: 'all 0.2s',
                    '&:hover': { color: b.color }
                  }}
                >
                  <FlagIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            ))}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={closeTargetDialog} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddOrSaveTarget}
            disabled={!targetForm.target_price}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {editTarget ? 'Save Changes' : 'Add Target'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Category sub-dialog */}
      <Dialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { background: '#161824', border: '1px solid #2a2e43', borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>Add New Category</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Category Name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            sx={{ mt: 1.5 }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setCategoryDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddCategory}
            disabled={!newCategoryName.trim()}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StockSummary;
