import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { onAuthStateChanged, auth, db, doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, orderBy, limit } from './firebase';
import toast, { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Signals } from './components/Signals';
import { Performance } from './components/Performance';
import { Profile } from './components/Profile';
import { Admin } from './components/Admin';
import { Analysis } from './components/Analysis';
import { Auth } from './components/Auth';
import { User } from 'firebase/auth';
import { Bell } from 'lucide-react';

import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isInitialMount = useRef(true);

  useEffect(() => {
    let unsubscribeProfile: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // Check if user document exists first with retry
          let userDoc: any = null;
          let retries = 3;
          while (retries > 0) {
            try {
              userDoc = await getDoc(doc(db, 'users', currentUser.uid));
              break;
            } catch (err) {
              retries--;
              if (retries === 0) throw err;
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          // Hanya traderpro11 yang jadi Admin, tapi SEMUA jadi Premium
          const isAdmin = currentUser.email === 'traderpro11@ninzsignal.com' || 
                          currentUser.email === 'telegramnino18@gmail.com';
            
          if (!userDoc.exists()) {
            // Create new user profile if it doesn't exist
            const newProfile = {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
              role: isAdmin ? 'admin' : 'user',
              membership: isAdmin ? 'premium' : 'free', // Give admin premium access by default
              dailyAccessCount: 0,
              lastAccessDate: new Date().toISOString().split('T')[0],
              notificationSettings: { email: true, push: true }
            };
            await setDoc(doc(db, 'users', currentUser.uid), newProfile);
          } else {
            // If document exists but user is admin, ensure they have admin role
            const data = userDoc.data();
            
            if (isAdmin && data.role !== 'admin') {
               await updateDoc(doc(db, 'users', currentUser.uid), {
                 role: 'admin',
                 membership: 'premium'
               });
            }
          }

          // Listen to user profile changes in real-time
          unsubscribeProfile = onSnapshot(doc(db, 'users', currentUser.uid), async (docSnapshot) => {
            if (docSnapshot.exists()) {
              const data = docSnapshot.data();
              
              // Enforce admin privileges if overwritten by Auth.tsx race condition
              if (isAdmin && (data.role !== 'admin' || data.membership !== 'premium')) {
                await updateDoc(doc(db, 'users', currentUser.uid), {
                  role: 'admin',
                  membership: 'premium'
                });
                return; // Snapshot will re-trigger with updated data
              }
              
              // Check if subscription has expired (skip for admin)
              if (data.role !== 'admin' && data.membership === 'premium' && data.expiresAt) {
                const now = new Date();
                const expiresAt = data.expiresAt.toDate();
                if (now > expiresAt) {
                  // Subscription expired
                  await updateDoc(doc(db, 'users', currentUser.uid), {
                    membership: 'expired'
                  });
                  data.membership = 'expired';
                }
              }
              
              setUserProfile(data);
            }
            setLoading(false);
          });
        } catch (error) {
          console.error('Error fetching user profile:', error);
          if (error instanceof Error && error.message.includes('the client is offline')) {
            toast.error("Gagal terhubung ke database. Pastikan Firestore sudah diaktifkan di Firebase Console.", { duration: 10000 });
          }
          setLoading(false);
        }
      } else {
        setUserProfile(null);
        setLoading(false);
        if (unsubscribeProfile) unsubscribeProfile();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // Real-time signal notifications
  useEffect(() => {
    if (!user) return;

    const signalsQuery = query(
      collection(db, 'signals')
    );

    const unsubscribe = onSnapshot(signalsQuery, (snapshot) => {
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const signal = change.doc.data();
          if (signal.status !== 'active') return; // Filter in memory
          toast.custom((t) => (
            <div
              className={`${
                t.visible ? 'animate-enter' : 'animate-leave'
              } max-w-md w-full bg-[#0A0A0A] border border-white/10 shadow-2xl rounded-[24px] pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
            >
              <div className="flex-1 w-0 p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0 pt-0.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                      <Bell size={20} />
                    </div>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-bold text-white">
                      Sinyal Baru Tersedia!
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      {signal.pair} - {signal.action === 'BUY' ? 'BELI' : 'JUAL'} @ {signal.entryPrice}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex border-l border-white/5">
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-xs font-bold text-orange-500 hover:text-orange-400 focus:outline-none"
                >
                  Tutup
                </button>
              </div>
            </div>
          ), { duration: 5000 });
        }
      });
    }, (error) => {
      console.error('Notification snapshot error:', error);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" />
        <Routes>
          {!user ? (
            <Route path="*" element={<Auth />} />
          ) : (
            <Route element={<Layout user={user} profile={userProfile} />}>
              <Route path="/" element={<Dashboard profile={userProfile} />} />
              <Route path="/signals" element={<Signals profile={userProfile} setProfile={setUserProfile} />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/analysis" element={<Analysis userProfile={userProfile} />} />
              <Route path="/profile" element={<Profile profile={userProfile} setProfile={setUserProfile} />} />
              {userProfile?.role === 'admin' && <Route path="/admin" element={<Admin />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          )}
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
