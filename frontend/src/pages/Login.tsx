import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { setCredentials } from '../store/authSlice';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Alert, CircularProgress, Divider, InputAdornment, IconButton
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

const Login: React.FC = () => {
  const dispatch = useDispatch();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      dispatch(setCredentials({ token: res.data.access_token, username }));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0c0d14 0%, #1a1f35 50%, #0c0d14 100%)',
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Background grid lines */}
      <Box sx={{
        position: 'absolute', inset: 0, opacity: 0.03,
        backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      <Card className="glass-panel fade-in" sx={{
        width: 420, p: 1,
        background: 'rgba(22, 24, 36, 0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid #2a2e43',
        borderRadius: 3
      }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 1 }}>
              <TrendingUpIcon sx={{ fontSize: 36, color: 'primary.main' }} />
              <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
                Antigravity
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Unified Stock Trading Dashboard
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={handleLogin}>
            <TextField
              fullWidth label="Username" value={username}
              onChange={e => setUsername(e.target.value)}
              sx={{ mb: 2 }} autoComplete="username"
            />
            <TextField
              fullWidth label="Password" value={password}
              onChange={e => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'}
              sx={{ mb: 3 }} autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <Button
              type="submit" variant="contained" fullWidth size="large"
              disabled={loading} sx={{ py: 1.5, fontWeight: 700, fontSize: 16 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>
          </form>

          <Divider sx={{ my: 3 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
            Default credentials: admin / admin
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
