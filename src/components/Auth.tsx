import React, { useState } from 'react';
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, db, doc, setDoc, getDoc, Timestamp } from '../firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { motion } from 'motion/react';
import { TrendingUp, ShieldCheck, BarChart3, Target, ChevronRight, Lock, Key, User, MessageCircle, CheckCircle2, ArrowLeft, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendDiscordNotification } from '../services/discordService';
import { Logo } from './Logo';

export const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'packages' | 'login' | 'register'>('packages');
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  
  // Username/Password Auth States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // WA/Phone Auth States
  const [loginMethod, setLoginMethod] = useState<'username' | 'wa'>('username');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const [isOver18, setIsOver18] = useState(false);

  const packages = [
    { 
      id: 'basic', 
      name: 'BASIC', 
      price: '80.000', 
      duration: '7 Hari', 
      desc: 'ESSENTIAL KIT', 
      originalPrice: '120.000',
      save: '40.000',
      features: ['Full akses Bebas Analisa Unlimited', 'Akses SMC & Candlestick Pattern', 'Validasi Entry EMA 50/200', 'Cocok untuk Pemula Belajar'] 
    },
    { 
      id: 'vip', 
      name: 'VIP', 
      price: '130.000', 
      duration: '14 Hari', 
      desc: 'ADVANCED TOOLS', 
      originalPrice: '220.000',
      save: '90.000',
      features: ['Full akses Bebas Analisa Unlimited', 'Prioritas Server (Analisa Lebih Cepat)', 'Akses Fitur Swing Trade & Day Trade', 'Support Setup Scalping High Winrate'] 
    },
    { 
      id: 'monthly', 
      name: 'MONTHLY', 
      price: '210.000', 
      duration: '30 Hari', 
      desc: 'PREMIUM ACCESS', 
      originalPrice: '400.000',
      save: '190.000',
      bestValue: true,
      features: ['Full akses Bebas Analisa Unlimited', 'Bisa Baca Manipulasi Bandar Besar', 'Kombinasi Data Multi-Timeframe', 'Harga Termurah'] 
    },
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!username || !password) {
      toast.error('Masukkan username dan password.');
      return;
    }
    setIsLoading(true);

    try {
      // Fetch global settings to get Discord Webhook early
      const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
      const discordWebhookUrl = settingsDoc.exists() ? settingsDoc.data().discordWebhook : null;

      if (discordWebhookUrl) {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `⚠️ **ALERT: LOGIN ATTEMPT DETECTED**\n\n> Someone is trying to login with username: \`${username}\``,
          embeds: [{
            title: "🔐 Login Activity Monitor",
            description: `A user has initiated a login sequence.\n\n**Details:**\n• **Username:** \`${username}\`\n• **Time:** ${new Date().toLocaleString()}`,
            color: 0xF59E0B, // Amber
            timestamp: new Date().toISOString()
          }]
        });
      }

      const loginEmail = username.includes('@') ? username : `${username}@ninzsignal.com`;
      await signInWithEmailAndPassword(auth, loginEmail, password);
      toast.success('Selamat datang kembali!', {
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
      });
      
      if (discordWebhookUrl) {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `✅ **LOGIN SUCCESS**\n\n> User \`${username}\` successfully logged in.`,
          embeds: [{
            title: "🟢 Successful Login",
            color: 0x22C55E, // Green
            timestamp: new Date().toISOString()
          }]
        });
      }
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error('Username atau password salah.');
      
      const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
      const discordWebhookUrl = settingsDoc.exists() ? settingsDoc.data().discordWebhook : null;
      if (discordWebhookUrl) {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `🚫 **LOGIN FAILED**\n\n> User \`${username}\` failed to login. Invalid password.`,
          embeds: [{
            title: "🔴 Failed Login Attempt",
            color: 0xEF4444, // Red
            timestamp: new Date().toISOString()
          }]
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) {
      toast.error('Masukkan nomor WhatsApp (dengan kode negara, misal: +62812...)');
      return;
    }
    
    // Format to E.164
    let formattedPhone = phoneNumber.replace(/[^0-9+]/g, '');
    if (formattedPhone.startsWith('08')) {
      formattedPhone = '+62' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('8')) {
      formattedPhone = '+62' + formattedPhone;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    setIsLoading(true);
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
      const discordWebhookUrl = settingsDoc.exists() ? settingsDoc.data().discordWebhook : null;

      if (discordWebhookUrl) {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `⚠️ **ALERT: OTP REQUESTED**\n\n> Someone is trying to login via Phone with: \`${formattedPhone}\``,
          embeds: [{
            title: "🔐 OTP Request Activity",
            description: `A user has initiated an OTP request.\n\n**Details:**\n• **Phone:** \`${formattedPhone}\`\n• **Time:** ${new Date().toLocaleString()}`,
            color: 0xF59E0B, // Amber
            timestamp: new Date().toISOString()
          }]
        });
      }

      if (!(window as any).recaptchaVerifier) {
        (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          'size': 'invisible',
        });
      }

      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, (window as any).recaptchaVerifier);
      setConfirmationResult(confirmation);
      setOtpSent(true);
      toast.success('Kode OTP telah dikirim melalui WA/SMS.', {
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #3b82f6' }
      });
      
    } catch (error: any) {
      console.error('Phone auth error:', error);
      if (error.code === 'auth/operation-not-allowed') {
        toast.error('Gagal: Login via WA/Phone belum diaktifkan di Firebase Console. Gunakan Username/Password sementara.', { duration: 6000 });
      } else if (error.code === 'auth/unauthorized-domain') {
        toast.error('Domain belum diotorisasi untuk Phone Auth. Tambahkan domain ini ke Firebase Console.', { duration: 6000 });
      } else {
        toast.error('Gagal mengirim OTP. Pastikan nomor valid (gunakan +62...).');
      }
      
      const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
      const discordWebhookUrl = settingsDoc.exists() ? settingsDoc.data().discordWebhook : null;
      if (discordWebhookUrl) {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `🚫 **OTP SEND FAILED**\n\n> Failed to send OTP to: \`${formattedPhone}\`\n> Error: ${error.message || 'Unknown Error'}`,
          embeds: [{
            title: "🔴 Failed OTP Request",
            color: 0xEF4444, // Red
            timestamp: new Date().toISOString()
          }]
        });
      }

      // Reset reCAPTCHA just in case
      if ((window as any).recaptchaVerifier) {
        (window as any).recaptchaVerifier.clear();
        (window as any).recaptchaVerifier = null;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !confirmationResult) return;
    setIsLoading(true);
    let formattedPhone = phoneNumber;
    try {
      const result = await confirmationResult.confirm(otp);
      formattedPhone = result.user.phoneNumber || phoneNumber;
      
      // Ensure user info exists in Firestore (basic creation if not exists)
      try {
        const userDoc = await getDoc(doc(db, 'users', result.user.uid));
        if (!userDoc.exists()) {
          await setDoc(doc(db, 'users', result.user.uid), {
            uid: result.user.uid,
            phoneNumber: result.user.phoneNumber,
            displayName: result.user.phoneNumber,
            role: 'user',
            membership: 'pending',
            dailyAccessCount: 0,
            lastAccessDate: new Date().toISOString().split('T')[0],
            createdAt: Timestamp.now()
          });
        }
      } catch (dbErr) {
        console.error('Failed to sync WA user to firestore:', dbErr);
      }

      toast.success('Login WA Berhasil!', {
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #3b82f6' }
      });
      
      const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
      const discordWebhookUrl = settingsDoc.exists() ? settingsDoc.data().discordWebhook : null;
      if (discordWebhookUrl) {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `✅ **OTP LOGIN SUCCESS**\n\n> User with phone \`${formattedPhone}\` successfully logged in.`,
          embeds: [{
            title: "🟢 Successful OTP Login",
            color: 0x22C55E, // Green
            timestamp: new Date().toISOString()
          }]
        });
      }
      
      // Auth change will trigger parent app redirect
    } catch (error) {
      console.error('OTP verify error:', error);
      toast.error('Kode OTP salah atau kadaluarsa.');
      
      const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
      const discordWebhookUrl = settingsDoc.exists() ? settingsDoc.data().discordWebhook : null;
      if (discordWebhookUrl) {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `🚫 **OTP VERIFY FAILED**\n\n> Failed to verify OTP for phone: \`${formattedPhone}\``,
          embeds: [{
            title: "🔴 Failed OTP Verification",
            color: 0xEF4444, // Red
            timestamp: new Date().toISOString()
          }]
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPackage = (pkg: any) => {
    setSelectedPackage(pkg);
    setUsername('');
    setPassword('');
    setView('register');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!username || !password) {
      toast.error('Masukkan username dan password yang diinginkan.');
      return;
    }
    if (!isOver18) {
      toast.error('Anda harus berusia di atas 18 tahun untuk mendaftar.');
      return;
    }
    if (password.length < 6) {
      toast.error('Password minimal 6 karakter.');
      return;
    }
    setIsLoading(true);
    try {
      const loginEmail = username.includes('@') ? username : `${username}@ninzsignal.com`;
      const userCredential = await createUserWithEmailAndPassword(auth, loginEmail, password);
      
      // Create user document in Firestore with retry mechanism
      let retries = 3;
      while (retries > 0) {
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            email: loginEmail,
            displayName: username,
            role: username === 'traderpro11' ? 'admin' : 'user',
            membership: username === 'traderpro11' ? 'premium' : 'pending',
            selectedPackage: selectedPackage.name,
            dailyAccessCount: 0,
            lastAccessDate: new Date().toISOString().split('T')[0],
            notificationSettings: { email: true, push: true },
            createdAt: Timestamp.now()
          });
          break; // Success
        } catch (err: any) {
          retries--;
          if (retries === 0) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
      }

      // Redirect to WhatsApp
      const message = `Halo Admin, saya ingin berlangganan NINZ SIGNAL paket ${selectedPackage.name} (${selectedPackage.duration}). Username saya: ${username}`;
      const waUrl = `https://wa.me/6282326933843?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
      
      toast.success('Akun berhasil dibuat! Silakan selesaikan pembayaran via WhatsApp.', {
        duration: 5000,
        style: { borderRadius: '12px', background: '#0A0A0A', color: '#fff', border: '1px solid #ffffff10' }
      });
      
      // Optional: Log them out immediately so they don't access the app until approved,
      // or let them in but they will see "pending" status. We'll let them in.
    } catch (error: any) {
      console.error('Register error:', error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Username sudah digunakan. Silakan pilih yang lain.');
      } else {
        toast.error('Gagal membuat akun.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center p-4 md:p-8 overflow-x-hidden relative">
      {/* Background Glows */}
      <div className="absolute top-1/4 -left-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] animate-pulse delay-1000" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-12">
          <Logo className="scale-125 mx-auto" />
        </div>

        {view === 'packages' ? (
          <motion.div
            key="packages"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold tracking-widest uppercase text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)] mb-2">Paket Berlangganan</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Pilih Akses Premium Anda</p>
            </div>

            <div className="space-y-6">
              {packages.map((pkg) => (
                <div key={pkg.id} className="bg-[#0A0A0A]/60 backdrop-blur-xl border border-indigo-500/30 rounded-[32px] p-6 relative overflow-hidden shadow-2xl shadow-indigo-500/5">
                  {pkg.bestValue && (
                    <div className="absolute top-6 right-6 bg-white text-black text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                      Best Value
                    </div>
                  )}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                      <span className="text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] font-bold">∞</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-widest uppercase">{pkg.name}</h3>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest">{pkg.desc}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm text-white/40 line-through">Rp {pkg.originalPrice}</span>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] px-2 py-0.5 rounded uppercase font-bold tracking-wider">Hemat {pkg.save}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">Rp</span>
                      <span className="text-4xl font-bold">{pkg.price}</span>
                      <span className="text-xs text-white/40">/ {pkg.duration}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-8">
                    {pkg.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <CheckCircle2 size={16} className="text-violet-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-white/80 leading-relaxed">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleSelectPackage(pkg)}
                    className="w-full bg-white hover:bg-gray-200 text-black py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-white/20 flex items-center justify-center gap-2"
                  >
                    Beli Sekarang <ChevronRight size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-6 text-center">
              <p className="text-xs text-white/40 mb-4">Sudah punya akun?</p>
              <button
                onClick={() => setView('login')}
                className="bg-white/5 border border-white/10 text-white py-3 px-8 rounded-full font-bold uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all"
              >
                Masuk ke Akun
              </button>
            </div>
          </motion.div>
        ) : view === 'register' ? (
          <motion.div
            key="register"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-[#0A0A0A]/60 backdrop-blur-xl border border-indigo-500/30 rounded-[32px] p-8 relative shadow-2xl shadow-indigo-500/5"
          >
            <button 
              onClick={() => setView('packages')}
              className="absolute top-6 left-6 text-white/40 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            
            <div className="text-center mb-8 mt-4">
              <h2 className="text-xl font-bold tracking-widest uppercase mb-2">Buat Akun</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-widest leading-relaxed">
                Buat username & password untuk mengakses paket <span className="text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">{selectedPackage?.name}</span>
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-5 text-left">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2 ml-2">Username Baru</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-black placeholder-white/20 focus:outline-none focus:border-indigo-500/50 focus:bg-white/5 transition-all"
                    placeholder="Contoh: traderpro99"
                  />
                </div>
                <p className="text-[9px] text-white/30 mt-2 ml-2">Hanya huruf kecil dan angka, tanpa spasi.</p>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2 ml-2">Password Baru</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40">
                    <Key size={18} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-black placeholder-white/20 focus:outline-none focus:border-indigo-500/50 focus:bg-white/5 transition-all"
                    placeholder="Minimal 6 karakter"
                  />
                </div>
              </div>
              
              <div className="flex items-start gap-3 px-2">
                <button
                  type="button"
                  onClick={() => setIsOver18(!isOver18)}
                  className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                    isOver18 ? 'bg-indigo-500 border-indigo-500' : 'bg-white/5 border-white/20'
                  }`}
                >
                  {isOver18 && <CheckCircle2 size={14} className="text-black" />}
                </button>
                <label className="text-[10px] text-white/60 leading-relaxed cursor-pointer" onClick={() => setIsOver18(!isOver18)}>
                  Saya mengonfirmasi bahwa saya berusia <span className="text-white font-bold">18 tahun ke atas</span> dan memahami risiko trading.
                </label>
              </div>
              
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 mt-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/60">Total Pembayaran</span>
                  <span className="text-sm font-bold text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">Rp {selectedPackage?.price}</span>
                </div>
                <p className="text-[9px] text-white/40 leading-relaxed">
                  Setelah klik tombol di bawah, Anda akan diarahkan ke WhatsApp untuk menyelesaikan pembayaran. Akun Anda akan aktif setelah pembayaran dikonfirmasi.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full bg-indigo-500 text-black py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 mt-4 ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-400'
                }`}
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-black"></div>
                ) : (
                  <MessageCircle size={16} />
                )}
                {isLoading ? 'Memproses...' : 'Konfirmasi via WhatsApp'}
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="login"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-[#0A0A0A]/60 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 relative shadow-2xl shadow-black/50"
          >
            <button 
              onClick={() => setView('packages')}
              className="absolute top-6 left-6 text-white/40 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="text-center mb-8 mt-4">
              <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)] mb-4 rotate-12">
                {loginMethod === 'username' ? (
                  <Lock size={32} className="text-black" />
                ) : (
                  <Phone size={32} className="text-black" />
                )}
              </div>
              <h2 className="text-xl font-bold tracking-widest uppercase mb-2">Masuk Akun</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Akses Dashboard Sinyal Anda</p>
            </div>

            <div className="flex bg-white/5 p-1 rounded-xl mb-6">
              <button
                onClick={() => setLoginMethod('username')}
                className={`flex-1 text-[10px] uppercase tracking-widest font-bold py-3 rounded-lg transition-all ${
                  loginMethod === 'username' ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'text-white/40 hover:text-white'
                }`}
              >
                Via Username
              </button>
              <button
                onClick={() => setLoginMethod('wa')}
                className={`flex-1 text-[10px] uppercase tracking-widest font-bold py-3 rounded-lg transition-all ${
                  loginMethod === 'wa' ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'text-white/40 hover:text-white'
                }`}
              >
                Via Phone/WA
              </button>
            </div>

            {loginMethod === 'username' ? (
              <form onSubmit={handleLogin} className="space-y-5 text-left">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2 ml-2">Username</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-black placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:bg-white/5 transition-all"
                      placeholder="Masukkan username"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2 ml-2">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40">
                      <Key size={18} />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-black placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:bg-white/5 transition-all"
                      placeholder="Masukkan password"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full bg-white text-black py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 mt-4 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'
                  }`}
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-black"></div>
                  ) : (
                    <ChevronRight size={16} />
                  )}
                  {isLoading ? 'Memproses...' : 'Masuk Dashboard'}
                </button>
              </form>
            ) : (
              <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="space-y-5 text-left">
                {!otpSent ? (
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2 ml-2">Nomor WhatsApp/HP</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40">
                        <Phone size={18} />
                      </div>
                      <input
                        type="text"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all"
                        placeholder="Contoh: +6281234..."
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2 ml-2">Kode OTP</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40">
                        <Key size={18} />
                      </div>
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all text-center tracking-[0.5em] font-mono font-bold"
                        placeholder="------"
                        maxLength={6}
                      />
                    </div>
                  </div>
                )}
                
                <div id="recaptcha-container"></div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full bg-white text-black py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 mt-4 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'
                  }`}
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-black"></div>
                  ) : (
                    <ChevronRight size={16} />
                  )}
                  {isLoading ? 'Memproses...' : (otpSent ? 'Login' : 'Kirim OTP')}
                </button>
              </form>
            )}
          </motion.div>
        )}

        {/* Risk Disclaimer */}
        <div className="mt-12 p-6 bg-white/5 rounded-3xl border border-white/5 text-center">
          <div className="flex items-center justify-center gap-2 text-violet-500 mb-3">
            <ShieldCheck size={16} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Peringatan Risiko</span>
          </div>
          <p className="text-[9px] text-white/30 leading-relaxed uppercase tracking-widest">
            Trading instrumen finansial memiliki risiko tinggi. Layanan ini hanya untuk tujuan edukasi dan informasi. 
            <span className="text-white/60 block mt-2">Dilarang bagi pengguna di bawah usia 18 tahun.</span>
          </p>
        </div>
      </div>
    </div>
  );
};
