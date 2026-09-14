import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { formatInTimeZone } from 'date-fns-tz';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

function WifiDashboard() {
  const [billingCycles, setBillingCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Aggregated state
  const [totals, setTotals] = useState({ download: 0, upload: 0, usage: 0 });
  const [chartData, setChartData] = useState([]);

    // Mathematically generate billing cycles to avoid Supabase row limits
  useEffect(() => {
    const generateBillingCycles = (numCycles = 6) => {
      const cycles = [];
      const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const istDate = new Date(istString);
      
      let year = istDate.getFullYear();
      let month = istDate.getMonth();
      const day = istDate.getDate();

      if (day < 24) {
        month -= 1;
        if (month < 0) {
          month = 11;
          year -= 1;
        }
      }

      for (let i = 0; i < numCycles; i++) {
        let startY = year;
        let startM = month - i;
        while (startM < 0) {
          startM += 12;
          startY -= 1;
        }
        
        let endY = startY;
        let endM = startM + 1;
        if (endM > 11) {
          endM = 0;
          endY += 1;
        }

        const pad = (n) => String(n).padStart(2, "0");
        const startStr = `${startY}-${pad(startM + 1)}-24`;
        const endStr = `${endY}-${pad(endM + 1)}-23`;
        cycles.push(`${startStr}_to_${endStr}`);
      }
      return cycles;
    };

    const cycles = generateBillingCycles(12); // Generate current + past 11 cycles (1 year of history)
    setBillingCycles(cycles);
    setSelectedCycle(cycles[0]);
  }, []);

  // Fetch data for the selected cycle
  useEffect(() => {
    if (!selectedCycle) return;

    async function fetchData() {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_wifi_usage_analytics', { cycle: selectedCycle });

      if (error || !data) {
        console.error("Error fetching data for cycle:", error);
        setLoading(false);
        return;
      }

      setTotals({
        download: data.totalDownload || 0,
        upload: data.totalUpload || 0,
        usage: data.totalUsage || 0
      });

      // Format for Recharts (convert to GB)
      const formattedChartData = (data.dailyUsage || []).map(d => ({
        date: d.date,
        Download: parseFloat((d.download / (1024 ** 3)).toFixed(2)),
        Upload: parseFloat((d.upload / (1024 ** 3)).toFixed(2)),
        Usage: parseFloat((d.usage / (1024 ** 3)).toFixed(2)),
      }));

      setChartData(formattedChartData);
      setLoading(false);
    }

    fetchData();
  }, [selectedCycle]);

  const formatGB = (bytes) => (bytes / (1024 ** 3)).toFixed(2);
  const formatTB = (bytes) => (bytes / (1024 ** 4)).toFixed(2);
  
  const formatSmart = (bytes) => {
    if (bytes > 1024 ** 4) return formatTB(bytes) + " TB";
    return formatGB(bytes) + " GB";
  };

  return (
    <main className="flex-1 overflow-auto bg-slate-50 p-4 md:p-6 w-full h-full">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Wi-Fi Usage Dashboard</h2>
            <p className="text-sm text-slate-500">Monitor Airtel network traffic & aggregations</p>
          </div>
          
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Billing Cycle</label>
            <select 
              value={selectedCycle} 
              onChange={(e) => setSelectedCycle(e.target.value)}
              className="bg-slate-50 border border-slate-300 p-2 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-medium min-w-[200px]"
            >
              {billingCycles.map(cycle => (
                <option key={cycle} value={cycle}>{cycle}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-500 font-medium animate-pulse">
            Calculating aggregations...
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute top-0 w-full h-1 bg-blue-500"></div>
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Total Download</span>
                <span className="text-4xl font-black text-slate-800">{formatSmart(totals.download)}</span>
              </div>
              
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute top-0 w-full h-1 bg-green-500"></div>
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Total Upload</span>
                <span className="text-4xl font-black text-slate-800">{formatSmart(totals.upload)}</span>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute top-0 w-full h-1 bg-yellow-500"></div>
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Total Usage</span>
                <span className="text-4xl font-black text-slate-800">{formatSmart(totals.usage)}</span>
              </div>
            </div>

            {/* Chart Area */}
            <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 text-center shrink-0">Daily Usage (GB)</h3>
              <div className="flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} interval={0} angle={-45} textAnchor="end" height={60} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }}/>
                  <Bar dataKey="Download" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="Upload" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
                      
          </>
        )}
      </div>
    </main>
  );
}

export default WifiDashboard;













