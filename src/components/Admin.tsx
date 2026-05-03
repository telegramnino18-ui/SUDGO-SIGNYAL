import React, { useState, useEffect } from 'react';
import { collection, db, addDoc, updateDoc, doc, deleteDoc, onSnapshot, query, orderBy, where, Timestamp, handleFirestoreError, OperationType, setDoc } from '../firebase';
import { TrendingUp, TrendingDown, Plus, X, CheckCircle2, AlertCircle, Clock, BarChart3, Target, ShieldCheck, Users, UserCheck, BellRing, Save, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { sendDiscordNotification, formatSignalMessage } from '../services/discordService';

export const Admin = () => {
  const [activeTab, setActiveTab] = useState<'signals' | 'users' | 'settings'>('signals');
  const [activeSignals, setActiveSignals] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ discordWebhook: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [newSignal, setNewSignal] = useState({
    pair: 'XAU/USD',
    action: 'BUY',
    entryPrice: '',
    tp: '',
    sl: '',
    analysis: ''
  });

  useEffect(() => {
    const qSignals = query(collection(db, 'signals'));
    const unsubscribeSignals = onSnapshot(qSignals, (snapshot) => {
      const signals = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .filter((signal: any) => signal.status === 'active'); // Filter in memory
      setActiveSignals(signals);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'signals');
    });

    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const usersList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setUsers(usersList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data());
      }
    });

    return () => {
      unsubscribeSignals();
      unsubscribeUsers();
      unsubscribeSettings();
    };
  }, []);

  const handleAddSignal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const signalData = {
        ...newSignal,
        entryPrice: parseFloat(newSignal.entryPrice),
        tp: parseFloat(newSignal.tp),
        sl: parseFloat(newSignal.sl),
        status: 'active',
        createdAt: Timestamp.now(),
        result: 0
      };
      
      await addDoc(collection(db, 'signals'), signalData);

      // Send Discord Notification
      if (settings.discordWebhook) {
        const discordMsg = formatSignalMessage(signalData);
        await sendDiscordNotification(settings.discordWebhook, discordMsg);
      }

      setShowAddModal(false);
      setNewSignal({ pair: 'XAU/USD', action: 'BUY', entryPrice: '', tp: '', sl: '', analysis: '' });
      toast.success('Sinyal berhasil diposting!', {
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
      });
    } catch (error) {
      toast.error('Gagal memposting sinyal.');
    }
  };

  const handleCloseSignal = async (signalId: string, result: number) => {
    try {
      await updateDoc(doc(db, 'signals', signalId), {
        status: 'closed',
        closedAt: Timestamp.now(),
        result: result
      });
      toast.success('Sinyal ditutup!', {
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
      });
    } catch (error) {
      toast.error('Gagal menutup sinyal.');
    }
  };

  const handleActivateUser = async (userId: string, currentPkg: string) => {
    const pkgName = prompt(`Masukkan nama paket untuk aktivasi (BASIC, VIP, MONTHLY)\nKosongkan untuk menggunakan paket saat ini: ${currentPkg}`, currentPkg) || currentPkg;
    
    if (!['BASIC', 'VIP', 'MONTHLY'].includes(pkgName.toUpperCase())) {
      toast.error('Paket tidak valid. Gunakan BASIC, VIP, atau MONTHLY.');
      return;
    }

    try {
      let days = 7;
      if (pkgName.toUpperCase() === 'VIP') days = 14;
      if (pkgName.toUpperCase() === 'MONTHLY') days = 30;
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      await updateDoc(doc(db, 'users', userId), {
        membership: 'premium',
        selectedPackage: pkgName.toUpperCase(),
        expiresAt: Timestamp.fromDate(expiresAt)
      });
      toast.success('User berhasil diaktifkan!', {
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
      });
    } catch (error) {
      toast.error('Gagal mengaktifkan user.');
    }
  };

  const handleDeleteUser = (userId: string) => {
    setUserToDelete(userId);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', userToDelete));
      toast.success('User berhasil dihapus!', {
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#EF4444', border: '1px solid #EF4444' }
      });
      setUserToDelete(null);
    } catch (error) {
      toast.error('Gagal menghapus user.');
      handleFirestoreError(error, OperationType.DELETE, `users/${userToDelete}`);
      setUserToDelete(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kontrol Admin</h1>
          <p className="text-sm text-white/40 mt-1">Kelola sinyal dan pengguna</p>
        </div>
        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
          <button
            onClick={() => setActiveTab('signals')}
            className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === 'signals' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20' : 'text-white/40 hover:text-white'
            }`}
          >
            Sinyal Aktif
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === 'users' ? 'bg-indigo-500 text-black shadow-lg shadow-indigo-500/20' : 'text-white/40 hover:text-white'
            }`}
          >
            Pengguna
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === 'settings' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-white/40 hover:text-white'
            }`}
          >
            Pengaturan
          </button>
        </div>
      </div>

      {activeTab === 'signals' ? (
        <>
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-white text-black px-6 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-gray-200 transition-all shadow-lg shadow-white/20 flex items-center gap-2"
            >
              <Plus size={18} /> Sinyal Baru
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeSignals.map((signal) => (
              <div key={signal.id} className="bg-[#0A0A0A] border border-white/5 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${signal.pair === 'XAU/USD' ? 'bg-blue-500/10 text-blue-500' : 'bg-violet-500/10 text-violet-500'}`}>
                      <TrendingUp size={16} />
                    </div>
                    <div className="font-bold text-sm tracking-tight">{signal.pair}</div>
                  </div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest ${signal.action === 'BUY' ? 'text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]' : 'text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]'}`}>
                    {signal.action === 'BUY' ? 'BELI' : 'JUAL'}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/5 p-2 rounded-lg text-center">
                    <div className="text-[8px] text-white/40 uppercase font-bold">Entry</div>
                    <div className="text-xs font-bold">{signal.entryPrice}</div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg text-center">
                    <div className="text-[8px] text-white/40 uppercase font-bold">TP</div>
                    <div className="text-xs font-bold text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">{signal.tp}</div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg text-center">
                    <div className="text-[8px] text-white/40 uppercase font-bold">SL</div>
                    <div className="text-xs font-bold text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]">{signal.sl}</div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      const res = prompt('Masukkan profit/loss dalam pips (misal: 50 atau -30):');
                      if (res) handleCloseSignal(signal.id, parseFloat(res));
                    }}
                    className="bg-indigo-400/10 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-400/20 transition-all"
                  >
                    Tutup TP/SL
                  </button>
                  <button
                    onClick={() => handleCloseSignal(signal.id, 0)}
                    className="bg-white/5 text-white/40 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ))}
            {activeSignals.length === 0 && (
              <div className="col-span-full text-center py-12 text-white/40 text-sm">
                Tidak ada sinyal aktif saat ini.
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'users' ? (
        <div className="bg-[#0A0A0A] border border-white/5 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-white/40 text-[10px] uppercase tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-4">Username</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Paket Dipilih</th>
                  <th className="px-6 py-4">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium">{user.displayName || user.email?.split('@')[0]}</td>
                    <td className="px-6 py-4">
                      {user.membership === 'premium' ? (
                        <span className="bg-indigo-500/20 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-indigo-500/30">
                          Aktif
                        </span>
                      ) : user.membership === 'expired' ? (
                        <span className="bg-purple-500/20 text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
                          Expired
                        </span>
                      ) : (
                        <span className="bg-violet-500/20 text-violet-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-violet-500/30">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-white/60">{user.selectedPackage || '-'}</td>
                    <td className="px-6 py-4 flex items-center gap-2">
                      {user.membership !== 'premium' && (
                        <button
                          onClick={() => handleActivateUser(user.id, user.selectedPackage || 'BASIC')}
                          className="bg-white text-black px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center gap-2"
                        >
                          <UserCheck size={14} /> Aktifkan
                        </button>
                      )}
                      {user.membership === 'premium' && user.expiresAt && (
                        <span className="text-[10px] text-white/40 uppercase tracking-widest">
                          Exp: {user.expiresAt.toDate().toLocaleDateString()}
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="bg-red-500/10 text-red-500 p-2 rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                        title="Hapus Pengguna"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-white/40">Belum ada pengguna terdaftar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto bg-[#0A0A0A] border border-white/5 rounded-3xl p-8 space-y-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]">
              <BellRing size={20} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Integrasi Discord</h2>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Discord Webhook URL</label>
              <input
                type="text"
                value={settings.discordWebhook}
                onChange={(e) => setSettings({ ...settings, discordWebhook: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:border-indigo-500 outline-none"
                placeholder="https://discord.com/api/webhooks/..."
              />
              <p className="text-[10px] text-white/40 leading-relaxed">
                Sinyal baru akan dikirim secara otomatis ke channel Discord ini.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={async () => {
                  try {
                    await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });
                    toast.success('Pengaturan disimpan!', {
                      style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
                    });
                  } catch (e) {
                    handleFirestoreError(e, OperationType.WRITE, 'settings/global');
                    toast.error('Gagal menyimpan pengaturan.');
                  }
                }}
                className="w-full bg-white text-black py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-gray-200 transition-all shadow-lg shadow-white/20 flex items-center justify-center gap-2"
              >
                <Save size={16} /> Simpan Pengaturan
              </button>

              <button
                onClick={async () => {
                  if (!settings.discordWebhook) {
                    toast.error('Masukkan Webhook URL terlebih dahulu!');
                    return;
                  }
                  try {
                    await sendDiscordNotification(settings.discordWebhook, {
                      content: "🔔 **TES KONEKSI**: Webhook Discord berhasil terhubung dengan Ninz Signal!"
                    });
                    toast.success('Pesan tes terkirim ke Discord!');
                  } catch (e: any) {
                    console.error('Test Webhook Error:', e);
                    toast.error(`Gagal: ${e.message || 'Cek koneksi/URL'}`);
                  }
                }}
                className="w-full bg-white/5 border border-white/10 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <BellRing size={16} /> Tes Webhook
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#0A0A0A] border border-white/10 rounded-3xl p-8 w-full max-w-md relative"
            >
              <button onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 text-white/40 hover:text-white">
                <X size={24} />
              </button>
              
              <h2 className="text-2xl font-bold tracking-tight mb-6">Posting Sinyal Baru</h2>
              
              <form onSubmit={handleAddSignal} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Pair</label>
                    <select
                      value={newSignal.pair}
                      onChange={(e) => setNewSignal({ ...newSignal, pair: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                    >
                      <option value="XAU/USD">XAU/USD</option>
                      <option value="BTC/USD">BTC/USD</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Aksi</label>
                    <select
                      value={newSignal.action}
                      onChange={(e) => setNewSignal({ ...newSignal, action: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                    >
                      <option value="BUY">BELI</option>
                      <option value="SELL">JUAL</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Harga Entry</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newSignal.entryPrice}
                    onChange={(e) => setNewSignal({ ...newSignal, entryPrice: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                    placeholder="misal: 2150.50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">Take Profit</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newSignal.tp}
                      onChange={(e) => setNewSignal({ ...newSignal, tp: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                      placeholder="misal: 2165.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]">Stop Loss</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newSignal.sl}
                      onChange={(e) => setNewSignal({ ...newSignal, sl: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                      placeholder="misal: 2140.00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Analisis Pasar</label>
                  <textarea
                    value={newSignal.analysis}
                    onChange={(e) => setNewSignal({ ...newSignal, analysis: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-violet-500 outline-none h-24 resize-none"
                    placeholder="Masukkan wawasan pasar real-time..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-white text-black py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-gray-200 transition-all shadow-lg shadow-white/20 mt-4"
                >
                  Posting Sinyal
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#0A0A0A] border border-white/10 p-6 rounded-3xl w-full max-w-sm"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Hapus Pengguna</h3>
                <button onClick={() => setUserToDelete(null)} className="text-white/40 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              <p className="text-sm text-white/60 mb-6 font-medium">
                Apakah Anda yakin ingin menghapus pengguna ini? Semua data terkait (termasuk akses sinyal) akan hilang dan tidak dapat dikembalikan.
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  className="flex-1 bg-white/5 text-white/60 py-3 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-white/10 hover:text-white transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteUser}
                  className="flex-1 bg-red-500 text-white py-3 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
