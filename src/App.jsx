import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import FleetDashboard from './components/FleetDashboard';
import WifiDashboard from './components/WifiDashboard';
import PayLedgerDashboard from './components/PayLedgerDashboard';
import Login from './components/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import './index.css';

function ProtectedRoute({ children }) {
  const { session } = useAuth();
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function MainLayout() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { signOut } = useAuth();
  
  const navItems = [
    { path: '/', label: 'FLEET' },
    { path: '/wifi', label: 'WI-FI' },
    { path: '/ledger', label: 'LEDGER' },
  ];

  const statusLabel = {
    '/': 'Dashboard',
    '/wifi': 'Network Active',
    '/ledger': 'Payment Ledger',
  };
  
  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 selection:bg-yellow-500 selection:text-slate-900">
      
      {/* Premium Shared Header */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row justify-between md:items-center gap-3 md:gap-0 z-10 sticky top-0 shadow-sm shrink-0">
        <div className="flex justify-between items-center w-full md:w-auto">
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
            OpenLiveLink<span className="text-yellow-500">.</span>
          </h1>
          <div className="flex items-center gap-3 md:hidden">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
            <button 
              onClick={signOut}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            >
              Sign Out
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center w-full md:w-auto">
          <nav className="flex gap-2 md:gap-4 text-xs md:text-sm font-medium text-slate-500 overflow-x-auto pb-1 -mb-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 md:px-4 py-1.5 rounded-full transition-all whitespace-nowrap ${
                  currentPath === item.path
                    ? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/20'
                    : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-4 ml-6 border-l border-slate-200 pl-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
              <span className="text-sm font-semibold text-slate-600">
                {statusLabel[currentPath] || 'Dashboard'}
              </span>
            </div>
            <button 
              onClick={signOut}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Router */}
      <div className="flex-1 overflow-hidden relative flex">
        <Routes>
          <Route path="/" element={<FleetDashboard />} />
          <Route path="/wifi" element={<WifiDashboard />} />
          <Route path="/ledger" element={<PayLedgerDashboard />} />
        </Routes>
      </div>

    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
