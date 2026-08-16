import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { removeNotifiedTargetId } from '../store/portfolioSlice';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, Button, Chip, Switch, Slider,
  FormControl, InputLabel, Select, MenuItem, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, Tooltip, Autocomplete,
  FormControlLabel, LinearProgress, Menu
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

const getCategoryStyles = (category: string) => {
  if (!category) return { bgcolor: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.1)' };
  const normalized = category.trim().toLowerCase();
  switch (normalized) {
    case 'technical':
      return { bgcolor: 'rgba(41, 98, 255, 0.15)', color: '#2962ff', border: '1px solid rgba(41, 98, 255, 0.3)' };
    case 'fundamental':
      return { bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' };
    case 'target change':
      return { bgcolor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' };
    case 'news':
      return { bgcolor: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.3)' };
    case 'general':
      return { bgcolor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' };
    case 'mutual funds':
      return { bgcolor: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' };
    default: {
      let hash = 0;
      for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash % 360);
      return {
        bgcolor: `hsla(${hue}, 70%, 50%, 0.15)`,
        color: `hsl(${hue}, 85%, 65%)`,
        border: `1px solid hsla(${hue}, 70%, 50%, 0.3)`,
      };
    }
  }
};

const TargetSetting: React.FC<TargetSettingProps> = ({ onViewStock }) => {
  const dispatch = useAppDispatch();
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
  // For create mode, targetRows holds multiple Type/Price pairs.
  // For edit mode, only the first entry is used.
  const [targetRows, setTargetRows] = useState<{ type: string; target_price: string }[]>([
    { type: 'Buy', target_price: '' },
  ]);
  const [dialogCommon, setDialogCommon] = useState({
    script: '',
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

  // Build an aggregated holdings lookup keyed by script.
  // Stocks held across multiple brokers are summed for qty & current_value;
  // change_in_ltp_pct is taken from the first occurrence (same stock = same LTP).
  const holdingsMap = useMemo(() => {
    const map: Record<string, { qty: number; currentValue: number; ltpChgPct: number | null }> = {};
    for (const h of allHoldings) {
      const key = h.script as string;
      if (!map[key]) {
        map[key] = { qty: 0, currentValue: 0, ltpChgPct: h.change_in_ltp_pct ?? null };
      }
      map[key].qty += Number(h.quantity || 0);
      map[key].currentValue += Number(h.current_value || 0);
      // Keep first non-null LTP change %
      if (map[key].ltpChgPct == null && h.change_in_ltp_pct != null) {
        map[key].ltpChgPct = h.change_in_ltp_pct;
      }
    }
    return map;
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

  const resetDialog = () => {
    setAddDialogOpen(false);
    setEditTarget(null);
    setTargetRows([{ type: 'Buy', target_price: '' }]);
    setDialogCommon({ script: '', category: '', comment: '', bookmark: '' });
  };

  const handleOpenEdit = (target: any) => {
    setEditTarget(target);
    setTargetRows([{
      type: target.type || 'Buy',
      target_price: target.target_price != null ? String(target.target_price) : '',
    }]);
    setDialogCommon({
      script: target.script || '',
      category: target.category || '',
      comment: target.comment || '',
      bookmark: target.bookmark || '',
    });
    setAddDialogOpen(true);
  };

  const handleAddOrSaveTarget = async () => {
    try {
      if (editTarget) {
        // Edit mode — single target PUT
        const row = targetRows[0];
        if (!row.target_price) return;
        await axios.put(`/api/targets/${editTarget.id}`, {
          type: row.type,
          target_price: parseFloat(row.target_price),
          category: dialogCommon.category || null,
          comment: dialogCommon.comment || null,
          bookmark: dialogCommon.bookmark || null,
        });
      } else {
        // Create mode — POST each target row
        if (!dialogCommon.script) return;
        const validRows = targetRows.filter(r => r.target_price);
        if (validRows.length === 0) return;
        for (const row of validRows) {
          await axios.post('/api/targets', {
            script: dialogCommon.script,
            type: row.type,
            target_price: parseFloat(row.target_price),
            category: dialogCommon.category || null,
            comment: dialogCommon.comment || null,
            bookmark: dialogCommon.bookmark || null,
          });
        }
      }
      resetDialog();
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

  const fmtNoDecimals = (n: any) => {
    if (n == null || isNaN(n)) return '—';
    return `₹${Math.round(Number(n)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
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
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    if (!data) return null;
    const currentBookmark = BOOKMARK_COLORS.find(b => b.key === data.bookmark);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
      setAnchorEl(null);
    };

    const handleSelectColor = (colorKey: string) => {
      const newBookmarkValue = data.bookmark === colorKey ? '' : colorKey;
      handleUpdateTarget(data.id, 'bookmark', newBookmarkValue);
      handleClose();
    };

    return (
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Tooltip title={currentBookmark ? `Bookmark: ${currentBookmark.label}` : 'Set Bookmark'}>
          <IconButton
            size="small"
            onClick={handleClick}
            sx={{
              color: currentBookmark ? currentBookmark.color : 'rgba(255,255,255,0.25)',
              '&:hover': { color: currentBookmark ? currentBookmark.color : '#f8fafc', transform: 'scale(1.1)' }
            }}
          >
            <FlagIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          slotProps={{
            paper: {
              sx: {
                background: '#161824',
                border: '1px solid #2a2e43',
                borderRadius: 2
              }
            }
          }}
        >
          {BOOKMARK_COLORS.map(b => (
            <MenuItem
              key={b.key}
              onClick={() => handleSelectColor(b.key)}
              sx={{
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                color: data.bookmark === b.key ? b.color : 'text.primary',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
              }}
            >
              <FlagIcon sx={{ fontSize: 16, color: b.color }} />
              {b.label} {data.bookmark === b.key ? '(Selected)' : ''}
            </MenuItem>
          ))}
          {data.bookmark && (
            <MenuItem
              onClick={() => handleSelectColor('')}
              sx={{
                fontSize: 13,
                color: 'error.main',
                borderTop: '1px solid #2a2e43',
                mt: 0.5,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
              }}
            >
              Clear Bookmark
            </MenuItem>
          )}
        </Menu>
      </Box>
    );
  };

  const columnDefs = useMemo(() => [
    {
      field: 'date',
      headerName: 'Date',
      flex: 0.77,
      minWidth: 70,
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString('en-IN') : '—',
      sort: 'desc' as const
    },
    {
      headerName: 'No. of Days',
      flex: 0.9,
      minWidth: 90,
      valueGetter: (params: any) => {
        if (!params.data.date) return null;
        const targetDate = new Date(params.data.date);
        const today = new Date();
        const d1 = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const d2 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        const diffDays = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 ? diffDays : 0;
      },
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'center', width: '100%', color: '#cbd5e1' }}>
          {p.value === null || p.value === undefined ? '—' : `${p.value}d`}
        </span>
      )
    },
    {
      field: 'script',
      headerName: 'Stock Name',
      flex: 1.05,
      minWidth: 98,
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
      headerName: 'Qty',
      flex: 0.7,
      minWidth: 70,
      valueGetter: (params: any) => {
        const hld = holdingsMap[params.data.script];
        return hld ? hld.qty : null;
      },
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%', color: '#cbd5e1' }}>
          {p.value != null ? p.value.toLocaleString('en-IN') : '—'}
        </span>
      )
    },
    {
      headerName: 'Current Value',
      flex: 1,
      minWidth: 110,
      valueGetter: (params: any) => {
        const hld = holdingsMap[params.data.script];
        return hld ? hld.currentValue : null;
      },
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%', color: '#cbd5e1' }}>
          {p.value != null ? fmt(p.value) : '—'}
        </span>
      )
    },
    {
      headerName: 'LTP Chg %',
      flex: 0.8,
      minWidth: 90,
      valueGetter: (params: any) => {
        const hld = holdingsMap[params.data.script];
        return hld ? hld.ltpChgPct : null;
      },
      cellRenderer: (p: any) => {
        if (p.value == null) return <span style={{ color: '#64748b' }}>—</span>;
        const color = p.value >= 0 ? '#10b981' : '#ef4444';
        return (
          <span style={{ color, fontWeight: 600, display: 'block', textAlign: 'right', width: '100%' }}>
            {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
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
      flex: 0.6,
      minWidth: 66,
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%', fontWeight: 600 }}>
          {fmt(p.value)}
        </span>
      )
    },
    {
      field: 'ltp',
      headerName: 'LTP',
      flex: 0.6,
      minWidth: 60,
      cellRenderer: (p: any) => (
        <span style={{ display: 'block', textAlign: 'right', width: '100%' }}>
          {fmtNoDecimals(p.value)}
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
      cellRenderer: (p: any) => {
        if (!p.value) return <span style={{ color: '#64748b' }}>—</span>;
        const styles = getCategoryStyles(p.value);
        return (
          <Chip
            label={p.value}
            size="small"
            sx={{
              bgcolor: styles.bgcolor,
              color: styles.color,
              border: styles.border,
              fontSize: 11,
              fontWeight: 600
            }}
          />
        );
      }
    },
    {
      field: 'comment',
      headerName: 'Comments',
      flex: 2.82,
      minWidth: 285,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (p: any) => (
        <div style={{ color: '#cbd5e1', fontSize: 12, whiteSpace: 'normal', wordBreak: 'break-word', padding: '4px 0', lineHeight: '1.4' }}>
          {p.value || '—'}
        </div>
      )
    },
    {
      field: 'triggered',
      headerName: 'Triggered',
      flex: 0.8,
      minWidth: 90,
      cellRenderer: (p: any) => {
        const isTriggered = !!p.value;
        const handleTriggerToggle = async (e: React.MouseEvent) => {
          e.stopPropagation();
          const targetVal = isTriggered ? 0 : 1;
          try {
            await axios.put(`/api/targets/${p.data.id}`, { triggered: targetVal });
            if (!targetVal) {
              dispatch(removeNotifiedTargetId(p.data.id));
            }
            loadTargets();
          } catch (err) {
            console.error('Failed to toggle triggered status:', err);
          }
        };

        return (
          <Box 
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer' }}
            onClick={handleTriggerToggle}
          >
            {isTriggered ? (
              <CheckCircleIcon sx={{ color: '#10b981', fontSize: 20 }} />
            ) : (
              <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #475569' }} />
            )}
          </Box>
        );
      }
    },
    {
      field: 'bookmark',
      headerName: 'Bookmark',
      flex: 0.6,
      minWidth: 65,
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
  ], [categories, onViewStock, editTarget, dispatch, loadTargets, holdingsMap]);

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
            onClick={() => { setEditTarget(null); setTargetRows([{ type: 'Buy', target_price: '' }]); setDialogCommon({ script: '', category: '', comment: '', bookmark: '' }); setAddDialogOpen(true); }}
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
        onClose={resetDialog}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { background: '#161824', border: '1px solid #2a2e43', borderRadius: 3 } } }}
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
              value={dialogCommon.script}
              disabled
              sx={{ mt: 1.5, mb: 2 }}
            />
          ) : (
            <Autocomplete
              freeSolo
              options={scripList}
              value={dialogCommon.script}
              onChange={(_, val) => setDialogCommon({ ...dialogCommon, script: val || '' })}
              onInputChange={(_, val) => setDialogCommon({ ...dialogCommon, script: val || '' })}
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

          {/* Type / Target Price rows */}
          {targetRows.map((row, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 2, mb: 1.5, alignItems: 'center' }}>
              {/* Type */}
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={row.type}
                  label="Type"
                  onChange={(e) => {
                    const updated = [...targetRows];
                    updated[idx] = { ...updated[idx], type: e.target.value };
                    setTargetRows(updated);
                  }}
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
                value={row.target_price}
                onChange={(e) => {
                  const updated = [...targetRows];
                  updated[idx] = { ...updated[idx], target_price: e.target.value };
                  setTargetRows(updated);
                }}
                sx={{ flex: 1 }}
              />

              {/* Remove button (only if more than 1 row and in create mode) */}
              {!editTarget && targetRows.length > 1 && (
                <IconButton
                  size="small"
                  onClick={() => setTargetRows(targetRows.filter((_, i) => i !== idx))}
                  sx={{ color: '#ef4444', '&:hover': { bgcolor: 'rgba(239,68,68,0.1)' } }}
                >
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Box>
          ))}

          {/* +Add More button — only in create mode */}
          {!editTarget && (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setTargetRows([...targetRows, { type: 'Buy', target_price: '' }])}
              sx={{
                textTransform: 'none',
                fontSize: 12,
                fontWeight: 600,
                color: '#2962ff',
                mb: 2,
                '&:hover': { bgcolor: 'rgba(41,98,255,0.08)' },
              }}
            >
              Add More
            </Button>
          )}

          {/* Category */}
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={dialogCommon.category}
              label="Category"
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  setCategoryDialogOpen(true);
                } else {
                  setDialogCommon({ ...dialogCommon, category: e.target.value });
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
            value={dialogCommon.comment}
            onChange={(e) => setDialogCommon({ ...dialogCommon, comment: e.target.value })}
            sx={{ mb: 2 }}
          />

          {/* Bookmark Select Dropdown */}
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Bookmark</InputLabel>
            <Select
              value={dialogCommon.bookmark}
              label="Bookmark"
              onChange={(e) => setDialogCommon({ ...dialogCommon, bookmark: e.target.value })}
              renderValue={(value) => {
                const selected = BOOKMARK_COLORS.find(b => b.key === value);
                return selected ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlagIcon sx={{ fontSize: 16, color: selected.color }} />
                    {selected.label}
                  </Box>
                ) : 'None';
              }}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {BOOKMARK_COLORS.map(b => (
                <MenuItem key={b.key} value={b.key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlagIcon sx={{ fontSize: 16, color: b.color }} />
                    {b.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button
            onClick={resetDialog}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddOrSaveTarget}
            disabled={
              editTarget
                ? !targetRows[0]?.target_price
                : (!dialogCommon.script || targetRows.every(r => !r.target_price))
            }
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {editTarget ? 'Save Changes' : `Add Target${targetRows.length > 1 ? `s (${targetRows.filter(r => r.target_price).length})` : ''}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { background: '#161824', border: '1px solid #2a2e43', borderRadius: 3 } } }}
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
