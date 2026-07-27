import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, Grid, Button, Divider,
  CircularProgress, Chip, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, Tooltip, Checkbox, Slider, Tabs, Tab, TextField,
  Radio, RadioGroup, FormControlLabel, FormControl, FormLabel
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import StarIcon from '@mui/icons-material/Star';

interface WatchlistProps {
  onViewStock: (scrip: string) => void;
  showToast?: (message: string, severity: 'success' | 'error' | 'info') => void;
}

const Watchlist: React.FC<WatchlistProps> = ({ onViewStock, showToast }) => {
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
            item.script === script ? { ...item, action_checked: newChecked } : item
          )
        );
      } else if (section === 'section2') {
        setSection2Data(prev => ({
          top_movers: prev.top_movers.map(item =>
            item.script === script ? { ...item, action_checked: newChecked } : item
          ),
          bottom_movers: prev.bottom_movers.map(item =>
            item.script === script ? { ...item, action_checked: newChecked } : item
          )
        }));
      } else if (section === 'section3') {
        setSection3Data(prev => ({
          top_movers: prev.top_movers.map(item =>
            item.script === script ? { ...item, action_checked: newChecked } : item
          ),
          bottom_movers: prev.bottom_movers.map(item =>
            item.script === script ? { ...item, action_checked: newChecked } : item
          )
        }));
      } else if (section === 'section4') {
        setSection4Data(prev =>
          prev.map(item =>
            item.script === script ? { ...item, action_checked: newChecked } : item
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

  const fmt = (v: number | null) =>
    v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';

  const fmtDate = (v: string) => {
    if (!v) return '—';
    if (v === 'Pre-2026 Data' || v === 'Historical') return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-IN');
  };

  // Computed Section 1 Aggregates
  const totalPotentialProfit = section1Data.reduce(
    (acc, curr) => acc + (curr.potential_profit || 0),
    0
  );
  const avgGain =
    section1Data.length > 0
      ? section1Data.reduce((acc, curr) => acc + (curr.gain_pct || 0), 0) / section1Data.length
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
        <IconButton
          onClick={() => loadAllData(N)}
          disabled={loading}
          sx={{ color: 'primary.main', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
        >
          <RefreshIcon />
        </IconButton>
      </Box>

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
                  { label: 'Watchlist Candidates', val: section1Data.length, color: '#2962ff' },
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
                        {[
                          'Target Lot Buying Date',
                          'Stock Name',
                          'Target Lot Buying Price',
                          'LTP chg %',
                          'LTP',
                          '%age Gain',
                          'Remaining Lot Qty',
                          'Remaining Lot Value',
                          'Potential Profit (for this lot only)',
                          'Action (24h)',
                          'Options'
                        ].map(col => {
                          const isHighlight = col === '%age Gain';
                          return (
                            <TableCell
                              key={col}
                              sx={{
                                color: isHighlight ? '#FFD700' : 'text.secondary',
                                fontWeight: 700,
                                py: 1.5,
                                fontSize: 11,
                                borderBottom: '1px solid #2a2e43',
                                ...(isHighlight && {
                                  borderLeft: '2px solid rgba(255,215,0,0.3)',
                                })
                              }}
                            >
                              {isHighlight ? (
                                <>
                                  <span style={{ fontSize: '130%', lineHeight: 1, marginRight: 3 }}>💡</span>
                                  {col}
                                </>
                              ) : col}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {section1Data.length > 0 ? (
                        section1Data.map((row, i) => {
                          const isManual = row.tag_type === 'MANUAL';
                          const ltpChg = row.change_in_ltp_pct ?? 0;
                          return (
                            <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontSize: 12 }}>
                                {fmtDate(row.buying_date)}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <span
                                    style={{ color: '#2962ff', cursor: 'pointer' }}
                                    onClick={() => onViewStock(row.script)}
                                  >
                                    {row.script && row.script.endsWith('-EQ')
                                      ? row.script.substring(0, row.script.length - 3)
                                      : row.script}
                                    {row.is_partial ? ' | Partially Settled' : ''}
                                  </span>
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
                                    sx={{ p: 0.5, color: '#2a2e43', '&.Mui-checked': { color: '#10b981' } }}
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
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={11} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                            No profit booking candidates currently. Manually add scripts from the Live Holdings page.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
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
                    <CardContent sx={{ p: 0 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#161824' }}>
                            {['Script', 'Broker', 'Qty', 'Avg Price', 'LTP', 'LTP Chg %', 'P&L %', 'Current Value', 'Dip %age', 'Date', '# of Days', 'Last Tx Type', 'Action'].map(col => {
                              const isHighlight = col === 'LTP Chg %';
                              return (
                                <TableCell
                                  key={col}
                                  sx={{
                                    color: isHighlight ? '#FFD700' : 'text.secondary',
                                    fontWeight: 700,
                                    py: 1.2,
                                    fontSize: 10,
                                    borderBottom: '1px solid #2a2e43',
                                    ...(isHighlight && { borderLeft: '2px solid rgba(255,215,0,0.3)' })
                                  }}
                                >
                                  {isHighlight ? (
                                    <>
                                      <span style={{ fontSize: '130%', lineHeight: 1, marginRight: 3 }}>💡</span>
                                      LTP Chg %
                                    </>
                                  ) : (
                                    col
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {section2Data.top_movers.length > 0 ? (
                            section2Data.top_movers.map((row, i) => (
                              <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700 }}>
                                  <span
                                    style={{ color: '#2962ff', cursor: 'pointer' }}
                                    onClick={() => onViewStock(row.script)}
                                  >
                                    {row.script && row.script.endsWith('-EQ')
                                      ? row.script.substring(0, row.script.length - 3)
                                      : row.script}
                                  </span>
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
                                    sx={{ p: 0.5, color: '#2a2e43', '&.Mui-checked': { color: '#10b981' } }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No positive movers.
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
                    <CardContent sx={{ p: 0 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#161824' }}>
                            {['Script', 'Broker', 'Qty', 'Avg Price', 'LTP', 'LTP Chg %', 'P&L %', 'Current Value', 'Dip %age', 'Date', '# of Days', 'Last Tx Type', 'Action'].map(col => {
                              const isHighlight = col === 'LTP Chg %';
                              return (
                                <TableCell
                                  key={col}
                                  sx={{
                                    color: isHighlight ? '#FFD700' : 'text.secondary',
                                    fontWeight: 700,
                                    py: 1.2,
                                    fontSize: 10,
                                    borderBottom: '1px solid #2a2e43',
                                    ...(isHighlight && { borderLeft: '2px solid rgba(255,215,0,0.3)' })
                                  }}
                                >
                                  {isHighlight ? (
                                    <>
                                      <span style={{ fontSize: '130%', lineHeight: 1, marginRight: 3 }}>💡</span>
                                      LTP Chg %
                                    </>
                                  ) : (
                                    col
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {section2Data.bottom_movers.length > 0 ? (
                            section2Data.bottom_movers.map((row, i) => (
                              <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700 }}>
                                  <span
                                    style={{ color: '#2962ff', cursor: 'pointer' }}
                                    onClick={() => onViewStock(row.script)}
                                  >
                                    {row.script && row.script.endsWith('-EQ')
                                      ? row.script.substring(0, row.script.length - 3)
                                      : row.script}
                                  </span>
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
                                    sx={{ p: 0.5, color: '#2a2e43', '&.Mui-checked': { color: '#10b981' } }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No negative movers.
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
                    <CardContent sx={{ p: 0 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#161824' }}>
                            {['Script', 'Broker', 'Qty', 'Avg Price', 'LTP', 'LTP Chg %', 'P&L %', 'Current Value', 'Dip %age', 'Date', '# of Days', 'Last Tx Type', 'Action'].map(col => (
                              <TableCell
                                key={col}
                                sx={{ 
                                  color: col === 'Dip %age' ? '#FFD700' : 'text.secondary', 
                                  fontWeight: 700, 
                                  py: 1.2, 
                                  fontSize: 10, 
                                  borderBottom: '1px solid #2a2e43',
                                  ...(col === 'Dip %age' && { borderLeft: '2px solid rgba(255,215,0,0.3)' })
                                }}
                              >
                                   {col === 'Dip %age' ? (<><span style={{ fontSize: '130%', lineHeight: 1, marginRight: 3 }}>💡</span>Dip %age</>) : col}
                                 </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {section3Data.top_movers.length > 0 ? (
                            section3Data.top_movers.map((row, i) => (
                              <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700 }}>
                                  <span
                                    style={{ color: '#2962ff', cursor: 'pointer' }}
                                    onClick={() => onViewStock(row.script)}
                                  >
                                    {row.script && row.script.endsWith('-EQ')
                                      ? row.script.substring(0, row.script.length - 3)
                                      : row.script}
                                  </span>
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
                                    sx={{ p: 0.5, color: '#2a2e43', '&.Mui-checked': { color: '#10b981' } }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No positive dippers.
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
                    <CardContent sx={{ p: 0 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#161824' }}>
                            {['Script', 'Broker', 'Qty', 'Avg Price', 'LTP', 'LTP Chg %', 'P&L %', 'Current Value', 'Dip %age', 'Date', '# of Days', 'Last Tx Type', 'Action'].map(col => (
                              <TableCell
                                key={col}
                                sx={{ 
                                  color: col === 'Dip %age' ? '#FFD700' : 'text.secondary', 
                                  fontWeight: 700, 
                                  py: 1.2, 
                                  fontSize: 10, 
                                  borderBottom: '1px solid #2a2e43',
                                  ...(col === 'Dip %age' && { borderLeft: '2px solid rgba(255,215,0,0.3)' })
                                }}
                              >
                                   {col === 'Dip %age' ? (<><span style={{ fontSize: '130%', lineHeight: 1, marginRight: 3 }}>💡</span>Dip %age</>) : col}
                                 </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {section3Data.bottom_movers.length > 0 ? (
                            section3Data.bottom_movers.map((row, i) => (
                              <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(41,98,255,0.05)' } }}>
                                <TableCell sx={{ borderBottom: '1px solid #2a2e43', fontWeight: 700 }}>
                                  <span
                                    style={{ color: '#2962ff', cursor: 'pointer' }}
                                    onClick={() => onViewStock(row.script)}
                                  >
                                    {row.script && row.script.endsWith('-EQ')
                                      ? row.script.substring(0, row.script.length - 3)
                                      : row.script}
                                  </span>
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
                                    sx={{ p: 0.5, color: '#2a2e43', '&.Mui-checked': { color: '#10b981' } }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No negative dippers.
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
                  label={`${section4Data.length} Re-entry Candidates`}
                  sx={{ bgcolor: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, fontSize: 12 }}
                />
                {section4Data.length > 0 && (
                  <Chip
                    label={`Biggest Drop: ${section4Data[0]?.drop_from_exit_pct?.toFixed(2)}% from exit`}
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
                        {[
                          'Stock Name',
                          'Broker',
                          'Exit Price (Sell)',
                          'Exit Date',
                          'Days Since Exit',
                          'LTP Now',
                          'Today Chg %',
                          'Drop from Exit %',
                          'Action (24h)'
                        ].map(col => {
                          const isHighlight = col === 'Drop from Exit %';
                          return (
                            <TableCell
                              key={col}
                              sx={{
                                color: isHighlight ? '#FFD700' : 'text.secondary',
                                fontWeight: 700,
                                py: 1.5,
                                fontSize: 11,
                                borderBottom: '1px solid #2a2e43',
                                ...(isHighlight && {
                                  borderLeft: '2px solid rgba(255,215,0,0.3)',
                                })
                              }}
                            >
                              {isHighlight ? (
                                <>
                                  <span style={{ fontSize: '130%', lineHeight: 1, marginRight: 3 }}>💡</span>
                                  Drop from Exit %
                                </>
                              ) : col}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {section4Data.length > 0 ? (
                        section4Data.map((row, i) => {
                          const drop = row.drop_from_exit_pct ?? 0;
                          const chg = row.change_in_ltp_pct ?? 0;
                          return (
                            <TableRow
                              key={i}
                              sx={{
                                '&:hover': { bgcolor: 'rgba(245,158,11,0.04)' },
                                // Highlight top 3 cheapest re-entries
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
                                    sx={{ p: 0.5, color: '#2a2e43', '&.Mui-checked': { color: '#f59e0b' } }}
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
                                No re-entry candidates found
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                No stocks were fully exited in the last 6 months outside of live holdings,
                                or no live price data is available.
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
    </Box>
  );
};

export default Watchlist;
