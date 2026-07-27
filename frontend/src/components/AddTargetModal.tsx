import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography,
  Button, TextField, FormControl, InputLabel, Select, MenuItem, Tooltip,
  IconButton, Autocomplete
} from '@mui/material';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import FlagIcon from '@mui/icons-material/Flag';

const BOOKMARK_COLORS = [
  { key: 'red', color: '#ef4444', label: 'Red' },
  { key: 'orange', color: '#f59e0b', label: 'Orange' },
  { key: 'yellow', color: '#eab308', label: 'Yellow' },
  { key: 'green', color: '#10b981', label: 'Green' },
  { key: 'blue', color: '#2962ff', label: 'Blue' },
];

export interface AddTargetModalProps {
  open: boolean;
  onClose: () => void;
  initialScript?: string;
  initialCategory?: string;
  isLockedScript?: boolean;
  isLockedCategory?: boolean;
  onSuccess?: () => void;
}

export const AddTargetModal: React.FC<AddTargetModalProps> = ({
  open,
  onClose,
  initialScript = '',
  initialCategory = '',
  isLockedScript = false,
  isLockedCategory = false,
  onSuccess
}) => {
  const [script, setScript] = useState('');
  const [type, setType] = useState('Buy');
  const [targetPrice, setTargetPrice] = useState('');
  const [category, setCategory] = useState('');
  const [comment, setComment] = useState('');
  const [bookmark, setBookmark] = useState('');

  const [categories, setCategories] = useState<string[]>(['Mutual Funds']);
  const [scripList, setScripList] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setScript(initialScript);
      setCategory(initialCategory);
      setType('Buy');
      setTargetPrice('');
      setComment('');
      setBookmark('');
      
      // Load categories & scrips if needed
      axios.get('/api/target-categories')
        .then(res => {
          const list: string[] = res.data || [];
          if (initialCategory && !list.includes(initialCategory)) {
            list.push(initialCategory);
          }
          setCategories(list);
        })
        .catch(err => console.error('Failed to load target categories:', err));

      axios.get('/api/targets/scrips')
        .then(res => setScripList(res.data || []))
        .catch(err => console.error('Failed to load scrips:', err));
    }
  }, [open, initialScript, initialCategory]);

  const handleSubmit = async () => {
    if (!script.trim() || !targetPrice) return;

    try {
      setSubmitting(true);
      await axios.post('/api/targets', {
        script: script.trim(),
        type,
        target_price: parseFloat(targetPrice),
        category: category || null,
        comment: comment.trim() || null,
        bookmark: bookmark || null,
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Failed to create target:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: { sx: { background: '#161824', border: '1px solid #2a2e43', borderRadius: 3 } }
      }}
    >
      <DialogTitle sx={{ fontWeight: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrackChangesIcon sx={{ color: '#2962ff' }} />
          Add new Target
        </Box>
      </DialogTitle>
      <DialogContent>
        {/* Stock Name Field */}
        {isLockedScript ? (
          <TextField
            label="Stock Name"
            size="small"
            fullWidth
            value={script.endsWith('-EQ') ? script.slice(0, -3) : script}
            disabled
            sx={{
              mt: 1.5, mb: 2,
              '& .MuiInputBase-input.Mui-disabled': {
                WebkitTextFillColor: '#2962ff',
                fontWeight: 700
              }
            }}
          />
        ) : (
          <Autocomplete
            freeSolo
            options={scripList}
            value={script}
            onChange={(_, val) => setScript(val || '')}
            onInputChange={(_, val) => setScript(val || '')}
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
              value={type}
              label="Type"
              onChange={(e) => setType(e.target.value)}
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
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            sx={{ flex: 1 }}
          />
        </Box>

        {/* Category Field */}
        {isLockedCategory ? (
          <TextField
            label="Category"
            size="small"
            fullWidth
            value={category}
            disabled
            sx={{
              mb: 2,
              '& .MuiInputBase-input.Mui-disabled': {
                WebkitTextFillColor: '#8b5cf6',
                fontWeight: 700
              }
            }}
          />
        ) : (
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map(cat => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Comment Field */}
        <TextField
          fullWidth
          multiline
          rows={3}
          size="small"
          label="Comments"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          sx={{ mb: 2 }}
        />

        {/* Bookmark Selection */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ fontSize: 13, mr: 1 }}>Bookmark:</Typography>
          {BOOKMARK_COLORS.map(b => (
            <Tooltip key={b.key} title={b.label}>
              <IconButton
                size="small"
                onClick={() => setBookmark(bookmark === b.key ? '' : b.key)}
                sx={{
                  color: bookmark === b.key ? b.color : 'rgba(255,255,255,0.2)',
                  border: bookmark === b.key ? `2px solid ${b.color}` : '2px solid transparent',
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
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !targetPrice || (!isLockedScript && !script.trim())}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          {submitting ? 'Adding...' : 'Add Target'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddTargetModal;
