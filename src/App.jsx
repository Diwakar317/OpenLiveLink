import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import FleetDashboard from './components/FleetDashboard';
import WifiDashboard from './components/WifiDashboard';
import './index.css';

function MainLayout() {
  const location = useLocation();
  const isFleet = location.pathname === '/';
  
  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 selection:bg-yellow-500 selection:text-slate-900">
      
      {/* Premium Shared Header */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center z-10 sticky top-0 shadow-sm shrink-0">
        <div className="flex items-center gap-4 md:gap-6">
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
            OpenLiveLink<span className="text-yellow-500">.</span>
          </h1>
          <nav className="flex gap-2 md:gap-4 text-xs md:text-sm font-medium text-slate-500">
            <Link 
              to="/" 
              className={`px-3 md:px-4 py-1.5 rounded-full transition-all ${isFleet ? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/20' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              FLEET
            </Link>
            <Link 
              to="/wifi" 
              className={`px-3 md:px-4 py-1.5 rounded-full transition-all ${!isFleet ? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/20' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              WI-FI
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
          <span className="text-xs md:text-sm font-semibold text-slate-600 hidden sm:block">
            {isFleet ? 'Dashboard' : 'Network Active'}
          </span>
        </div>
      </header>

      {/* Main Content Router */}
      <div className="flex-1 overflow-hidden relative flex">
        <Routes>
          <Route path="/" element={<FleetDashboard />} />
          <Route path="/wifi" element={<WifiDashboard />} />
        </Routes>
      </div>

    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <MainLayout />
    </BrowserRouter>
  );
}

export default App;
