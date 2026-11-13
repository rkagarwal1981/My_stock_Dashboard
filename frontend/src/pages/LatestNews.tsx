import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  TextField,
  InputAdornment,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SyncIcon from '@mui/icons-material/Sync';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BoltIcon from '@mui/icons-material/Bolt';

interface LatestNewsProps {
  onViewStock?: (scrip: string) => void;
  showToast?: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

const fmtCurrency = (v: number | null | undefined) => {
  if (v == null || isNaN(Number(v))) return '—';
  return `₹${Math.round(Number(v)).toLocaleString('en-IN')}`;
};

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return 'Never pulled';
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const LatestNews: React.FC<LatestNewsProps> = ({ onViewStock, showToast }) => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pulling, setPulling] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('ALL'); // ALL, BULLISH, BEARISH, HIGH
  const [brokerFilter, setBrokerFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const loadCachedNews = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get('/api/news/latest');
      setReport(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to load cached news report.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCachedNews();
  }, [loadCachedNews]);

  const handlePullLatestNews = async () => {
    try {
      setPulling(true);
      setError('');
      if (showToast) {
        showToast(
          'Scanning Manual Data\\News Word files and updating Stock News...',
          'info'
        );
      }
      const res = await axios.post('/api/news/pull?days=7');
      setReport(res.data);
      if (showToast) {
        const count = res.data?.summary?.stocks_with_impact_news || 0;
        showToast(
          `Pulled latest news from Manual Data\\News! Loaded news for ${count} stocks.`,
          'success'
        );
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to pull latest news.';
      setError(msg);
      if (showToast) showToast(msg, 'error');
    } finally {
      setPulling(false);
    }
  };

  const allBrokers = useMemo(() => {
    const set = new Set<string>();
    (report?.stocks || []).forEach((s: any) => {
      (s.brokers || []).forEach((b: string) => set.add(b));
    });
    return Array.from(set).sort();
  }, [report]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    (report?.stocks || []).forEach((s: any) => {
      if (s.primary_catalyst) set.add(s.primary_catalyst);
      (s.articles || []).forEach((a: any) => {
        if (a.category) set.add(a.category);
      });
    });
    return Array.from(set).sort();
  }, [report]);

  const filteredStocks = useMemo(() => {
    const list = report?.stocks || [];
    return list.filter((st: any) => {
      if (sentimentFilter === 'BULLISH' && st.overall_sentiment !== 'BULLISH') return false;
      if (sentimentFilter === 'BEARISH' && st.overall_sentiment !== 'BEARISH') return false;
      if (sentimentFilter === 'HIGH' && st.impact_level !== 'HIGH') return false;

      if (brokerFilter !== 'ALL' && !(st.brokers || []).includes(brokerFilter)) return false;

      if (categoryFilter !== 'ALL') {
        const matchesPrimary = st.primary_catalyst === categoryFilter;
        const matchesArticleCat = (st.articles || []).some((a: any) => a.category === categoryFilter);
        if (!matchesPrimary && !matchesArticleCat) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchSym = String(st.symbol || '').toLowerCase().includes(q);
        const matchName = String(st.company_name || '').toLowerCase().includes(q);
        const matchCat = String(st.primary_catalyst || '').toLowerCase().includes(q);
        const matchSummary = String(st.ai_summary || '').toLowerCase().includes(q);
        const matchTitle = (st.articles || []).some((a: any) =>
          String(a.title || '').toLowerCase().includes(q)
        );
        if (!matchSym && !matchName && !matchCat && !matchSummary && !matchTitle) return false;
      }

      return true;
    });
  }, [report, sentimentFilter, brokerFilter, categoryFilter, searchQuery]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 400, gap: 2 }}>
        <CircularProgress size={42} />
        <Typography color="text.secondary">Loading Latest News Module...</Typography>
      </Box>
    );
  }

  const summary = report?.summary || {};
  const hasPulledBefore = Boolean(report?.last_pulled);

  return (
    <Box className="fade-in" sx={{ pb: 4 }}>
      {/* ─── TOP HEADER BAR ────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          mb: 3,
          p: 2.5,
          borderRadius: 3,
          background: 'linear-gradient(135deg, rgba(41, 98, 255, 0.14) 0%, rgba(22, 24, 36, 0.95) 65%)',
          border: '1px solid #2a2e43',
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <NewspaperIcon sx={{ color: '#38bdf8', fontSize: 30 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.3 }}>
              Latest News — Live Holdings Catalyst Radar
            </Typography>
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: '16px !important', color: '#c4b5fd !important' }} />}
              label="FREE LLM SUMMARIZER"
              size="small"
              sx={{ bgcolor: 'rgba(139, 92, 246, 0.18)', color: '#c4b5fd', fontWeight: 700, fontSize: 12 }}
            />
            <Chip
              label="STRICTLY ≤ 7 DAYS • PRICE-IMPACT ONLY"
              size="small"
              sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700, fontSize: 12 }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6, fontSize: 14.5 }}>
            Scans all equity stocks held in your Live Holdings for earnings, order wins, brokerage upgrades/downgrades, M&amp;A, and regulatory catalysts from the last 7 days.
            <span style={{ marginLeft: 12, color: '#94a3b8', fontWeight: 600 }}>
              • Last Pulled: {fmtDateTime(report?.last_pulled)}
            </span>
          </Typography>
        </Box>

        <Button
          variant="contained"
          size="large"
          startIcon={pulling ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
          disabled={pulling}
          onClick={handlePullLatestNews}
          sx={{
            borderRadius: 2.5,
            fontWeight: 700,
            fontSize: 15,
            py: 1.2,
            px: 3,
            background: 'linear-gradient(135deg, #2962ff 0%, #0284c7 100%)',
            boxShadow: '0 4px 16px rgba(41, 98, 255, 0.35)',
          }}
        >
          {pulling ? 'Pulling & Summarizing News...' : 'Pull Latest News'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* ─── KPI SUMMARY ROW ───────────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: 'Held Stocks Scanned',
            val: summary.total_held_stocks_scanned || 0,
            sub: 'Active equity scripts in Live Holdings',
            color: '#38bdf8',
          },
          {
            label: 'Stocks With Price-Moving News',
            val: summary.stocks_with_impact_news || 0,
            sub: `${summary.total_articles_analyzed || 0} material articles (≤ 7 days)`,
            color: '#f8fafc',
          },
          {
            label: 'High-Impact Catalysts',
            val: summary.high_impact_stocks || 0,
            sub: 'Major earnings / orders / rating actions',
            color: '#f59e0b',
          },
          {
            label: 'Bullish Catalysts',
            val: summary.bullish_catalysts || 0,
            sub: 'Positive share-price drivers',
            color: '#10b981',
          },
          {
            label: 'Bearish / Risk Catalysts',
            val: summary.bearish_catalysts || 0,
            sub: 'Negative or cautionary news',
            color: '#ef4444',
          },
        ].map((item) => (
          <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={item.label}>
            <Card
              sx={{
                height: '100%',
                background: 'rgba(22, 24, 36, 0.85)',
                border: '1px solid #2a2e43',
                borderRadius: 2.5,
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', display: 'block' }}
                >
                  {item.label}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: item.color, my: 0.5 }}>
                  {item.val}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', fontSize: 12.5, display: 'block' }}>
                  {item.sub}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ─── FILTER & SEARCH BAR ───────────────────────────────────────────────── */}
      <Card sx={{ mb: 3, background: 'rgba(22, 24, 36, 0.75)', border: '1px solid #2a2e43', borderRadius: 2.5 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { id: 'ALL', label: `All Catalysts (${report?.stocks?.length || 0})` },
                { id: 'HIGH', label: `⚡ High Impact (${summary.high_impact_stocks || 0})` },
                { id: 'BULLISH', label: `▲ Bullish (${summary.bullish_catalysts || 0})` },
                { id: 'BEARISH', label: `▼ Bearish (${summary.bearish_catalysts || 0})` },
              ].map((tab) => (
                <Chip
                  key={tab.id}
                  label={tab.label}
                  clickable
                  onClick={() => setSentimentFilter(tab.id)}
                  sx={{
                    height: 32,
                    fontWeight: 700,
                    fontSize: 13.5,
                    bgcolor:
                      sentimentFilter === tab.id
                        ? tab.id === 'BULLISH'
                          ? '#10b981'
                          : tab.id === 'BEARISH'
                          ? '#ef4444'
                          : tab.id === 'HIGH'
                          ? '#f59e0b'
                          : '#2962ff'
                        : 'rgba(255,255,255,0.05)',
                    color: sentimentFilter === tab.id ? '#fff' : '#cbd5e1',
                    border: '1px solid #2a2e43',
                  }}
                />
              ))}
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', flexGrow: 1, justifyContent: 'flex-end' }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Broker</InputLabel>
                <Select
                  value={brokerFilter}
                  label="Broker"
                  onChange={(e) => setBrokerFilter(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="ALL">All Brokers</MenuItem>
                  {allBrokers.map((b) => (
                    <MenuItem key={b} value={b}>
                      {b}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 210 }}>
                <InputLabel>Catalyst Category</InputLabel>
                <Select
                  value={categoryFilter}
                  label="Catalyst Category"
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="ALL">All Categories</MenuItem>
                  {allCategories.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                size="small"
                placeholder="Search stock, company, or news..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ minWidth: 260 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ─── EMPTY / INITIAL STATE ─────────────────────────────────────────────── */}
      {!hasPulledBefore && !pulling ? (
        <Card sx={{ background: 'rgba(22, 24, 36, 0.75)', border: '1px dashed #2a2e43', borderRadius: 3, p: 5, textAlign: 'center' }}>
          <NewspaperIcon sx={{ fontSize: 56, color: '#38bdf8', mb: 1.5, opacity: 0.85 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Ready to Scan Your Live Holdings for 7-Day Price-Moving News
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 620, mx: 'auto', mb: 3, fontSize: 15 }}>
            Click <strong>&ldquo;Pull Latest News&rdquo;</strong> above to fetch the latest 7-day news across your held stocks, filter strictly for events that impact share price movement, and generate an AI summary using the free LLM.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<SyncIcon />}
            onClick={handlePullLatestNews}
            sx={{ borderRadius: 2.5, fontWeight: 700, px: 3.5, py: 1.2 }}
          >
            Pull Latest News Now
          </Button>
        </Card>
      ) : pulling && (report?.stocks?.length || 0) === 0 ? (
        <Card sx={{ background: 'rgba(22, 24, 36, 0.75)', border: '1px solid #2a2e43', borderRadius: 3, p: 6, textAlign: 'center' }}>
          <CircularProgress size={48} sx={{ mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Scanning Live Holdings &amp; Summarizing Price-Moving News...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14.5 }}>
            Fetching 7-day headlines across your held stocks and running Free LLM catalyst summarization. This takes ~10–15 seconds.
          </Typography>
        </Card>
      ) : filteredStocks.length === 0 ? (
        <Card sx={{ background: 'rgba(22, 24, 36, 0.75)', border: '1px solid #2a2e43', borderRadius: 3, p: 4, textAlign: 'center' }}>
          <Typography variant="subtitle1" color="text.secondary">
            No stocks match the selected filter criteria.
          </Typography>
        </Card>
      ) : (
        /* ─── STOCK CATALYST CARDS ────────────────────────────────────────────── */
        <Grid container spacing={2.5}>
          {filteredStocks.map((st: any) => {
            const isBullish = st.overall_sentiment === 'BULLISH';
            const isBearish = st.overall_sentiment === 'BEARISH';
            const borderColor = isBullish
              ? 'rgba(16, 185, 129, 0.4)'
              : isBearish
              ? 'rgba(239, 68, 68, 0.4)'
              : '#2a2e43';
            const sentimentColor = isBullish ? '#10b981' : isBearish ? '#ef4444' : '#38bdf8';

            return (
              <Grid size={{ xs: 12, lg: 6 }} key={st.symbol}>
                <Card
                  sx={{
                    height: '100%',
                    background: 'rgba(22, 24, 36, 0.88)',
                    border: `1px solid ${borderColor}`,
                    borderRadius: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                    {/* Card Header: Symbol, Company, Sentiment & Impact Badges */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography
                            variant="h6"
                            onClick={() => onViewStock && onViewStock(st.symbol)}
                            sx={{
                              fontWeight: 800,
                              fontSize: 20,
                              color: '#38bdf8',
                              cursor: onViewStock ? 'pointer' : 'default',
                              '&:hover': onViewStock ? { textDecoration: 'underline' } : {},
                            }}
                          >
                            {st.symbol}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: 14.5 }}>
                            ({st.company_name})
                          </Typography>
                          <Tooltip title={`Open ${st.symbol} on Screener.in`}>
                            <IconButton
                              size="small"
                              component="a"
                              href={`https://www.screener.in/company/${encodeURIComponent(st.symbol)}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ color: '#94a3b8', p: 0.4, '&:hover': { color: '#38bdf8' } }}
                            >
                              <OpenInNewIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                          {(st.brokers || []).map((b: string) => (
                            <Chip
                              key={b}
                              label={b}
                              size="small"
                              sx={{ height: 21, fontSize: 11.5, fontWeight: 700, bgcolor: 'rgba(148,163,184,0.14)', color: '#cbd5e1' }}
                            />
                          ))}
                          <Typography variant="caption" sx={{ color: '#cbd5e1', fontSize: 13, fontWeight: 600 }}>
                            Holding: <strong>{fmtCurrency(st.total_value)}</strong> ({st.total_qty} Qty • LTP ₹{st.ltp})
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {st.impact_level === 'HIGH' && (
                          <Chip
                            icon={<BoltIcon sx={{ fontSize: '16px !important', color: '#f59e0b !important' }} />}
                            label="HIGH IMPACT"
                            size="small"
                            sx={{
                              height: 26,
                              bgcolor: 'rgba(245, 158, 11, 0.16)',
                              color: '#f59e0b',
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          />
                        )}
                        <Chip
                          icon={
                            isBullish ? (
                              <TrendingUpIcon sx={{ fontSize: '16px !important', color: '#10b981 !important' }} />
                            ) : isBearish ? (
                              <TrendingDownIcon sx={{ fontSize: '16px !important', color: '#ef4444 !important' }} />
                            ) : (
                              <TrendingFlatIcon sx={{ fontSize: '16px !important', color: '#38bdf8 !important' }} />
                            )
                          }
                          label={st.overall_sentiment}
                          size="small"
                          sx={{
                            height: 26,
                            bgcolor: isBullish
                              ? 'rgba(16, 185, 129, 0.16)'
                              : isBearish
                              ? 'rgba(239, 68, 68, 0.16)'
                              : 'rgba(56, 189, 248, 0.16)',
                            color: sentimentColor,
                            fontWeight: 800,
                            fontSize: 12.5,
                          }}
                        />
                        {st.primary_catalyst && (
                          <Chip
                            label={st.primary_catalyst}
                            size="small"
                            sx={{
                              height: 26,
                              bgcolor: 'rgba(41, 98, 255, 0.16)',
                              color: '#93c5fd',
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          />
                        )}
                      </Box>
                    </Box>

                    {/* Source Articles / Word File Entries (Appended Chronologically) */}
                    <Divider sx={{ mb: 1.2, borderColor: '#2a2e43' }} />
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', mb: 1, display: 'block' }}
                    >
                      STOCK NEWS ({st.articles?.length || 0} {st.articles?.length === 1 ? 'FILE' : 'FILES'})
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {(st.articles || []).map((art: any, aIdx: number) => (
                        <Box
                          key={aIdx}
                          sx={{
                            p: 1.2,
                            borderRadius: 1.5,
                            bgcolor: 'rgba(255, 255, 255, 0.025)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            '&:hover': { bgcolor: 'rgba(41, 98, 255, 0.08)' },
                          }}
                        >
                          {Array.isArray(art.points) && art.points.length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {art.points.map((pt: string, pIdx: number) => (
                                <Typography
                                  key={pIdx}
                                  variant="body2"
                                  sx={{
                                    color: '#e2e8f0',
                                    fontWeight: 600,
                                    fontSize: 14.5,
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {art.points.length > 1 ? `• ${pt}` : pt}
                                </Typography>
                              ))}
                            </Box>
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{
                                color: '#e2e8f0',
                                fontWeight: 600,
                                fontSize: 14.5,
                                lineHeight: 1.45,
                              }}
                            >
                              {art.title}
                            </Typography>
                          )}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.8, flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip
                                label={art.source}
                                size="small"
                                sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}
                              />
                              <Chip
                                label={art.category}
                                size="small"
                                sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8' }}
                              />
                            </Box>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                              {art.published_date} {art.file_name ? `• ${art.file_name}` : ''}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default LatestNews;

