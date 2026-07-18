import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useAppSelector } from './store';
import axios from 'axios';
import { logOut, setCredentials } from './store/authSlice';
import {
  setHoldings,
  setTransactions,
  setImportHistory,
  setSettlement,
  setAnalytics,
  setAuditLogs,
  setAutomationStatus,
  setTargets,
  setTargetCategories
} from './store/portfolioSlice';

// Import Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Holdings from './pages/Holdings';
import Transactions from './pages/Transactions';
import LIFOSettlement from './pages/LIFOSettlement';
import Analytics from './pages/Analytics';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import StockSummary from './pages/StockSummary';
import OrderBook from './pages/OrderBook';
import MutualFunds from './pages/MutualFunds';
import TargetSetting from './pages/TargetSetting';

// Material UI components
import {
  ThemeProvider,
  createTheme,
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Button,
  Badge,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Divider,
  Snackbar,
  Alert
} from '@mui/material';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ListAltIcon from '@mui/icons-material/ListAlt';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import BarChartIcon from '@mui/icons-material/BarChart';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';

const drawerWidth = 260;

// Premium dark theme configuration
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2962ff', // Sleek TradingView blue
    },
    background: {
      default: '#0c0d14', // Primary dark background
      paper: '#161824', // Card and sidebar background
    },
    text: {
      primary: '#f8fafc',
      secondary: '#94a3b8',
    },
    divider: '#2a2e43',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", Arial, sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
});

// Axios defaults — no baseURL needed because Vite proxy forwards /api → http://127.0.0.1:8000
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const dispatch = useDispatch();
  const { isAuthenticated, username } = useAppSelector((state) => state.auth);
  const allHoldings = useAppSelector((state) => state.portfolio.holdings);

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);

  // Refresh tracking
  const [priceTimer, setPriceTimer] = useState<number>(10);
  const [holdingsTimer, setHoldingsTimer] = useState<number>(30);
  const [globalLoading, setGlobalLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // OTP Modal State
  const [otpModal, setOtpModal] = useState<{ open: boolean; broker: string; otpText: string }>({
    open: false,
    broker: '',
    otpText: ''
  });

  // Handle Token Expiry on API requests
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response && error.response.status === 401) {
        dispatch(logOut());
      }
      return Promise.reject(error);
    }
  );

  // Fetch all core portfolio data
  const fetchAllData = async (refreshPrices = false) => {
    if (!isAuthenticated) return;
    try {
      setGlobalLoading(true);

      // Fetch holdings
      const holdingsRes = await axios.get(`/api/holdings?refresh_prices=${refreshPrices}`);
      dispatch(setHoldings(holdingsRes.data));

      // Fetch transactions
      const txsRes = await axios.get('/api/transactions');
      dispatch(setTransactions(txsRes.data));

      // Fetch import history
      const historyRes = await axios.get('/api/transactions/history');
      dispatch(setImportHistory(historyRes.data));

      // Fetch LIFO Settlement
      const settlementRes = await axios.get('/api/settlement');
      dispatch(setSettlement(settlementRes.data));

      // Fetch Analytics
      const analyticsRes = await axios.get('/api/analytics');
      dispatch(setAnalytics(analyticsRes.data));

      // Fetch Audit Logs
      const logsRes = await axios.get('/api/logs');
      dispatch(setAuditLogs(logsRes.data));

      // Fetch Targets & Categories
      try {
        const targetsRes = await axios.get('/api/targets');
        dispatch(setTargets(targetsRes.data));
        const catsRes = await axios.get('/api/target-categories');
        dispatch(setTargetCategories(catsRes.data));
      } catch (tErr) {
        console.error('Failed to load targets/categories:', tErr);
      }

    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to sync data.', 'error');
    } finally {
      setGlobalLoading(false);
    }
  };

  const showToast = (message: string, severity: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ open: true, message, severity });
  };

  // Trigger manual transaction folder scan
  const handleScanDirectory = async () => {
    try {
      setGlobalLoading(true);
      const res = await axios.post('/api/transactions/scan');
      const importedCount = res.data.imported_files?.length || 0;
      const errorsCount = res.data.errors?.length || 0;

      if (importedCount > 0) {
        showToast(`Scan complete: Imported ${importedCount} files successfully!`, 'success');
        fetchAllData(false);
      } else if (errorsCount > 0) {
        showToast(`Scan complete with errors. Check audit logs.`, 'error');
        fetchAllData(false);
      } else {
        showToast(`Scan complete: No new transaction files found.`, 'info');
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Scan failed.', 'error');
    } finally {
      setGlobalLoading(false);
    }
  };

  // Poll automation scraper status when active
  const checkScraperStatus = async (broker: string) => {
    try {
      const res = await axios.get(`/api/automation/status/${broker}`);
      const { status, error } = res.data;

      dispatch(setAutomationStatus({ broker, status, error, otpRequired: status === 'AWAITING_OTP' }));

      if (status === 'AWAITING_OTP') {
        setOtpModal({ open: true, broker, otpText: '' });
        return false; // Stop polling while waiting for OTP
      }

      if (status === 'SUCCESS') {
        showToast(`Holdings scraped successfully for ${broker.toUpperCase()}`, 'success');
        fetchAllData(true);
        return true; // Stop polling
      }

      if (status === 'FAILED') {
        showToast(`Holdings scraping failed for ${broker.toUpperCase()}: ${error}`, 'error');
        fetchAllData(false);
        return true; // Stop polling
      }

      return false; // Keep polling
    } catch (err) {
      return true; // Stop polling on error
    }
  };

  // Start scraper thread
  const triggerScrape = async (broker: string) => {
    try {
      showToast(`Initiating background browser login and scraper for ${broker.toUpperCase()}...`, 'info');
      await axios.post(`/api/automation/scrape/${broker}`);

      // Start polling status
      const interval = setInterval(async () => {
        const done = await checkScraperStatus(broker);
        if (done) clearInterval(interval);
      }, 2000);

    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Scraping request failed.', 'error');
    }
  };

  // Submit OTP
  const handleSubmitOtp = async () => {
    try {
      await axios.post(`/api/automation/otp/${otpModal.broker}`, { otp: otpModal.otpText });
      showToast(`OTP submitted for ${otpModal.broker.toUpperCase()}. Resuming login...`, 'success');
      setOtpModal({ open: false, broker: '', otpText: '' });

      // Resume polling
      const broker = otpModal.broker;
      const interval = setInterval(async () => {
        const done = await checkScraperStatus(broker);
        if (done) clearInterval(interval);
      }, 2000);

    } catch (err: any) {
      showToast('Failed to submit OTP.', 'error');
    }
  };

  // Setup periodic updates and load initial data
  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData(true);
    }
  }, [isAuthenticated]);

  // Timers for live data refreshing
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      // 10s Price refresh
      setPriceTimer((prev) => {
        if (prev <= 1) {
          fetchAllData(true); // Refreshes and grabs live prices
          return 10;
        }
        return prev - 1;
      });

      // 30s Holdings refresh
      setHoldingsTimer((prev) => {
        if (prev <= 1) {
          // Trigger scans / auto-refreshes if needed
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Navigate to Stock Summary detailed view
  const handleViewStock = (scrip: string) => {
    setSelectedStock(scrip);
    setActiveTab('stock-summary');
  };

  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={darkTheme}>
        <Login />
      </ThemeProvider>
    );
  }

  // Render appropriate page component based on activeTab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onViewStock={handleViewStock} onScrape={triggerScrape} />;
      case 'holdings':
        return <Holdings onViewStock={handleViewStock} onScrape={triggerScrape} />;
      case 'targets':
        return <TargetSetting onViewStock={handleViewStock} />;
      case 'order-book':
        return <OrderBook onViewStock={handleViewStock} />;
      case 'transactions':
        return <Transactions onViewStock={handleViewStock} />;
      case 'lifo':
        return <LIFOSettlement onViewStock={handleViewStock} />;
      case 'analytics':
        return <Analytics />;
      case 'mutual-funds':
        return <MutualFunds onViewStock={handleViewStock} />;
      case 'logs':
        return <AuditLogs />;
      case 'settings':
        return <Settings />;
      case 'stock-summary':
        return selectedStock ? (
          <StockSummary 
            scrip={selectedStock} 
            onBack={() => setActiveTab('holdings')} 
            scripList={allHoldings.map((h: any) => h.script)}
            onSelectScrip={handleViewStock}
            onRefreshData={() => fetchAllData(false)}
          />
        ) : (
          <Dashboard onViewStock={handleViewStock} onScrape={triggerScrape} />
        );
      default:
        return <Dashboard onViewStock={handleViewStock} onScrape={triggerScrape} />;
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <Box sx={{ display: 'flex', minHeight: 'screen', bgcolor: 'background.default' }}>

        {/* App Bar (Header) */}
        <AppBar
          position="fixed"
          sx={{
            width: `calc(100% - ${drawerWidth}px)`,
            ml: `${drawerWidth}px`,
            borderBottom: '1px solid #2a2e43',
            boxShadow: 'none',
            bgcolor: 'background.paper',
            backgroundImage: 'none'
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
              {activeTab === 'stock-summary' ? `Details: ${selectedStock}` : activeTab.toUpperCase()}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Active Timers */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge badgeContent={priceTimer} color="primary" max={99}>
                  <IconButton disabled size="small" sx={{ color: 'text.secondary' }}>
                    <RefreshIcon fontSize="small" className="pulse-animation" />
                  </IconButton>
                </Badge>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                  Price (LTP) Update in {priceTimer}s
                </Typography>
              </Box>

              {/* Sync Directories */}
              <Button
                variant="outlined"
                startIcon={<FolderOpenIcon />}
                onClick={handleScanDirectory}
                size="small"
                disabled={globalLoading}
              >
                Scan Local Imports
              </Button>

              {/* Sync Holdings */}
              <IconButton
                onClick={() => fetchAllData(true)}
                disabled={globalLoading}
                sx={{ color: 'primary.main' }}
              >
                {globalLoading ? <CircularProgress size={24} /> : <RefreshIcon />}
              </IconButton>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Sidebar Drawer */}
        <Drawer
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              borderRight: '1px solid #2a2e43',
              bgcolor: 'background.paper',
            },
          }}
          variant="permanent"
          anchor="left"
        >
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
              <SwapHorizIcon fontSize="large" /> Antigravity
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Unified Stock Dashboard
            </Typography>
          </Box>

          <Divider />

          <List sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {[
              { id: 'dashboard', text: 'Dashboard', icon: <DashboardIcon /> },
              { id: 'holdings', text: 'Live Holdings', icon: <AccountBalanceWalletIcon /> },
              { id: 'targets', text: 'Target Setting', icon: <TrackChangesIcon /> },
              { id: 'order-book', text: 'Order Book', icon: <AssignmentIcon /> },
              { id: 'transactions', text: 'Consolidated Portfolio', icon: <ListAltIcon /> },
              { id: 'lifo', text: 'LIFO Settlement', icon: <SwapHorizIcon /> },
              { id: 'analytics', text: 'Analytics', icon: <BarChartIcon /> },
              { id: 'mutual-funds', text: 'Mutual Funds', icon: <AssessmentIcon /> },
              { id: 'logs', text: 'Audit Logs', icon: <ReceiptIcon /> },
              { id: 'settings', text: 'Settings', icon: <SettingsIcon /> },
            ].map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  selected={activeTab === item.id || (item.id === 'holdings' && activeTab === 'stock-summary')}
                  onClick={() => {
                    setActiveTab(item.id);
                    setSelectedStock(null);
                  }}
                  sx={{
                    borderRadius: 2,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'white',
                      '& .MuiListItemIcon-root': {
                        color: 'white',
                      },
                    },
                    '&:hover': {
                      bgcolor: 'rgba(41, 98, 255, 0.08)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: activeTab === item.id ? 'white' : 'text.secondary', minWidth: 40 }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.text} slotProps={{ primary: { sx: { fontWeight: activeTab === item.id ? 600 : 500 } } }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          {/* User Profile Footer */}
          <Box sx={{ mt: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1 }}>
              <PersonIcon color="primary" />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {username || 'Trader'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Administrator
                </Typography>
              </Box>
            </Box>
            <Button
              variant="text"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={() => dispatch(logOut())}
              sx={{ justifyContent: 'flex-start', mt: 1 }}
            >
              Sign Out
            </Button>
          </Box>
        </Drawer>

        {/* Main Content Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: `calc(100% - ${drawerWidth}px)`,
            mt: '64px',
            minHeight: 'calc(100vh - 64px)',
            overflow: 'auto',
          }}
        >
          {renderContent()}
        </Box>

        {/* Global Toast Notifications */}
        <Snackbar
          open={notification.open}
          autoHideDuration={6000}
          onClose={() => setNotification({ ...notification, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            onClose={() => setNotification({ ...notification, open: false })}
            severity={notification.severity}
            sx={{ width: '100%' }}
          >
            {notification.message}
          </Alert>
        </Snackbar>

        {/* OTP Collection Dialog */}
        <Dialog open={otpModal.open} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {otpModal.broker.toUpperCase()} 2FA Verification Required
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The Playwright login session for {otpModal.broker.toUpperCase()} needs a secondary authentication OTP.
              Please check your phone, email, or authenticator app.
            </Typography>
            <TextField
              autoFocus
              margin="dense"
              id="otp"
              label="Enter 6-Digit OTP / PIN"
              type="text"
              fullWidth
              variant="outlined"
              value={otpModal.otpText}
              onChange={(e) => setOtpModal({ ...otpModal, otpText: e.target.value })}
              slotProps={{ htmlInput: { style: { letterSpacing: '4px', textAlign: 'center', fontSize: '20px', fontWeight: 600 } } }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button color="error" onClick={() => setOtpModal({ open: false, broker: '', otpText: '' })}>
              Cancel Scrape
            </Button>
            <Button variant="contained" onClick={handleSubmitOtp} disabled={!otpModal.otpText}>
              Submit Verification
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </ThemeProvider>
  );
}

export default App;
