import React, { useState, useEffect } from 'react';
import { collection, db, auth, onSnapshot, query, orderBy, where, limit, handleFirestoreError, OperationType } from '../firebase';
import { BarChart3, TrendingUp, TrendingDown, Target, ShieldCheck, ChevronRight, Calendar, History, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';

export const Performance = () => {
  const [closedSignals, setClosedSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    winRate: 0,
    totalProfit: 0,
    totalTrades: 0,
    bestTrade: 0,
    worstTrade: 0
  });

  useEffect(() => {
    // Fetch signals for stats (if logged in, user stats. if guest, global stats)
    const q = query(
      collection(db, 'signals')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let allSignals = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      
      if (auth.currentUser) {
        allSignals = allSignals.filter((s: any) => s.uid === auth.currentUser?.uid).slice(0, 200);
      } else {
        allSignals = allSignals.filter((s: any) => s.type === 'OFFICIAL' || !s.type).slice(0, 200);
      }

      const signals = allSignals.filter((s: any) => s.status === 'closed').slice(0, 100);
      
      setClosedSignals(signals);

      const totalTrades = signals.length;
      const wins = signals.filter((s: any) => s.result > 0).length;
      const totalProfit = signals.reduce((acc: number, s: any) => acc + (s.result || 0), 0);
      const results = signals.map((s: any) => s.result || 0);
      
      setStats({
        winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0,
        totalProfit,
        totalTrades,
        bestTrade: results.length > 0 ? Math.max(...results) : 0,
        worstTrade: results.length > 0 ? Math.min(...results) : 0
      });
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.GET, 'signals');
    });

    return () => unsubscribe();
  }, []);

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      let dateObj;
      if (typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else {
        dateObj = new Date(date);
      }
      
      if (isNaN(dateObj.getTime())) return 'N/A';
      return format(dateObj, 'MMM dd');
    } catch (e) {
      return 'N/A';
    }
  };

  const chartData = closedSignals.slice().reverse().map((s, i, arr) => ({
    name: formatDate(s.createdAt),
    profit: s.result,
    cumulative: arr.slice(0, i + 1).reduce((acc, curr) => acc + (curr.result || 0), 0)
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Statistik Performa</h1>
          <p className="text-sm text-white/40 mt-1">Data historis dan analisis tingkat kemenangan</p>
        </div>
        <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl">
          <button className="px-4 py-2 rounded-lg bg-orange-500 text-[10px] font-bold uppercase tracking-widest">Semua Waktu</button>
          <button className="px-4 py-2 rounded-lg bg-transparent text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-all">Bulanan</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Tingkat Kemenangan', value: `${stats.winRate}%`, icon: Target, color: 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' },
          { label: 'Total Profit', value: `${stats.totalProfit} pips`, icon: BarChart3, color: 'text-orange-500' },
          { label: 'Trade Terbaik', value: `+${stats.bestTrade} pips`, icon: TrendingUp, color: 'text-blue-500' },
          { label: 'Trade Terburuk', value: `${stats.worstTrade} pips`, icon: TrendingDown, color: 'text-fuchsia-500 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)]' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-[#0A0A0A] border border-white/5 p-6 rounded-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                <stat.icon size={20} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
            <div className="text-xs text-white/40 mt-1">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cumulative Profit Chart */}
        <div className="lg:col-span-2 bg-[#0A0A0A] border border-white/5 rounded-2xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Kurva Pertumbuhan Profit Kumulatif</h2>
              <p className="text-xs text-white/40 mt-1">Akumulasi profit dari waktu ke waktu</p>
            </div>
          </div>
          
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#ffffff20" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="#ffffff20" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ color: '#f97316' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="cumulative" 
                  stroke="#f97316" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCumulative)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trade History Sidebar */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-2xl p-8 flex flex-col">
          <div className="flex items-center gap-2 mb-8">
            <History className="text-orange-500" size={20} />
            <h2 className="text-lg font-bold tracking-tight">Riwayat Trade</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 max-h-[400px] pr-2 custom-scrollbar">
            {closedSignals.length > 0 ? (
              closedSignals.map((signal, i) => (
                <div key={signal.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] ${
                      signal.result > 0 ? 'bg-cyan-400/10 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-fuchsia-500/10 text-fuchsia-500 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)]'
                    }`}>
                      {signal.action[0]}
                    </div>
                    <div>
                      <div className="font-bold text-xs tracking-tight">{signal.pair}</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                        {formatDate(signal.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className={`font-bold text-xs ${signal.result > 0 ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'text-fuchsia-500 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)]'}`}>
                    {signal.result > 0 ? '+' : ''}{signal.result}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-xs text-white/40">Belum ada riwayat trade.</p>
              </div>
            )}
          </div>
          
          <div className="mt-8 pt-8 border-t border-white/5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-white/40">Total Trade</span>
              <span className="text-xs font-bold">{stats.totalTrades}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Tingkat Keberhasilan</span>
              <span className="text-xs font-bold text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">{stats.winRate}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
