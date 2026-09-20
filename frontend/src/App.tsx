import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useDispatch } from 'react-redux';
import { useAppSelector } from './store';
import axios from 'axios';
import { logOut } from './store/authSlice';
import {
  setHoldings,
  setTransactions,
  setImportHistory,
  setSettlement,
  setAnalytics,
  setAuditLogs,
  setAutomationStatus,
  setTargets,
  setTargetCategories,
  addNotifiedTargetId
} from './store/portfolioSlice';

// Lazy-loaded Pages for code-splitting and instant initial page load
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Holdings = lazy(() => import('./pages/Holdings'));
const Transactions = lazy(() => import('./pages/Transactions'));
const LIFOSettlement = lazy(() => import('./pages/LIFOSettlement'));
const Analytics = lazy(() => import('./pages/Analytics'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Settings = lazy(() => import('./pages/Settings'));
const StockSummary = lazy(() => import('./pages/StockSummary'));
const OrderBook = lazy(() => import('./pages/OrderBook'));
const MutualFunds = lazy(() => import('./pages/MutualFunds'));
const TargetSetting = lazy(() => import('./pages/TargetSetting'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const HoldingAnalysis = lazy(() => import('./pages/HoldingAnalysis'));
const ExpensesInterest = lazy(() => import('./pages/ExpensesInterest'));

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
  Alert,
  Chip
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
import StarIcon from '@mui/icons-material/Star';
import PieChartIcon from '@mui/icons-material/PieChart';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';

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

// Helper: Check if current time is within Indian Stock Market Hours (Mon-Fri, 9:15 AM - 3:30 PM IST)
const isIndianMarketHours = (): boolean => {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  if (day === 0 || day === 6) return false;

  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const marketOpen = 9 * 60 + 15;   // 09:15 AM
  const marketClose = 15 * 60 + 30; // 03:30 PM (15:30)

  return totalMinutes >= marketOpen && totalMinutes <= marketClose;
};

// Helper: Format countdown display (e.g. "4m 30s")
const formatTimerDisplay = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
};

function App() {
  const dispatch = useDispatch();
  const { isAuthenticated, username } = useAppSelector((state) => state.auth);
  const allHoldings = useAppSelector((state) => state.portfolio.holdings);
  const targets = useAppSelector((state) => state.portfolio.targets);
  const notifiedTargetIds = useAppSelector((state) => state.portfolio.notifiedTargetIds);

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);

  // Market hours & 5-minute price refresh tracking (300 seconds)
  const [marketOpen, setMarketOpen] = useState<boolean>(isIndianMarketHours());
  const [priceTimer, setPriceTimer] = useState<number>(300);
  const [triggeredDialog, setTriggeredDialog] = useState<{ open: boolean; items: any[] }>({
    open: false,
    items: [],
  });
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

  const showToast = useCallback((message: string, severity: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ open: true, message, severity });
  }, []);

  // Fetch all core portfolio data in parallel via Promise.all
  const fetchAllData = async (refreshPrices = false) => {
    if (!isAuthenticated) return;
    try {
      setGlobalLoading(true);

      const [
        holdingsRes,
        txsRes,
        historyRes,
        settlementRes,
        analyticsRes,
        logsRes,
        targetsRes,
        catsRes,
      ] = await Promise.all([
        axios.get(`/api/holdings?refresh_prices=${refreshPrices}`),
        axios.get('/api/transactions'),
        axios.get('/api/transactions/history'),
        axios.get('/api/settlement'),
        axios.get('/api/analytics'),
        axios.get('/api/logs'),
        axios.get('/api/targets').catch(() => ({ data: [] })),
        axios.get('/api/target-categories').catch(() => ({ data: [] })),
      ]);

      dispatch(setHoldings(holdingsRes.data));
      dispatch(setTransactions(txsRes.data));
      dispatch(setImportHistory(historyRes.data));
      dispatch(setSettlement(settlementRes.data));
      dispatch(setAnalytics(analyticsRes.data));
      dispatch(setAuditLogs(logsRes.data));
      dispatch(setTargets(targetsRes.data));
      dispatch(setTargetCategories(catsRes.data));
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to sync data.', 'error');
    } finally {
      setGlobalLoading(false);
    }
  };

  // Lightweight background price refresh (does not lock UI or re-fetch transactions/settlement)
  const refreshLivePricesOnly = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [holdingsRes, targetsRes] = await Promise.all([
        axios.get('/api/holdings?refresh_prices=true'),
        axios.get('/api/targets').catch(() => null),
      ]);
      dispatch(setHoldings(holdingsRes.data));
      if (targetsRes) {
        dispatch(setTargets(targetsRes.data));
      }
    } catch (e) {
      console.error('Background price sync error:', e);
    }
  }, [isAuthenticated, dispatch]);

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
        return false;
      }

      if (status === 'SUCCESS') {
        showToast(`Holdings scraped successfully for ${broker.toUpperCase()}`, 'success');
        fetchAllData(true);
        return true;
      }

      if (status === 'FAILED') {
        showToast(`Holdings scraping failed for ${broker.toUpperCase()}: ${error}`, 'error');
        fetchAllData(false);
        return true;
      }

      return false;
    } catch (err) {
      return true;
    }
  };

  // Start scraper thread
  const triggerScrape = async (broker: string) => {
    try {
      showToast(`Initiating background browser login and scraper for ${broker.toUpperCase()}...`, 'info');
      await axios.post(`/api/automation/scrape/${broker}`);

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

      const broker = otpModal.broker;
      const interval = setInterval(async () => {
        const done = await checkScraperStatus(broker);
        if (done) clearInterval(interval);
      }, 2000);

    } catch (err: any) {
      showToast('Failed to submit OTP.', 'error');
    }
  };

  // Initial load
  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData(true);
    }
  }, [isAuthenticated]);

  // Watch for newly triggered targets
  useEffect(() => {
    if (!isAuthenticated || !targets || targets.length === 0) return;

    const newlyTriggered = targets.filter((t: any) => {
      return t.is_triggered_live && !t.triggered && !notifiedTargetIds.includes(t.id);
    });

    if (newlyTriggered.length > 0) {
      newlyTriggered.forEach((t: any) => {
        dispatch(addNotifiedTargetId(t.id));
      });

      setTriggeredDialog((prev) => ({
        open: true,
        items: [...prev.items, ...newlyTriggered].filter(
          (item, idx, self) => self.findIndex((x) => x.id === item.id) === idx
        ),
      }));
    }
  }, [targets, notifiedTargetIds, isAuthenticated, dispatch]);

  const handleAcknowledgeTriggeredTargets = async () => {
    const itemsToAcknowledge = triggeredDialog.items;
    setTriggeredDialog({ open: false, items: [] });
    try {
      await Promise.all(
        itemsToAcknowledge.map((t) =>
          axios.put(`/api/targets/${t.id}`, { triggered: 1 })
        )
      );
      const targetsRes = await axios.get('/api/targets');
      dispatch(setTargets(targetsRes.data));
    } catch (err) {
      console.error('Failed to acknowledge targets:', err);
      showToast('Failed to acknowledge some targets.', 'error');
    }
  };

  // 5-Minute Timer & Market Hours Tracker (9:15 AM - 3:30 PM IST, Mon-Fri)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      const isMarketOpenNow = isIndianMarketHours();
      setMarketOpen(isMarketOpenNow);

      if (isMarketOpenNow) {
        setPriceTimer((prev) => {
          if (prev <= 1) {
            refreshLivePricesOnly(); // Background price sync only
            return 300; // Reset to 5 minutes
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, refreshLivePricesOnly]);

  // Navigate to Stock Summary detailed view
  const handleViewStock = useCallback((scrip: string) => {
    setSelectedStock(scrip);
    setActiveTab('stock-summary');
  }, []);

  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={darkTheme}>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}><CircularProgress /></Box>}>
          <Login />
        </Suspense>
      </ThemeProvider>
    );
  }

  // Render appropriate page component based on activeTab (lazy-loaded with fallback)
  const renderContent = () => {
    return (
      <Suspense fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <CircularProgress size={40} />
        </Box>
      }>
        {(() => {
          switch (activeTab) {
            case 'dashboard':
              return <Dashboard onViewStock={handleViewStock} onScrape={triggerScrape} />;
            case 'holdings':
              return <Holdings onViewStock={handleViewStock} onScrape={triggerScrape} showToast={showToast} />;
            case 'watchlist':
              return <Watchlist onViewStock={handleViewStock} showToast={showToast} />;
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
            case 'expenses':
              return <ExpensesInterest />;
            case 'mutual-funds':
              return <MutualFunds onViewStock={handleViewStock} />;
            case 'holding-analysis':
              return <HoldingAnalysis />;
            case 'logs':
              return <AuditLogs />;
            case 'settings':
              return <Settings />;
            case 'stock-summary':
              return selectedStock ? (
                <StockSummary 
                  scrip={selectedStock} 
                  onBack={() => setActiveTab('holdings')} 
                  scripList={allHoldings.map((h: any) => h.script).sort((a: string, b: string) => a.localeCompare(b))}
                  onSelectScrip={handleViewStock}
                  onRefreshData={() => fetchAllData(false)}
                />
              ) : (
                <Dashboard onViewStock={handleViewStock} onScrape={triggerScrape} />
              );
            default:
              return <Dashboard onViewStock={handleViewStock} onScrape={triggerScrape} />;
          }
        })()}
      </Suspense>
    );
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
              {/* Active Market Hours / 5-min Price Refresh Tracker */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {marketOpen ? (
                  <>
                    <Chip
                      label="Market Open"
                      size="small"
                      sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600, fontSize: 11 }}
                    />
                    <Badge badgeContent={Math.ceil(priceTimer / 60) + 'm'} color="primary">
                      <IconButton disabled size="small" sx={{ color: 'text.secondary' }}>
                        <RefreshIcon fontSize="small" className="pulse-animation" />
                      </IconButton>
                    </Badge>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                      Next Price Sync in {formatTimerDisplay(priceTimer)}
                    </Typography>
                  </>
                ) : (
                  <Chip
                    label="Market Closed (9:15–15:30 IST)"
                    size="small"
                    sx={{ bgcolor: 'rgba(148, 163, 184, 0.12)', color: 'text.secondary', fontWeight: 500, fontSize: 11 }}
                  />
                )}
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

              {/* Sync Holdings Manual Button */}
              <IconButton
                onClick={() => fetchAllData(true)}
                disabled={globalLoading}
                title="Manual Full Sync"
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
              { id: 'holding-analysis', text: 'Holding Analysis', icon: <PieChartIcon /> },
              { id: 'targets', text: 'Target Setting', icon: <TrackChangesIcon /> },
              { id: 'watchlist', text: 'Watchlist', icon: <StarIcon /> },
              { id: 'order-book', text: 'Order Book', icon: <AssignmentIcon /> },
              { id: 'transactions', text: 'Consolidated Portfolio', icon: <ListAltIcon /> },
              { id: 'lifo', text: 'LIFO Settlement', icon: <SwapHorizIcon /> },
              { id: 'analytics', text: 'Analytics', icon: <BarChartIcon /> },
              { id: 'expenses', text: 'Expenses & Interest', icon: <AccountBalanceIcon /> },
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

        {/* Persistent Target Triggered Notification Dialog */}
        <Dialog
          open={triggeredDialog.open}
          maxWidth="sm"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                background: '#161824',
                border: '2px solid #ef4444',
                borderRadius: 3,
              }
            }
          }}
        >
          <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1.5, color: '#ef4444' }}>
            <NotificationsActiveIcon className="pulse-animation" />
            Price Target Triggered!
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              The following stock target price conditions have been met:
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {triggeredDialog.items.map((t: any) => {
                let daysText = 'Today';
                if (t.date) {
                  const targetDate = new Date(t.date);
                  const today = new Date();
                  const d1 = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
                  const d2 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
                  const diffDays = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
                  daysText = diffDays === 0 ? 'Today' : `${diffDays} days ago`;
                }

                return (
                  <Box
                    key={t.id}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#f8fafc' }}>
                        {t.script && t.script.endsWith('-EQ') ? t.script.slice(0, -3) : (t.script || '')}
                      </Typography>
                      <Chip
                        label={t.type}
                        size="small"
                        sx={{
                          bgcolor: t.type === 'Buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: t.type === 'Buy' ? '#10b981' : '#ef4444',
                          fontWeight: 700,
                          fontSize: 11
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'text.secondary' }}>
                      <span>Target Price: <strong>₹{t.target_price}</strong></span>
                      <span>LTP: <strong>₹{Math.round(t.ltp || 0)}</strong></span>
                    </Box>
                    <Box sx={{ fontSize: 12, color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                      <span>Added: {daysText}</span>
                      {t.comment && <span>Comment: {t.comment}</span>}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 1 }}>
            <Button
              variant="contained"
              color="error"
              onClick={handleAcknowledgeTriggeredTargets}
              fullWidth
              sx={{ fontWeight: 600, py: 1, borderRadius: 2 }}
            >
              OK
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </ThemeProvider>
  );
}

export default App;
