import React, { useState, useEffect } from 'react';
import { collection, db, onSnapshot, query, orderBy, where, doc, updateDoc, Timestamp, handleFirestoreError, OperationType } from '../firebase';
import { TrendingUp, TrendingDown, Clock, Lock, Eye, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export const Signals = ({ profile, setProfile }: { profile: any, setProfile: any }) => {
  const [signals, setSignals] = useState<any[]>([]);
  const [viewedSignals, setViewedSignals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'signals'),
      where('type', '==', 'OFFICIAL'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const signalsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSignals(signalsData);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.GET, 'signals');
    });

    // Load viewed signals from localStorage for this session/day
    const saved = localStorage.getItem(`viewed_signals_${profile?.uid || 'guest'}_${new Date().toISOString().split('T')[0]}`);
    if (saved) {
      setViewedSignals(JSON.parse(saved));
    }

    return () => unsubscribe();
  }, [profile?.uid]);

  const handleViewSignal = async (signalId: string) => {
    if (viewedSignals.includes(signalId)) return;

    const today = new Date().toISOString().split('T')[0];
    const isNewDay = profile.lastAccessDate !== today;
    const currentCount = isNewDay ? 0 : (profile.dailyAccessCount || 0);

    if (profile.membership === 'free' && currentCount >= 9) {
      toast.error('Batas harian tercapai (9/9). Tingkatkan ke Premium untuk akses tanpa batas!', {
        icon: '🔒',
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
      });
      return;
    }

    try {
      const newCount = currentCount + 1;
      const updatedProfile = {
        ...profile,
        dailyAccessCount: newCount,
        lastAccessDate: today
      };

      if (profile.uid) {
        await updateDoc(doc(db, 'users', profile.uid), {
          dailyAccessCount: newCount,
          lastAccessDate: today
        });
      }

      const newViewed = [...viewedSignals, signalId];
      setViewedSignals(newViewed);
      localStorage.setItem(`viewed_signals_${profile.uid || 'guest'}_${today}`, JSON.stringify(newViewed));
      setProfile(updatedProfile);
      
      toast.success('Sinyal Terbuka!', {
        icon: '🔓',
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
      });
    } catch (error) {
      console.error('Error updating access count:', error);
      toast.error('Gagal membuka sinyal.');
    }
  };

  const formatDate = (date: any) => {
    if (!date) return 'Baru saja';
    try {
      let dateObj;
      if (typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else {
        dateObj = new Date(date);
      }
      
      if (isNaN(dateObj.getTime())) return 'Baru saja';
      return format(dateObj, 'MMM dd, HH:mm');
    } catch (e) {
      return 'Baru saja';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sinyal Trading</h1>
          <p className="text-sm text-white/40 mt-1">Sinyal XAU & BTC real-time dengan akurasi tinggi</p>
        </div>
        <div className="flex items-center gap-4 bg-[#0A0A0A] border border-white/5 p-4 rounded-2xl">
          <div className="text-right">
            <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Akses Harian</div>
            <div className="text-sm font-bold">
              {profile?.membership === 'premium' ? (
                <span className="text-orange-500">Premium Tanpa Batas</span>
              ) : (
                <span className={profile?.dailyAccessCount >= 9 ? 'text-red-500' : 'text-white'}>
                  {profile?.dailyAccessCount}/9 <span className="text-white/20">Digunakan</span>
                </span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {signals.map((signal, i) => {
          const isViewed = profile?.membership === 'premium' || viewedSignals.includes(signal.id) || signal.status === 'closed';
          
          return (
            <motion.div
              key={signal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[#0A0A0A] border border-white/5 rounded-2xl overflow-hidden group hover:border-orange-500/30 transition-all"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${signal.pair === 'XAU/USD' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-orange-500/10 text-orange-500'}`}>
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <div className="font-bold text-sm tracking-tight">{signal.pair}</div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                      {formatDate(signal.createdAt)}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                  signal.status === 'active' ? 'bg-green-500/10 text-green-500 animate-pulse' : 'bg-white/10 text-white/40'
                }`}>
                  {signal.status === 'active' ? 'Aktif' : 'Selesai'}
                </div>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4 relative">
                {!isViewed && (
                  <div className="absolute inset-0 z-10 backdrop-blur-md bg-black/40 flex flex-col items-center justify-center p-6 text-center">
                    <Lock className="text-orange-500 mb-3" size={32} />
                    <h3 className="font-bold text-sm mb-1">Sinyal Terkunci</h3>
                    <p className="text-[10px] text-white/60 mb-4">Klik di bawah untuk membuka sinyal ini menggunakan kuota harian Anda.</p>
                    <button
                      onClick={() => handleViewSignal(signal.id)}
                      className="bg-orange-500 text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
                    >
                      Buka Sinyal
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className={`text-lg font-black italic tracking-tighter ${
                    signal.action === 'BUY' ? 'text-green-500' : 'text-red-500'
                  }`}>
                    ORDER {signal.action === 'BUY' ? 'BELI' : 'JUAL'}
                  </div>
                  <div className="text-xs font-bold text-white/60">
                    Entry: <span className="text-white">{signal.entryPrice}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Ambil Untung</div>
                    <div className="text-sm font-bold text-green-500">{signal.tp}</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Stop Rugi</div>
                    <div className="text-sm font-bold text-red-500">{signal.sl}</div>
                  </div>
                </div>

                {signal.analysis && (
                  <div className="pt-2">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Analisis Pasar</div>
                    <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2 italic">
                      "{signal.analysis}"
                    </p>
                  </div>
                )}

                {signal.status === 'closed' && (
                  <div className={`mt-4 p-3 rounded-xl flex items-center justify-between ${
                    signal.result > 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
                  }`}>
                    <div className="flex items-center gap-2">
                      {signal.result > 0 ? <CheckCircle2 size={14} className="text-green-500" /> : <AlertCircle size={14} className="text-red-500" />}
                      <span className="text-[10px] font-bold uppercase tracking-widest">Hasil</span>
                    </div>
                    <div className={`font-bold text-sm ${signal.result > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {signal.result > 0 ? '+' : ''}{signal.result} Pips
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
