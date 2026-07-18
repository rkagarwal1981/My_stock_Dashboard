import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppSelector } from '../store';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, Button, Chip, Switch, Slider,
  FormControl, InputLabel, Select, MenuItem, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, Tooltip, Autocomplete,
  FormControlLabel, LinearProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FlagIcon from '@mui/icons-material/Flag';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface TargetSettingProps {
  onViewStock: (scrip: string) => void;
}

const BOOKMARK_COLORS: { key: string; color: string; label: string }[] = [
  { key: 'red', color: '#ef4444', label: 'Red' },
  { key: 'orange', color: '#f59e0b', label: 'Orange' },
  { key: 'yellow', color: '#eab308', label: 'Yellow' },
  { key: 'green', color: '#10b981', label: 'Green' },
  { key: 'blue', color: '#2962ff', label: 'Blue' },
];

const TargetSetting: React.FC<TargetSettingProps> = ({ onViewStock }) => {
  const allHoldings = useAppSelector((state) => state.portfolio.holdings);

  const [targets, setTargets] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [scripList, setScripList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [holdingsOnly, setHoldingsOnly] = useState(false);
  const [proximityThreshold, setProximityThreshold] = useState<number>(100);
  const [bookmarkFilter, setBookmarkFilter] = useState<string>('all');
  const [recencyFilter, setRecencyFilter] = useState<string>('all');

  // Add / Edit target dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null); // null = create mode
  const [newTarget, setNewTarget] = useState({
    script: '',
    type: 'Buy',
    target_price: '',
    category: '',
    comment: '',
    bookmark: '',
  });

  // Add category dialog state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Bookmark popover
  const [bookmarkPopover, setBookmarkPopover] = useState<{ anchorEl: HTMLElement | null; targetId: number | null }>({ anchorEl: null, targetId: null });

  const loadTargets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/targets');
      setTargets(res.data);
    } catch (e) {
      console.error('Failed to load targets:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await axios.get('/api/target-categories');
      setCategories(res.data);
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  }, []);

  const loadScrips = useCallback(async () => {
    try {
      const res = await axios.get('/api/targets/scrips');
      setScripList(res.data);
    } catch (e) {
      console.error('Failed to load scrips:', e);
    }
  }, []);

  useEffect(() => {
    loadTargets();
    loadCategories();
    loadScrips();
  }, [loadTargets, loadCategories, loadScrips]);

  const holdingScripts = useMemo(() => {
    return new Set(allHoldings.map((h: any) => h.script));
  }, [allHoldings]);

  // Filtered data
  const filteredTargets = useMemo(() => {
    let data = [...targets];

    // Holdings filter
    if (holdingsOnly) {
      data = data.filter(t => holdingScripts.has(t.script));
    }

    // Proximity filter
    if (proximityThreshold < 100) {
      data = data.filter(t => {
        if (t.distance_pct == null) return false;
        return Math.abs(t.distance_pct) <= proximityThreshold;
      });
    }

    // Bookmark filter
    if (bookmarkFilter !== 'all') {
      data = data.filter(t => t.bookmark === bookmarkFilter);
    }

    // Recency filter
    if (recencyFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (recencyFilter === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (recencyFilter === '3days') cutoff.setDate(now.getDate() - 3);
      else if (recencyFilter === 'week') cutoff.setDate(now.getDate() - 7);
      else if (recencyFilter === 'month') cutoff.setMonth(now.getMonth() - 1);

      data = data.filter(t => {
        if (!t.date) return false;
        return new Date(t.date) >= cutoff;
      });
    }

    return data;
  }, [targets, holdingsOnly, proximityThreshold, bookmarkFilter, recencyFilter, holdingScripts]);

  const handleOpenEdit = (target: any) => {
    setEditTarget(target);
    setNewTarget({
      script: target.script || '',
      type: target.type || 'Buy',
      target_price: target.target_price != null ? String(target.target_price) : '',
      category: target.category || '',
      comment: target.comment || '',
      bookmark: target.bookmark || '',
    });
    setAddDialogOpen(true);
  };

  const handleAddOrSaveTarget = async () => {
    if (!newTarget.target_price) return;
    try {
      if (editTarget) {
        // Edit mode — PUT (backend auto-overwrites date)
        await axios.put(`/api/targets/${editTarget.id}`, {
          type: newTarget.type,
          target_price: parseFloat(newTarget.target_price),
          category: newTarget.category || null,
          comment: newTarget.comment || null,
          bookmark: newTarget.bookmark || null,
        });
      } else {
        // Create mode — POST
        if (!newTarget.script) return;
        await axios.post('/api/targets', {
          script: newTarget.script,
          type: newTarget.type,
          target_price: parseFloat(newTarget.target_price),
          category: newTarget.category || null,
          comment: newTarget.comment || null,
          bookmark: newTarget.bookmark || null,
        });
      }
      setAddDialogOpen(false);
      setEditTarget(null);
      setNewTarget({ script: '', type: 'Buy', target_price: '', category: '', comment: '', bookmark: '' });
      loadTargets();
    } catch (e: any) {
      console.error('Failed to save target:', e);
    }
  };

  const handleDeleteTarget = async (id: number) => {
    try {
      await axios.delete(`/api/targets/${id}`);
      loadTargets();
    } catch (e) {
      console.error('Failed to delete target:', e);
    }
  };

  const handleUpdateTarget = async (id: number, field: string, value: any) => {
    try {
      await axios.put(`/api/targets/${id}`, { [field]: value });
      loadTargets();
    } catch (e) {
      console.error('Failed to update target:', e);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await axios.post('/api/target-categories', { name: newCategoryName.trim() });
      setNewCategoryName('');
      setCategoryDialogOpen(false);
      loadCategories();
    } catch (e: any) {
      console.error('Failed to add category:', e);
    }
  };

  const fmt = (n: any) => {
    if (n == null || isNaN(n)) return '—';
    return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  // Distance % color and progress bar component
  const DistanceCell = ({ value }: { value: number | null }) => {
    if (value == null) return <span style={{ color: '#64748b' }}>—</span>;
    const absVal = Math.abs(value);
    const color = absVal <= 5 ? '#10b981' : absVal <= 15 ? '#f59e0b' : '#ef4444';
    const progressVal = Math.min(absVal, 50);
    const barPct = (progressVal / 50) * 100;

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color, minWidth: 55, textAlign: 'right' }}>
          {value >= 0 ? '+' : ''}{value.toFixed(2)}%
        </Typography>
        <Box sx={{ flex: 1, height: 6, bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ width: `${barPct}%`, height: '100%', bgcolor: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
        </Box>
      </Box>
    );
  };

  // Bookmark cell renderer
  const BookmarkCell = ({ data }: { data: any }) => {
    if (!data) return null;
    const currentColor = BOOKMARK_COLORS.find(b => b.key === data.bookmark);

    return (
      <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'center' }}>
        {BOOKMARK_COLORS.map(b => (
          <Tooltip key={b.key} title={b.label}>
            <IconButton
              size="small"
              sx={{
                p: 0.3,
                color: data.bookmark === b.key ? b.color : 'rgba(255,255,255,0.15)',
                transition: 'all 0.2s',
                '&:hover': { color: b.color, transform: 'scale(1.2)' }
              }}
              onClick={() => handleUpdateTarget(data.id, 'bookmark', data.bookmark === b.key ? '' : b.key)}
            >
              <FlagIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        ))}
      </Box>
    );
  };

  const columnDefs = useMemo(() => [
    {
      field: 'date',
      headerName: 'Date',
      flex: 1.1,
      minWidth: 100,
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString('en-IN') : '—',
      sort: 'desc' as const
    },
    {
      field: 'script',
      headerName: 'Stock Name',
      flex: 1.5,
      minWidth: 140,
      cellRenderer: (p: any) => {
        const val = p.value && p.value.endsWith('-EQ') ? p.value.slice(0, -3) : (p.value || '');
        return (
          <span
            style={{ cursor: 'pointer', color: '#2962ff', fontWeight: 600 }}
            onClick={() => onViewStock(p.value)}
          >
            {val}
          </span>
        );
      }
    },
    {
      field: 'type',
      headerName: 'Type',
      flex: 0.7,
      minWidth: 80,
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
              fontSize: 11,
            }}
          />
        );
      }
    },
    {
      field: 'target_price',
      headerName: 'Target Price',
      flex: 1,
      minWidth: 110,
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%', fontWeight: 600 }}>
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
      field: 'distance_pct',
      headerName: 'Distance (%)',
      flex: 1.5,
      minWidth: 160,
      cellRenderer: (p: any) => <DistanceCell value={p.value} />
    },
    {
      field: 'category',
      headerName: 'Category',
      flex: 1,
      minWidth: 110,
      cellRenderer: (p: any) => p.value
        ? <Chip label={p.value} size="small" sx={{ bgcolor: 'rgba(41,98,255,0.1)', color: '#2962ff', border: '1px solid rgba(41,98,255,0.2)', fontSize: 11 }} />
        : <span style={{ color: '#64748b' }}>—</span>
    },
    {
      field: 'comment',
      headerName: 'Comments',
      flex: 1.5,
      minWidth: 150,
      cellRenderer: (p: any) => (
        <span style={{ color: '#cbd5e1', fontSize: 12 }}>
          {p.value || '—'}
        </span>
      )
    },
    {
      field: 'triggered',
      headerName: 'Triggered',
      flex: 0.8,
      minWidth: 90,
      cellRenderer: (p: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          {p.value ? (
            <CheckCircleIcon sx={{ color: '#10b981', fontSize: 20 }} />
          ) : (
            <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #475569' }} />
          )}
        </Box>
      )
    },
    {
      field: 'bookmark',
      headerName: 'Bookmark',
      flex: 1.2,
      minWidth: 130,
      cellRenderer: (p: any) => <BookmarkCell data={p.data} />
    },
    {
      headerName: '',
      flex: 0.5,
      minWidth: 52,
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => (
        <Tooltip title="Edit target">
          <IconButton
            size="small"
            onClick={() => handleOpenEdit(p.data)}
            sx={{ p: 0.5, color: '#64748b', '&:hover': { color: '#2962ff' } }}
          >
            <EditIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )
    },
    {
      headerName: '',
      flex: 0.5,
      minWidth: 52,
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => (
        <Tooltip title="Delete target">
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteTarget(p.data.id)}
            sx={{ p: 0.5 }}
          >
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )
    }
  ], [categories, onViewStock, editTarget]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    suppressMovable: true,
  }), []);

  const triggeredCount = targets.filter(t => t.triggered).length;
  const nearTargetCount = targets.filter(t => t.distance_pct != null && Math.abs(t.distance_pct) <= 5).length;

  return (
    <Box className="fade-in">
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrackChangesIcon sx={{ color: '#2962ff' }} />
            Target Setting
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Set and track price targets across your portfolio
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={loadTargets}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => { setEditTarget(null); setNewTarget({ script: '', type: 'Buy', target_price: '', category: '', comment: '', bookmark: '' }); setAddDialogOpen(true); }}
            sx={{ borderRadius: 2 }}
          >
            Add Target
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Targets', value: targets.length, color: '#2962ff' },
          { label: 'Triggered', value: triggeredCount, color: '#10b981' },
          { label: 'Near Target (≤5%)', value: nearTargetCount, color: '#f59e0b' },
          { label: 'Showing', value: filteredTargets.length, color: '#8b5cf6' },
        ].map(c => (
          <Card key={c.label} sx={{ flex: 1, minWidth: 150, background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary">{c.label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: c.color }}>{c.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Filter Toolbar */}
      <Card sx={{ mb: 2, background: 'rgba(22,24,36,0.7)', border: '1px solid #2a2e43', borderRadius: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            {/* Holdings Only Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={holdingsOnly}
                  onChange={(e) => setHoldingsOnly(e.target.checked)}
                  size="small"
                  color="primary"
                />
              }
              label={<Typography variant="body2" sx={{ fontSize: 13 }}>Current Holdings Only</Typography>}
            />

            {/* Proximity Slider */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 220 }}>
              <Typography variant="body2" sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                Proximity ≤
              </Typography>
              <Slider
                value={proximityThreshold}
                onChange={(_, v) => setProximityThreshold(v as number)}
                min={1}
                max={100}
                size="small"
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}%`}
                sx={{ width: 120 }}
              />
              <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 600, color: '#2962ff', minWidth: 40 }}>
                {proximityThreshold}%
              </Typography>
            </Box>

            {/* Bookmark Filter */}
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel sx={{ fontSize: 13 }}>Bookmark</InputLabel>
              <Select
                value={bookmarkFilter}
                label="Bookmark"
                onChange={(e) => setBookmarkFilter(e.target.value)}
                sx={{ fontSize: 13 }}
              >
                <MenuItem value="all">All</MenuItem>
                {BOOKMARK_COLORS.map(b => (
                  <MenuItem key={b.key} value={b.key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FlagIcon sx={{ fontSize: 14, color: b.color }} />
                      {b.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Recency Filter */}
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: 13 }}>Recency</InputLabel>
              <Select
                value={recencyFilter}
                label="Recency"
                onChange={(e) => setRecencyFilter(e.target.value)}
                sx={{ fontSize: 13 }}
              >
                <MenuItem value="all">All Time</MenuItem>
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="3days">Past 3 Days</MenuItem>
                <MenuItem value="week">Past Week</MenuItem>
                <MenuItem value="month">Past Month</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* Loading bar */}
      {loading && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}

      {/* AG Grid Table */}
      <Box
        className="ag-theme-alpine-dark"
        sx={{
          height: 'calc(100vh - 400px)',
          minHeight: 400,
          '& .ag-root-wrapper': { border: '1px solid #2a2e43', borderRadius: '8px' },
          '& .ag-header': { bgcolor: '#161824 !important' },
          '& .ag-header-cell-text': { color: '#f8fafc !important', fontWeight: 600 },
          '& .ag-header-cell-label': { color: '#f8fafc !important' },
          '& .ag-header-icon': { color: '#94a3b8 !important' },
          '& .ag-row': { transition: 'background 0.15s' },
          '& .ag-row:hover': { bgcolor: 'rgba(41,98,255,0.05) !important' },
        }}
      >
        <AgGridReact
          theme="legacy"
          rowData={filteredTargets}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          animateRows={true}
          rowHeight={44}
          headerHeight={42}
          domLayout="normal"
          suppressCellFocus={true}
          getRowId={(params) => String(params.data.id)}
        />
      </Box>

      {/* Add / Edit Target Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => { setAddDialogOpen(false); setEditTarget(null); setNewTarget({ script: '', type: 'Buy', target_price: '', category: '', comment: '', bookmark: '' }); }}
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
          {/* Stock Name — autocomplete in create mode, read-only in edit mode */}
          {editTarget ? (
            <TextField
              label="Stock Name"
              size="small"
              fullWidth
              value={newTarget.script}
              disabled
              sx={{ mt: 1.5, mb: 2 }}
            />
          ) : (
            <Autocomplete
              freeSolo
              options={scripList}
              value={newTarget.script}
              onChange={(_, val) => setNewTarget({ ...newTarget, script: val || '' })}
              onInputChange={(_, val) => setNewTarget({ ...newTarget, script: val || '' })}
              getOptionLabel={(option) => {
                const display = typeof option === 'string' && option.endsWith('-EQ') ? option.slice(0, -3) : option;
                return display;
              }}
              renderOption={(props, option) => (
                <li {...props} key={option}>
                  <Typography sx={{ fontSize: 13 }}>
                    {option.endsWith('-EQ') ? option.slice(0, -3) : option}
                    <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary', ml: 1 }}>
                      {option}
                    </Typography>
                  </Typography>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} label="Stock Name" size="small" fullWidth sx={{ mt: 1.5, mb: 2 }} />
              )}
            />
          )}

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            {/* Type */}
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={newTarget.type}
                label="Type"
                onChange={(e) => setNewTarget({ ...newTarget, type: e.target.value })}
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
              value={newTarget.target_price}
              onChange={(e) => setNewTarget({ ...newTarget, target_price: e.target.value })}
              sx={{ flex: 1 }}
            />
          </Box>

          {/* Category */}
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={newTarget.category}
              label="Category"
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  setCategoryDialogOpen(true);
                } else {
                  setNewTarget({ ...newTarget, category: e.target.value });
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
            value={newTarget.comment}
            onChange={(e) => setNewTarget({ ...newTarget, comment: e.target.value })}
            sx={{ mb: 2 }}
          />

          {/* Bookmark */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontSize: 13, mr: 1 }}>Bookmark:</Typography>
            {BOOKMARK_COLORS.map(b => (
              <Tooltip key={b.key} title={b.label}>
                <IconButton
                  size="small"
                  onClick={() => setNewTarget({ ...newTarget, bookmark: newTarget.bookmark === b.key ? '' : b.key })}
                  sx={{
                    color: newTarget.bookmark === b.key ? b.color : 'rgba(255,255,255,0.2)',
                    border: newTarget.bookmark === b.key ? `2px solid ${b.color}` : '2px solid transparent',
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
          <Button
            onClick={() => { setAddDialogOpen(false); setEditTarget(null); setNewTarget({ script: '', type: 'Buy', target_price: '', category: '', comment: '', bookmark: '' }); }}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddOrSaveTarget}
            disabled={!newTarget.target_price || (!editTarget && !newTarget.script)}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {editTarget ? 'Save Changes' : 'Add Target'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Category Dialog */}
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

export default TargetSetting;
