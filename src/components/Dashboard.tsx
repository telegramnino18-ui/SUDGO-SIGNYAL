import React, { useState, useEffect } from 'react';
import { collection, db, auth, onSnapshot, query, orderBy, limit, where, handleFirestoreError, OperationType } from '../firebase';
import { TrendingUp, TrendingDown, Clock, BarChart3, Target, ShieldCheck, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export const Dashboard = ({ profile }: { profile: any }) => {
  const [activeSignals, setActiveSignals] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [stats, setStats] = useState({
    winRate: 0,
    totalProfit: 0,
    totalTrades: 0,
    monthlyProfit: 0
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Fetch official active signals
    const qActive = query(
      collection(db, 'signals')
    );

    const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
      const active = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .filter((s: any) => (s.type === 'OFFICIAL' || !s.type) && s.status === 'active')
        .slice(0, 3);
      setActiveSignals(active);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'signals');
    });

    // Fetch signals for stats (if logged in, user stats. if guest, global stats)
    const qStats = query(
      collection(db, 'signals')
    );

    const unsubscribeStats = onSnapshot(qStats, (snapshot) => {
      let userSignals = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      
      if (auth.currentUser) {
        userSignals = userSignals.filter((s: any) => s.uid === auth.currentUser?.uid).slice(0, 50);
      } else {
        userSignals = userSignals.filter((s: any) => s.type === 'OFFICIAL' || !s.type).slice(0, 50);
      }

      const closedSignals = userSignals.filter((s: any) => s.status === 'closed');
      const totalTrades = closedSignals.length;
      const wins = closedSignals.filter((s: any) => s.result > 0).length;
      const totalProfit = closedSignals.reduce((acc: number, s: any) => acc + (s.result || 0), 0);
      
      setStats({
        winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0,
        totalProfit,
        totalTrades,
        monthlyProfit: totalProfit
      });
      setLastUpdated(new Date());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'signals');
    });

    return () => {
      unsubscribeActive();
      unsubscribeStats();
    };
  }, [lastUpdated.getTime()]);

  const chartData = [
    { name: 'Mon', profit: 400 },
    { name: 'Tue', profit: 300 },
    { name: 'Wed', profit: 600 },
    { name: 'Thu', profit: 800 },
    { name: 'Fri', profit: 700 },
    { name: 'Sat', profit: 900 },
    { name: 'Sun', profit: 1100 },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Stats */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Statistik Performa</h2>
        <div className="flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-widest font-bold">
          <Clock size={10} className="animate-pulse text-violet-500" />
          Auto-refresh: {format(lastUpdated, 'HH:mm:ss')}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Tingkat Kemenangan', value: `${stats.winRate}%`, icon: Target, color: 'text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]' },
          { label: 'Total Profit', value: `${stats.totalProfit} pips`, icon: BarChart3, color: 'text-violet-500' },
          { label: 'Total Trade', value: stats.totalTrades, icon: TrendingUp, color: 'text-blue-500' },
          { label: 'Batas Harian', value: profile?.membership === 'premium' ? 'Tanpa Batas' : `${profile?.dailyAccessCount}/9`, icon: ShieldCheck, color: 'text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]' },
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
              <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Langsung</span>
            </div>
            <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
            <div className="text-xs text-white/40 mt-1">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Performance Chart */}
        <div className="lg:col-span-2 bg-[#0A0A0A] border border-white/5 rounded-2xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Ikhtisar Performa</h2>
              <p className="text-xs text-white/40 mt-1">Pertumbuhan profit kumulatif dari waktu ke waktu</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded-full bg-violet-500 text-[10px] font-bold uppercase tracking-widest">Mingguan</button>
              <button className="px-3 py-1 rounded-full bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">Bulanan</button>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
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
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ color: '#f97316' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stroke="#f97316" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorProfit)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active Signals Sidebar */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">Sinyal Aktif</h2>
            <Link to="/signals" className="text-[10px] uppercase tracking-widest text-violet-500 font-bold flex items-center gap-1">
              Lihat Semua <ChevronRight size={12} />
            </Link>
          </div>

          <div className="space-y-4">
            {activeSignals.length > 0 ? (
              activeSignals.map((signal, i) => (
                <motion.div
                  key={signal.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-[#0A0A0A] border border-white/5 p-5 rounded-2xl group hover:border-violet-500/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                        signal.action === 'BUY' ? 'bg-indigo-400/10 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]' : 'bg-purple-500/10 text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]'
                      }`}>
                        {signal.action === 'BUY' ? 'BELI' : 'JUAL'}
                      </div>
                      <div>
                        <div className="font-bold text-sm tracking-tight">{signal.pair}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Entry: {signal.entryPrice}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Status</div>
                      <div className="text-[10px] text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] font-bold uppercase tracking-widest animate-pulse">Aktif</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-3 rounded-xl">
                      <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Target Keuntungan (TP)</div>
                      <div className="text-sm font-bold text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">{signal.tp}</div>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl">
                      <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Batasi Kerugian (SL)</div>
                      <div className="text-sm font-bold text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]">{signal.sl}</div>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="bg-[#0A0A0A] border border-white/5 p-8 rounded-2xl text-center">
                <Clock className="mx-auto text-white/20 mb-4" size={32} />
                <p className="text-sm text-white/40">Tidak ada sinyal aktif saat ini.</p>
              </div>
            )}
          </div>

          {/* Market Analysis Mini Card */}
          <div className="bg-gradient-to-br from-violet-500 to-violet-600 p-6 rounded-2xl relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="font-bold text-lg leading-tight mb-2">Analitik Pasar Real-time</h3>
              <p className="text-xs text-white/80 mb-4">Dapatkan wawasan mendalam tentang tren pasar XAU & BTC.</p>
              <Link to="/analysis" className="inline-block bg-white text-violet-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/90 transition-all">
                Jelajahi Analisis
              </Link>
            </div>
            <BarChart3 className="absolute -right-4 -bottom-4 text-white/10 w-32 h-32 rotate-12 group-hover:rotate-0 transition-transform duration-500" />
          </div>
        </div>
      </div>
    </div>
  );
};
