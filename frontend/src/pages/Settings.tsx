import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, Grid, TextField, Button, Alert,
  Divider, IconButton, InputAdornment, CircularProgress, Snackbar
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SaveIcon from '@mui/icons-material/Save';
import StorefrontIcon from '@mui/icons-material/Storefront';

interface BrokerConfig {
  key: string;
  label: string;
  color: string;
  fields: {
    key: string;
    label: string;
    type: 'text' | 'password';
    required: boolean;
    helperText?: string;
  }[];
}

const Settings: React.FC = () => {
  const brokers: BrokerConfig[] = [
    {
      key: 'mstock',
      label: 'MStock',
      color: '#2962ff',
      fields: [
        { key: 'username', label: 'User ID (MA108170...)', type: 'text', required: true },
        { key: 'password', label: 'Password', type: 'password', required: true },
        { key: 'api_key', label: 'API Key (Type A)', type: 'password', required: true },
        { key: 'totp_key', label: 'TOTP Secret Key (optional)', type: 'password', required: false, helperText: 'Enable automatic 2FA TOTP' }
      ]
    },
    {
      key: 'zerodha',
      label: 'Zerodha (Kite)',
      color: '#f59e0b',
      fields: [
        { key: 'username', label: 'User ID (RIM5044...)', type: 'text', required: true },
        { key: 'password', label: 'Password', type: 'password', required: true },
        { key: 'api_key', label: 'API Key', type: 'password', required: true },
        { key: 'api_secret', label: 'API Secret', type: 'password', required: true },
        { key: 'pin', label: 'PIN (optional)', type: 'password', required: false },
        { key: 'totp_key', label: 'TOTP Secret Key (optional)', type: 'password', required: false, helperText: 'Enable automatic 2FA TOTP' }
      ]
    },
    {
      key: 'dhan',
      label: 'Dhan',
      color: '#10b981',
      fields: [
        { key: 'username', label: 'Client ID', type: 'text', required: true },
        { key: 'password', label: 'Access Token', type: 'password', required: true }
      ]
    }
  ];

  const [creds, setCreds] = useState<Record<string, Record<string, string>>>({
    mstock: { username: '', password: '', api_key: '', totp_key: '' },
    zerodha: { username: '', password: '', api_key: '', api_secret: '', pin: '', totp_key: '' },
    dhan: { username: '', password: '' }
  });

  const [showPass, setShowPass] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Load existing credentials on mount
  useEffect(() => {
    const fetchCreds = async () => {
      try {
        const res = await axios.get('/api/credentials');
        const loaded: Record<string, Record<string, string>> = {};
        
        // Initialize with blanks
        brokers.forEach(b => {
          loaded[b.key] = {};
          b.fields.forEach(f => {
            loaded[b.key][f.key] = '';
          });
        });

        // Populate with loaded values
        res.data.forEach((c: any) => {
          const key = c.broker_name.toLowerCase();
          if (loaded[key]) {
            loaded[key].username = c.username || '';
            loaded[key].api_key = c.api_key || '';
            // Passwords, secrets, pins, totp_keys are kept masked on return
            if (c.has_password) loaded[key].password = '********';
            if (c.has_pin) loaded[key].pin = '********';
            if (c.has_totp) loaded[key].totp_key = '********';
            if (c.api_secret) loaded[key].api_secret = '********';
          }
        });
        
        setCreds(prev => ({ ...prev, ...loaded }));
      } catch (err) {
        console.error('Failed to load credentials', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCreds();
  }, []);

  const handleChange = (broker: string, field: string, value: string) => {
    setCreds(prev => ({
      ...prev,
      [broker]: {
        ...prev[broker],
        [field]: value
      }
    }));
  };

  const handleSave = async (brokerConfig: BrokerConfig) => {
    const bKey = brokerConfig.key;
    const c = creds[bKey];
    
    // Validate required fields
    for (const f of brokerConfig.fields) {
      if (f.required && !c[f.key]) {
        setToast({ open: true, message: `${f.label} is required for ${brokerConfig.label}.`, severity: 'error' });
        return;
      }
    }

    setSaving(bKey);
    try {
      await axios.post('/api/credentials', {
        broker_name: bKey,
        username: c.username,
        password: c.password === '********' ? '' : c.password,
        pin: c.pin === '********' ? '' : (c.pin || null),
        totp_key: c.totp_key === '********' ? '' : (c.totp_key || null),
        api_key: c.api_key || null,
        api_secret: c.api_secret === '********' ? '' : (c.api_secret || null)
      });
      setToast({ open: true, message: `${brokerConfig.label} credentials saved securely!`, severity: 'success' });
    } catch (err: any) {
      setToast({ open: true, message: err.response?.data?.detail || 'Failed to save credentials.', severity: 'error' });
    } finally {
      setSaving('');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="fade-in">
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Settings</Typography>
        <Typography variant="body2" color="text.secondary">
          Configure broker API keys and login credentials for live synchronization. All keys are encrypted locally using AES-256.
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Credentials are encrypted using AES-256 Fernet encryption and stored locally. They are never sent to external servers.
        Providing a TOTP key allows automatic 2FA logins without manual OTP entries.
      </Alert>

      <Grid container spacing={3}>
        {brokers.map(b => (
          <Grid size={{ xs: 12, md: 4 }} key={b.key}>
            <Card sx={{ background: 'rgba(22,24,36,0.7)', border: `1px solid ${b.color}44`, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                  <StorefrontIcon sx={{ color: b.color }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: b.color }}>{b.label}</Typography>
                </Box>

                <Box sx={{ flexGrow: 1 }}>
                  {b.fields.map(f => {
                    const isPassType = f.type === 'password';
                    const showPassKey = `${b.key}_${f.key}`;
                    const isVisible = showPass[showPassKey];

                    return (
                      <TextField
                        key={f.key}
                        fullWidth
                        size="small"
                        label={f.label}
                        helperText={f.helperText}
                        type={isPassType && !isVisible ? 'password' : 'text'}
                        value={creds[b.key][f.key] || ''}
                        onChange={e => handleChange(b.key, f.key, e.target.value)}
                        sx={{ mb: 2.5 }}
                        slotProps={isPassType ? {
                          input: {
                            endAdornment: (
                              <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setShowPass(p => ({ ...p, [showPassKey]: !p[showPassKey] }))}>
                                  {isVisible ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                                </IconButton>
                              </InputAdornment>
                            )
                          }
                        } : undefined}
                      />
                    );
                  })}
                </Box>

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={saving === b.key ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  onClick={() => handleSave(b)}
                  disabled={saving === b.key}
                  sx={{ mt: 'auto', bgcolor: b.color, '&:hover': { bgcolor: b.color, opacity: 0.85 } }}
                >
                  Save {b.label}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={toast.severity} onClose={() => setToast(t => ({ ...t, open: false }))}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default Settings;
