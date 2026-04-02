import React, { useState } from 'react';
import { doc, db, updateDoc } from '../firebase';
import { User, Mail, ShieldCheck, Bell, CreditCard, CheckCircle2, AlertCircle, ChevronRight, LogOut, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { auth, signOut } from '../firebase';
import { useNavigate } from 'react-router-dom';

export const Profile = ({ profile, setProfile }: { profile: any, setProfile: any }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleUpdateNotifications = async (type: 'email' | 'push') => {
    try {
      const newSettings = {
        ...profile.notificationSettings,
        [type]: !profile.notificationSettings[type]
      };
      await updateDoc(doc(db, 'users', profile.uid), {
        notificationSettings: newSettings
      });
      setProfile({ ...profile, notificationSettings: newSettings });
      toast.success('Pengaturan diperbarui!', {
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
      });
    } catch (error) {
      toast.error('Gagal memperbarui pengaturan.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/auth');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-6 p-8 bg-[#0A0A0A] border border-white/5 rounded-3xl">
        <div className="w-24 h-24 rounded-3xl border-2 border-orange-500/20 bg-white/5 flex items-center justify-center text-white/40">
          <User size={48} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{profile?.displayName}</h1>
          <p className="text-sm text-white/40 mt-1 flex items-center gap-2">
            <Mail size={14} /> {profile?.email}
          </p>
          <div className="flex items-center gap-2 mt-4">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
              profile?.membership === 'premium' ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30' : 'bg-white/10 text-white/60'
            }`}>
              Member {profile?.membership === 'premium' ? 'Premium' : 'Gratis'}
            </span>
            {profile?.role === 'admin' && (
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-blue-500/20 text-blue-500 border border-blue-500/30">
                Admin
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Membership Card */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-3xl p-8 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500">
              <CreditCard size={20} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Paket Membership</h2>
          </div>

          <div className="flex-1 space-y-6">
            {profile?.membership === 'premium' ? (
              <div className="p-6 bg-orange-500/10 rounded-2xl border border-orange-500/20 text-center relative overflow-hidden">
                <div className="absolute -right-4 -top-4 text-orange-500/10">
                  <ShieldCheck size={120} />
                </div>
                <ShieldCheck size={48} className="text-orange-500 mx-auto mb-4 relative z-10" />
                <h3 className="text-xl font-bold mb-2 text-orange-500 relative z-10">Premium Aktif</h3>
                <p className="text-xs text-white/60 leading-relaxed relative z-10">
                  Anda memiliki akses ke semua sinyal dan analitik real-time.
                </p>
                
                <div className="mt-6 pt-6 border-t border-orange-500/20 relative z-10">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Paket Saat Ini</span>
                    <span className="text-xs font-bold text-orange-500">{profile?.selectedPackage || 'PREMIUM'}</span>
                  </div>
                  {profile?.expiresAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Berakhir Pada</span>
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                        <Clock size={12} className="text-orange-500" />
                        {profile.expiresAt.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center relative overflow-hidden">
                <div className="absolute -right-4 -top-4 text-white/5">
                  <AlertCircle size={120} />
                </div>
                <AlertCircle size={48} className="text-white/40 mx-auto mb-4 relative z-10" />
                <h3 className="text-xl font-bold mb-2 text-white/60 relative z-10">Member Gratis</h3>
                <p className="text-xs text-white/40 leading-relaxed relative z-10">
                  Anda saat ini menggunakan akses gratis. Upgrade ke Premium untuk mendapatkan sinyal eksklusif.
                </p>
              </div>
            )}
            
            <button
              onClick={() => window.open(`https://wa.me/6282326933843?text=Halo Admin, saya ingin memperpanjang langganan untuk username: ${profile?.displayName}`, '_blank')}
              className="w-full bg-white/5 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-white/10 transition-all border border-white/10 flex items-center justify-center gap-2"
            >
              <CreditCard size={16} /> Perpanjang Paket
            </button>
          </div>
        </div>

        {/* Settings Card */}
        <div className="space-y-8">
          <div className="bg-[#0A0A0A] border border-white/5 rounded-3xl p-8 space-y-8">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                  <Bell size={20} />
                </div>
                <h2 className="text-xl font-bold tracking-tight">Notifikasi</h2>
              </div>

              <div className="space-y-4">
                {[
                  { id: 'email', label: 'Peringatan Email', desc: 'Terima sinyal baru via email', icon: Mail },
                  { id: 'push', label: 'Notifikasi Push', desc: 'Peringatan browser real-time', icon: Bell },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/5 text-white/40">
                        <item.icon size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-bold">{item.label}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{item.desc}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateNotifications(item.id as 'email' | 'push')}
                      className={`w-12 h-6 rounded-full transition-all relative ${
                        profile?.notificationSettings?.[item.id] ? 'bg-orange-500' : 'bg-white/10'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                        profile?.notificationSettings?.[item.id] ? 'left-7' : 'left-1'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-8 border-t border-white/5">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 p-4 text-red-400 hover:bg-red-400/5 rounded-2xl transition-all border border-red-400/20"
              >
                <LogOut size={20} />
                <span className="font-bold uppercase tracking-widest text-xs">Keluar Sesi</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
