import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Sparkles, TrendingUp, TrendingDown, Info, RefreshCw, AlertTriangle, BarChart2, Clock, Terminal as TerminalIcon, Activity, Globe, Zap, ShoppingBag, DollarSign, ArrowUpRight, ArrowDownRight, Download, Cpu, X, Target, Key, ShieldCheck } from 'lucide-react';
import { auth, db, collection, addDoc, Timestamp, handleFirestoreError, OperationType, doc, onSnapshot } from '../firebase';
import ReactMarkdown from 'react-markdown';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'react-hot-toast';
import { sendDiscordNotification, formatSignalMessage } from '../services/discordService';

// TradingView Widget Component
const TradingViewWidget = ({ symbol, timeframe }: { symbol: string, timeframe: string }) => {
  const tfMap: Record<string, string> = {
    '1M': '1',
    '5M': '5',
    '15M': '15',
    '30M': '30',
    '1H': '60',
    '4H': '240',
    '1D': 'D'
  };

  const tvSymbol = symbol === 'XAU/USD' ? 'OANDA:XAUUSD' : 'BINANCE:BTCUSDT';
  const interval = tfMap[timeframe] || '5';
  
  // Use iframe embed for better stability in restricted environments
  // For M1/M5, hide toolbars to make it "closer" and cleaner
  const isScalp = timeframe === '1M' || timeframe === '5M';
  const src = `https://www.tradingview.com/widgetembed/?symbol=${tvSymbol}&interval=${interval}&theme=dark&style=1&locale=en&enable_publishing=false&allow_symbol_change=true&calendar=false&support_host=https://www.tradingview.com${isScalp ? '&hide_top_toolbar=true&hide_legend=true' : ''}`;

  return (
    <div className="h-full w-full bg-black">
      <iframe
        key={src}
        src={src}
        className="h-full w-full border-none"
        title="TradingView Chart"
        referrerPolicy="no-referrer"
        loading="lazy"
      />
    </div>
  );
};

interface EconomicEvent {
  time: string;
  event: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  currency: string;
}

interface MarketData {
  analysis: string;
  identifiedMethods?: string[];
  confirmations?: string[];
  setupType?: string;
  sentiment: {
    xau: { label: string; value: number; change: string };
    btc: { label: string; value: number; change: string };
  };
  levels: {
    xau: { resistance: string; support: string; pivot: string; entry: string; sl: string; tp: string; tp2: string; tp3: string };
    btc: { resistance: string; support: string; pivot: string; entry: string; sl: string; tp: string; tp2: string; tp3: string };
  };
  swingLevels: {
    xau: { 
      buy: { entry: string; sl: string; tp: string; tp2: string; tp3: string };
      sell: { entry: string; sl: string; tp: string; tp2: string; tp3: string };
    };
    btc: { 
      buy: { entry: string; sl: string; tp: string; tp2: string; tp3: string };
      sell: { entry: string; sl: string; tp: string; tp2: string; tp3: string };
    };
  };
  indicators: {
    rsi: string;
    macd: string;
    bollingerBands: string;
    volatility: string;
    volume24h: string;
    rsiDivergence?: {
      m5: string;
      m15: string;
      m30: string;
      h1: string;
      h4: string;
      d1: string;
    };
  };
  predictions: {
    h1: { direction: 'UP' | 'DOWN' | 'SIDEWAYS'; confidence: number; target: string };
    h4: { direction: 'UP' | 'DOWN' | 'SIDEWAYS'; confidence: number; target: string };
  };
  newsSentiment: {
    summary: string;
    score: number; // -100 to 100
    sources: { title: string; url: string }[];
  };
  economicCalendar: EconomicEvent[];
}

type Timeframe = '1M' | '5M' | '15M' | '30M' | '1H' | '4H' | '1D';
type Pair = 'XAU/USD' | 'BTC/USD';

interface TapeEntry {
  id: string;
  time: string;
  price: number;
  size: string;
  side: 'BUY' | 'SELL';
}

export const Analysis = ({ userProfile }: { userProfile: any }) => {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<Pair>('XAU/USD');
  const [showPairDropdown, setShowPairDropdown] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('5M');
  const [impactFilter, setImpactFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [chartData, setChartData] = useState<any[]>([]);
  
  const filteredCalendar = useMemo(() => {
    if (!data?.economicCalendar) return [];
    if (impactFilter === 'ALL') return data.economicCalendar;
    return data.economicCalendar.filter(event => event.impact === impactFilter);
  }, [data?.economicCalendar, impactFilter]);

  const [tape, setTape] = useState<TapeEntry[]>([]);
  
  // Trading Panel State
  const [orderType, setOrderType] = useState<'ULTRASCALP'>('ULTRASCALP');
  const [lotSize, setLotSize] = useState('0.10');
  const [entryPrice, setEntryPrice] = useState('');
  const [swingStopLoss, setSwingStopLoss] = useState('');
  const [swingTakeProfit, setSwingTakeProfit] = useState('');
  const [swingTakeProfit2, setSwingTakeProfit2] = useState('');
  const [swingTakeProfit3, setSwingTakeProfit3] = useState('');
  const [useCustomSwing, setUseCustomSwing] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(300); // Speed up to 5 minutes
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time Clock for 2026
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const [isFirstFetch, setIsFirstFetch] = useState<Record<Pair, boolean>>({
    'XAU/USD': true,
    'BTC/USD': true
  });

  const [isLogging, setIsLogging] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<any>({ discordWebhook: '' });
  const [logEntry, setLogEntry] = useState('');
  const [logSL, setLogSL] = useState('');
  const [logTP, setLogTP] = useState('');
  const [logResult, setLogResult] = useState('');
  const [logAction, setLogAction] = useState<'BUY' | 'SELL'>('BUY');
  const [swingAction, setSwingAction] = useState<'BUY' | 'SELL'>('BUY');
  const [signalTab, setSignalTab] = useState<'XAU' | 'BTC'>('XAU');

  const handleLogTrade = async () => {
    if (!logEntry || !logSL || !logTP || !logResult) {
      toast.error('Harap isi semua field!');
      return;
    }

    setIsLogging(true);
    try {
      if (!auth.currentUser) {
        toast.error('Anda harus masuk untuk mencatat trade.');
        return;
      }
      await addDoc(collection(db, 'signals'), {
        pair: selectedPair,
        action: logAction,
        entryPrice: parseFloat(logEntry),
        sl: parseFloat(logSL),
        tp: parseFloat(logTP),
        result: parseFloat(logResult),
        status: 'closed',
        createdAt: Timestamp.now(),
        type: userProfile?.role === 'admin' ? 'OFFICIAL' : 'ULTRASCALP',
        author: auth.currentUser?.email || 'User',
        uid: auth.currentUser?.uid
      });
      
      toast.success('Trade berhasil dicatat ke Performa!');
      setLogResult('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'signals');
      toast.error('Gagal mencatat trade.');
    } finally {
      setIsLogging(false);
    }
  };

  // 2. Implementasi Gemini AI untuk Analisis Pasar
  const generateAnalysis = useCallback(async (retryCount = 0, force = false) => {
    if (loading && !force) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('API Key Gemini tidak ditemukan. Harap tambahkan GEMINI_API_KEY di Environment Variables.');
      }

      const ai = new GoogleGenAI({ apiKey });
      const model = ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Anda adalah QUANT/ALGO TRADER PROFESIONAL (Elit Institusi Top Tier) dengan rekam jejak kemenangan 95% secara historis. Fokus Anda adalah keakuratan mutlak dan Anda HANYA memberikan sinyal jikaSetup memiliki probabilitas keberhasilan Super Ekstrim di atas 90%.

Berikan sinyal trading presisi maksimum untuk pair ${selectedPair} timeframe ${selectedTimeframe}. Harga saat ini: ${livePricesRef.current[selectedPair].price}.

SYARAT AKURASI SUPER DUPER TINGGI (WAJIB TERPENUHI, JIKA TIDAK = NO TRADE):

1. Smart Money Concepts (SMC) & Struktur Pasar:
   - Wajib ada konfirmasi Change of Character (ChoCh) atau Break of Structure (BOS) yang jelas pada timeframe ini, sejalan dengan higher timeframe.
   - Entry hanya diizinkan pada area Order Block (OB) yang belum dimitigasi atau Fair Value Gap (FVG) kualitas tinggi.

2. Likuiditas (Liquidity Sweep):
   - Wajib ada proses pengambilan likuiditas (Liquidity Sweep / Inducement) sebelum entry. Jangan masuk sebelum ritel trader terkena stop-loss (Trap).

3. Konfluensi Multi-Indikator:
   - EMA 50 & 200: Tren timeframe eksekusi HARUS selaras dengan tren besar (H1/H4).
   - RSI (14) & Divergence: Wajib ada validasi Hidden/Regular Divergence di area Ekstrim.
   - MACD: Histogram & Sinyal Crossover harus sempurna bertepatan dengan OB/FVG.

4. Volatilitas & Waktu (Killzones):
   - Probabilitas tinggi jika berada pada jadwal overlap sisi London atau New York, dengan volume transaksi melonjak drastis.

5. Risk/Reward Ratio (RR) Ekstrem Ketat:
   - RR MInimal Wajib 1:3. Stop Loss harus ditutupi dan diamankan tepat di belakang struktur harga mayor (Swing High/Low) atau titik likuiditas invalid.

Format output di JSON:
- setupType: Isi "BUY" atau "SELL". JIKA ADA KONDISI YANG KURANG ATAU RAGU WALAUPUN SEDIKIT, WAJIB ISI "NO TRADE - Menunggu Setup Institusional Lebih Kuat".
- analysis: Berikan insight SMC, FVG, dan likuiditas mengapa area ini sangat probabilitas tinggi (maksimal 2 kalimat singkat, rasio RR 1:3+).
- confirmations: List konfirmasi mendalam berdasarkan panduan SMC & indikator di atas.
- levels: Hitung Entry akurat di ujung FVG/OB, SL di luar zona likuiditas, TP1(RR 1:2), TP2(RR 1:3), TP3(1:5+).
- Hanya beri sinyal entry JIKA probabilitas sukses secara teori mendekati kepastian berdasarkan parameter institusional.
`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING },
              setupType: { type: Type.STRING },
              confirmations: { type: Type.ARRAY, items: { type: Type.STRING } },
              sentiment: {
                type: Type.OBJECT,
                properties: {
                  xau: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      value: { type: Type.NUMBER },
                      change: { type: Type.STRING }
                    }
                  },
                  btc: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      value: { type: Type.NUMBER },
                      change: { type: Type.STRING }
                    }
                  }
                }
              },
              levels: {
                type: Type.OBJECT,
                properties: {
                  xau: {
                    type: Type.OBJECT,
                    properties: {
                      resistance: { type: Type.STRING },
                      support: { type: Type.STRING },
                      pivot: { type: Type.STRING },
                      entry: { type: Type.STRING },
                      sl: { type: Type.STRING },
                      tp: { type: Type.STRING },
                      tp2: { type: Type.STRING },
                      tp3: { type: Type.STRING }
                    }
                  },
                  btc: {
                    type: Type.OBJECT,
                    properties: {
                      resistance: { type: Type.STRING },
                      support: { type: Type.STRING },
                      pivot: { type: Type.STRING },
                      entry: { type: Type.STRING },
                      sl: { type: Type.STRING },
                      tp: { type: Type.STRING },
                      tp2: { type: Type.STRING },
                      tp3: { type: Type.STRING }
                    }
                  }
                }
              },
              swingLevels: {
                type: Type.OBJECT,
                properties: {
                  xau: {
                    type: Type.OBJECT,
                    properties: {
                      buy: {
                        type: Type.OBJECT,
                        properties: {
                          entry: { type: Type.STRING },
                          sl: { type: Type.STRING },
                          tp: { type: Type.STRING },
                          tp2: { type: Type.STRING },
                          tp3: { type: Type.STRING }
                        }
                      },
                      sell: {
                        type: Type.OBJECT,
                        properties: {
                          entry: { type: Type.STRING },
                          sl: { type: Type.STRING },
                          tp: { type: Type.STRING },
                          tp2: { type: Type.STRING },
                          tp3: { type: Type.STRING }
                        }
                      }
                    }
                  },
                  btc: {
                    type: Type.OBJECT,
                    properties: {
                      buy: {
                        type: Type.OBJECT,
                        properties: {
                          entry: { type: Type.STRING },
                          sl: { type: Type.STRING },
                          tp: { type: Type.STRING },
                          tp2: { type: Type.STRING },
                          tp3: { type: Type.STRING }
                        }
                      },
                      sell: {
                        type: Type.OBJECT,
                        properties: {
                          entry: { type: Type.STRING },
                          sl: { type: Type.STRING },
                          tp: { type: Type.STRING },
                          tp2: { type: Type.STRING },
                          tp3: { type: Type.STRING }
                        }
                      }
                    }
                  }
                }
              },
              indicators: {
                type: Type.OBJECT,
                properties: {
                  rsi: { type: Type.STRING },
                  macd: { type: Type.STRING },
                  bollingerBands: { type: Type.STRING },
                  volatility: { type: Type.STRING },
                  volume24h: { type: Type.STRING },
                  rsiDivergence: {
                    type: Type.OBJECT,
                    properties: {
                      m5: { type: Type.STRING, description: 'BULLISH | BEARISH | NONE' },
                      m15: { type: Type.STRING, description: 'BULLISH | BEARISH | NONE' },
                      m30: { type: Type.STRING, description: 'BULLISH | BEARISH | NONE' },
                      h1: { type: Type.STRING, description: 'BULLISH | BEARISH | NONE' },
                      h4: { type: Type.STRING, description: 'BULLISH | BEARISH | NONE' },
                      d1: { type: Type.STRING, description: 'BULLISH | BEARISH | NONE' }
                    }
                  }
                }
              },
              predictions: {
                type: Type.OBJECT,
                properties: {
                  h1: {
                    type: Type.OBJECT,
                    properties: {
                      direction: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                      target: { type: Type.STRING }
                    }
                  },
                  h4: {
                    type: Type.OBJECT,
                    properties: {
                      direction: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                      target: { type: Type.STRING }
                    }
                  }
                }
              },
              newsSentiment: {
                type: Type.OBJECT,
                properties: {
                  summary: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  sources: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        url: { type: Type.STRING }
                      }
                    }
                  }
                }
              },
              economicCalendar: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    event: { type: Type.STRING },
                    impact: { type: Type.STRING },
                    currency: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const response = await model;
      let responseText = response.text || '';
      // Hapus blok markdown json jika ada
      if (responseText.includes('```json')) {
         responseText = responseText.replace(/```json\n?/, '').replace(/```\n?$/, '');
      } else if (responseText.includes('```')) {
         responseText = responseText.replace(/```\n?/, '').replace(/```\n?$/, '');
      }
      const rawData = JSON.parse(responseText);
      const normalizedData = normalizeMarketData(rawData);
      
      setData(normalizedData);
      setIsFallback(false);
      setLastUpdated(new Date());

      // Send Discord Notification for AI Signal
      if (globalSettings.discordWebhook) {
        const pairLevels = selectedPair === 'XAU/USD' ? normalizedData.levels.xau : normalizedData.levels.btc;
        const discordMsg = formatSignalMessage({
          pair: selectedPair,
          action: parseFloat(String(pairLevels.entry).replace(/,/g, '')) > parseFloat(String(pairLevels.sl).replace(/,/g, '')) ? 'BUY' : 'SELL',
          entryPrice: pairLevels.entry,
          tp: pairLevels.tp,
          sl: pairLevels.sl,
          analysis: normalizedData.analysis,
          setupType: normalizedData.setupType,
          confirmations: normalizedData.confirmations
        });
        await sendDiscordNotification(globalSettings.discordWebhook, discordMsg);
      }
      
      if (force) {
        toast.success('Analisis AI Diperbarui', {
          icon: '✨',
          style: { background: '#0A0A0A', color: '#fff', border: '1px solid #f97316' }
        });
      }
    } catch (err: any) {
      console.error('Gemini Error:', err);
      
      // Fallback ke sistem internal jika AI gagal
      generateSystemFallback();
      
      if (err.message?.includes('API Key')) {
        setError(err.message);
      } else if (err.status === 429 || err.message?.includes('429') || err.message?.includes('Quota') || err.message?.includes('quota')) {
        toast.error('Limit API AI telah habis. Menggunakan sistem cadangan (Fallback).', {
          style: { background: '#0A0A0A', color: '#fff', border: '1px solid #EF4444' }
        });
      } else if (retryCount < 1) {
        // Satu kali retry otomatis
        setTimeout(() => generateAnalysis(retryCount + 1), 2000);
      } else {
        toast.error('Gagal memuat analisis AI. Menggunakan sistem cadangan.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPair, selectedTimeframe]);
  
  // No clamping needed
  const clampXauPrice = (price: number) => price;

  // Live Price State
  const [livePrices, setLivePrices] = useState({
    'XAU/USD': { price: 2350.50, change: '+0.45%', isUp: true },
    'BTC/USD': { price: 65000.00, change: '+1.25%', isUp: true }
  });
  const lastTPHitTimeRef = useRef<number>(0);

  // Ref to track latest prices for simulation without triggering re-renders
  const livePricesRef = useRef(livePrices);
  useEffect(() => {
    livePricesRef.current = livePrices;
  }, [livePrices]);

  // Tape Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      const side = Math.random() > 0.45 ? 'BUY' : 'SELL';
      const size = (Math.random() * 2 + 0.1).toFixed(2);
      const currentPrice = livePricesRef.current[selectedPair].price;
      const newEntry: TapeEntry = {
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        price: currentPrice + (Math.random() - 0.5) * 0.05,
        size: selectedPair === 'BTC/USD' ? size : (parseFloat(size) * 10).toFixed(1),
        side
      };
      setTape(prev => [newEntry, ...prev].slice(0, 15));
    }, 400);
    return () => clearInterval(interval);
  }, [selectedPair]);

  // WebSocket for BTC/USD & XAU/USD (Binance)
  useEffect(() => {
    const btcWs = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
    const xauWs = new WebSocket('wss://stream.binance.com:9443/ws/paxgusdt@ticker');
    
    btcWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const price = parseFloat(data.c); 
      const change = parseFloat(data.P);
      setLivePrices(prev => ({
        ...prev,
        'BTC/USD': {
          price: price,
          change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
          isUp: change >= 0
        }
      }));
      if (isFirstFetch['BTC/USD']) {
        setIsFirstFetch(prev => ({ ...prev, 'BTC/USD': false }));
      }
    };

    xauWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const price = clampXauPrice(parseFloat(data.c));
      const change = parseFloat(data.P);
      setLivePrices(prev => ({
        ...prev,
        'XAU/USD': {
          price: price,
          change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
          isUp: change >= 0
        }
      }));
      if (isFirstFetch['XAU/USD']) {
        setIsFirstFetch(prev => ({ ...prev, 'XAU/USD': false }));
      }
    };

    // Tick Simulator for MT5-like flicker
    const tickInterval = setInterval(() => {
      setLivePrices(prev => {
        const newPrices = { ...prev };
        (Object.keys(newPrices) as Pair[]).forEach(pair => {
          const volatility = pair === 'XAU/USD' ? 0.02 : 0.5;
          const flicker = (Math.random() - 0.5) * volatility;
          newPrices[pair] = {
            ...newPrices[pair],
            price: newPrices[pair].price + flicker
          };
        });
        return newPrices;
      });
    }, 200);

    // Helper for resilient fetching via multiple proxies
    const fetchWithProxy = async (targetUrl: string, retryCount = 0): Promise<any> => {
      const proxies = [
        'https://api.allorigins.win/get?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://thingproxy.freeboard.io/fetch/'
      ];
      
      const proxy = proxies[retryCount % proxies.length];
      const fullUrl = `${proxy}${encodeURIComponent(targetUrl)}`;
      
      try {
        const response = await fetch(fullUrl);
        if (!response.ok) throw new Error(`Proxy ${proxy} failed`);
        
        if (proxy.includes('allorigins')) {
          const proxyData = await response.json();
          if (proxyData.contents) {
            try {
              return JSON.parse(proxyData.contents);
            } catch (e) {
              console.warn('Gagal parse contents dari allorigins');
              throw new Error('Invalid JSON in proxy contents');
            }
          }
          throw new Error('Empty contents from proxy');
        }
        return await response.json();
      } catch (err) {
        if (retryCount < proxies.length - 1) {
          return fetchWithProxy(targetUrl, retryCount + 1);
        }
        throw err;
      }
    };

    // Backup BTC/USD Feed (CoinGecko via Proxy)
    const fetchBtcPrice = async () => {
      if (btcWs.readyState === WebSocket.OPEN) return;
      try {
        const data = await fetchWithProxy('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        if (data && data.bitcoin) {
          setLivePrices(prev => ({
            ...prev,
            'BTC/USD': {
              price: data.bitcoin.usd,
              change: `${data.bitcoin.usd_24h_change >= 0 ? '+' : ''}${data.bitcoin.usd_24h_change.toFixed(2)}%`,
              isUp: data.bitcoin.usd_24h_change >= 0
            }
          }));
        }
        if (isFirstFetch['BTC/USD']) {
          setIsFirstFetch(prev => ({ ...prev, 'BTC/USD': false }));
        }
      } catch (err) {
        console.warn('All BTC proxies failed:', err);
      }
    };

    const btcInterval = setInterval(fetchBtcPrice, 60000);

    // Real-time XAU/USD Feed (Yahoo Finance via Proxy)
    const fetchXauPrice = async () => {
      try {
        // Try Binance PAXGUSDT first as it's often more reliable
        const binanceData = await fetchWithProxy('https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT');
        if (binanceData?.price) {
          const price = clampXauPrice(parseFloat(binanceData.price)); 
          setLivePrices(prev => ({
            ...prev,
            'XAU/USD': {
              ...prev['XAU/USD'],
              price: price,
              change: prev['XAU/USD'].change // Keep existing change for now
            }
          }));
          if (isFirstFetch['XAU/USD']) {
            setIsFirstFetch(prev => ({ ...prev, 'XAU/USD': false }));
          }
          return;
        }
      } catch (err) {
        console.warn('Binance PAXG fallback failed, trying Yahoo');
      }

      try {
        const data = await fetchWithProxy('https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1m&range=1d');
        if (data?.chart?.result?.[0]) {
          const result = data.chart.result[0];
          const price = clampXauPrice(result.meta.regularMarketPrice); 
          const prevClose = result.meta.previousClose;
          const change = ((price - prevClose) / prevClose) * 100;

          setLivePrices(prev => ({
            ...prev,
            'XAU/USD': {
              price: price,
              change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
              isUp: change >= 0
            }
          }));
        }
        if (isFirstFetch['XAU/USD']) {
          setIsFirstFetch(prev => ({ ...prev, 'XAU/USD': false }));
        }
      } catch (err) {
        console.warn('Yahoo Finance proxies failed, trying PAXG fallback');
        try {
          const data = await fetchWithProxy('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true');
          if (data?.['pax-gold']) {
            const price = data['pax-gold'].usd;
            const change = data['pax-gold'].usd_24h_change;
            setLivePrices(prev => ({
              ...prev,
              'XAU/USD': {
                price: price,
                change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
                isUp: change >= 0
              }
            }));
          }
        } catch (e) {
          // Simulation fallback
          setLivePrices(prev => ({
            ...prev,
            'XAU/USD': { ...prev['XAU/USD'], price: prev['XAU/USD'].price + (Math.random() - 0.5) * 0.05 }
          }));
        }
      }
    };

    fetchXauPrice();
    const xauInterval = setInterval(fetchXauPrice, 10000); // Update every 10s for better real-time feel

    return () => {
      btcWs.close();
      xauWs.close();
      clearInterval(tickInterval);
      clearInterval(btcInterval);
      clearInterval(xauInterval);
    };
  }, []);

  // Generate mock historical data
  const generateChartData = (pair: Pair, timeframe: Timeframe, currentPrice: number) => {
    const points = timeframe === '1M' ? 60 : timeframe === '5M' ? 50 : timeframe === '1H' ? 24 : 30;
    const volatility = pair === 'XAU/USD' ? 15 : 2500;
    
    // Simple deterministic pseudo-random based on index and pair string
    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    const pairSeed = pair.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    return Array.from({ length: points }).map((_, i) => {
      const time = new Date();
      if (timeframe === '1M') time.setMinutes(time.getMinutes() - (points - i));
      if (timeframe === '5M') time.setMinutes(time.getMinutes() - (points - i) * 5);
      if (timeframe === '1H') time.setHours(time.getHours() - (points - i));
      if (timeframe === '4H') time.setHours(time.getHours() - (points - i) * 4);
      if (timeframe === '1D') time.setDate(time.getDate() - (points - i));

      if (isNaN(time.getTime())) return { time: 'N/A', price: 0, ema8: 0, ema21: 0 };

      // Use pseudoRandom instead of Math.random() for stable history
      const seed = pairSeed + i + (timeframe.charCodeAt(0));
      const walk = (pseudoRandom(seed) - 0.5) * (volatility / 5);
      const offset = (points - 1 - i) * (volatility / 50);
      const price = currentPrice - offset + walk;

      return {
        time: timeframe === '1D' ? time.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 
              time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        price,
        ema8: price * (1 + (pseudoRandom(seed + 1) * 0.001)),
        ema21: price * (1 - (pseudoRandom(seed + 2) * 0.001))
      };
    });
  };

  // Initialize Chart Data
  useEffect(() => {
    const initial = generateChartData(selectedPair, selectedTimeframe, livePricesRef.current[selectedPair].price);
    setChartData(initial);
  }, [selectedPair, selectedTimeframe]);

  // Real-time Chart Update Loop (Smooth movement)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentPrice = livePricesRef.current[selectedPair].price;
      
      setChartData(prev => {
        if (prev.length === 0) return prev;
        
        const lastPoint = prev[prev.length - 1];
        const now = new Date();
        const getTimeStr = (date: Date, tf: Timeframe) => {
          const d = new Date(date);
          if (tf === '1D') return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
          if (tf === '4H') {
            const hour = Math.floor(d.getHours() / 4) * 4;
            d.setHours(hour, 0, 0, 0);
            return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          }
          if (tf === '1H') {
            d.setMinutes(0, 0, 0);
            return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          }
          if (tf === '5M') {
            const min = Math.floor(d.getMinutes() / 5) * 5;
            d.setMinutes(min, 0, 0);
            return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          }
          // 1M
          d.setSeconds(0, 0);
          return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        };

        const timeStr = getTimeStr(now, selectedTimeframe);

        // If the time is the same as the last point, just update the price (real-time tick)
        if (lastPoint.time === timeStr) {
          const updatedLastPoint = {
            ...lastPoint,
            price: currentPrice,
            ema8: currentPrice * (1 + (Math.random() * 0.0002)),
            ema21: currentPrice * (1 - (Math.random() * 0.0002))
          };
          return [...prev.slice(0, -1), updatedLastPoint];
        }

        // Otherwise, add a new point and shift (scrolling chart)
        const newPoint = {
          time: timeStr,
          price: currentPrice,
          ema8: currentPrice * (1 + (Math.random() * 0.0002)),
          ema21: currentPrice * (1 - (Math.random() * 0.0002))
        };
        return [...prev.slice(1), newPoint];
      });
    }, 2000); // Update chart every 2 seconds for smooth feel
    return () => clearInterval(interval);
  }, [selectedPair, selectedTimeframe]);

  // Chart Base Price (to keep chart stable during large jumps)
  const [chartBasePrice, setChartBasePrice] = useState<Record<Pair, number>>({
    'XAU/USD': 2350.50,
    'BTC/USD': 65000.00
  });

  // Update chart base price when pair changes or when we get a significantly different price for the first time
  useEffect(() => {
    const currentPrice = livePrices[selectedPair].price;
    const diff = Math.abs(currentPrice - chartBasePrice[selectedPair]);
    
    // If it's the first real fetch, or the difference is extremely large (e.g. 5%), re-anchor the chart
    // We increase threshold significantly to prevent erratic jumps during normal volatility
    const threshold = selectedPair === 'BTC/USD' ? 5000 : 100;
    const shouldReAnchor = isFirstFetch[selectedPair] || diff > threshold;

    if (shouldReAnchor) {
      setChartBasePrice(prev => ({ ...prev, [selectedPair]: currentPrice }));
      
      // Also re-initialize chart data for the new anchor
      const reAnchored = generateChartData(selectedPair, selectedTimeframe, currentPrice);
      setChartData(reAnchored);
      
      if (isFirstFetch[selectedPair]) {
        setIsFirstFetch(prev => ({ ...prev, [selectedPair]: false }));
      }
    }
  }, [selectedPair, livePrices]);

  // Fungsi untuk menghitung RSI secara lokal (fallback)
  const calculateLocalRSI = (prices: number[]) => {
    if (prices.length < 14) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < 14; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return Math.round(100 - (100 / (1 + rs)));
  };

  const calculateRR = (entry: number, sl: number, ratio: number, isBtc: boolean) => {
    const risk = Math.abs(entry - sl);
    
    // Validate risk to be between 50-100 pips for XAU (5.0 - 10.0) and 50-150 for BTC
    let effectiveRisk = risk;
    if (isBtc) {
      if (effectiveRisk < 50) effectiveRisk = 50;
      if (effectiveRisk > 150) effectiveRisk = 150;
    } else {
      if (effectiveRisk < 5.00) effectiveRisk = 5.00 + (Math.random() * 2); // 50-70 pips
      if (effectiveRisk > 10.00) effectiveRisk = 10.00; // Max 100 pips
    }
    
    const isBuy = entry >= sl;
    const tp = isBuy ? entry + (effectiveRisk * ratio) : entry - (effectiveRisk * ratio);
    return isBtc ? tp.toFixed(0) : tp.toFixed(2);
  };

  // Helper untuk menormalisasi data (mencegah crash jika field hilang)
  const normalizeMarketData = (raw: any): MarketData => {
    const xauPrice = livePricesRef.current['XAU/USD'].price;
    const btcPrice = livePricesRef.current['BTC/USD'].price;
    
    // Sanity Check: Jika level terlalu jauh (>2%), paksa gunakan harga saat ini sebagai basis
    const isLevelValid = (val: string | number | undefined, refPrice: number) => {
      if (val === undefined || val === null) return false;
      const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
      if (isNaN(num)) return false;
      return Math.abs(num - refPrice) <= refPrice * 0.02;
    };

    // Khusus Entry Swing: Harus cukup dekat dengan harga (max 0.3%)
    const isEntryValid = (val: string | number | undefined, refPrice: number) => {
      if (val === undefined || val === null) return false;
      const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
      if (isNaN(num)) return false;
      return Math.abs(num - refPrice) <= refPrice * 0.003;
    };

    const rawXau = raw?.levels?.xau || {};
    const rawBtc = raw?.levels?.btc || {};
    
    // Logic: Jika data masuk akal, gunakan. Jika tidak, buat level scalping otomatis.
    const getLevel = (rawVal: any, refPrice: number, offset: number, isBtc: boolean) => {
      if (isLevelValid(rawVal, refPrice)) {
        const num = typeof rawVal === 'string' ? parseFloat(rawVal.replace(/,/g, '')) : rawVal;
        return num;
      }
      return refPrice + offset;
    };

    const xauEntry = isEntryValid(rawXau.entry, xauPrice) ? parseFloat(String(rawXau.entry).replace(/,/g, '')) : xauPrice;
    
    // Dynamic SL offset based on timeframe
    let xauSLOffset = 0.50; // 50 pips (Scalping)
    let btcSLOffset = 50;  // 50 pips
    
    if (selectedTimeframe === '15M' || selectedTimeframe === '30M') {
      xauSLOffset = 1.50; // 150 pips (Intraday)
      btcSLOffset = 50;
    } else if (selectedTimeframe === '1H' || selectedTimeframe === '4H' || selectedTimeframe === '1D') {
      xauSLOffset = 5.00; // 500 pips (Swing)
      btcSLOffset = 50;
    }

    const xauSL = isLevelValid(rawXau.sl, xauPrice) ? parseFloat(String(rawXau.sl).replace(/,/g, '')) : xauPrice - xauSLOffset;
    
    const btcEntry = isEntryValid(rawBtc.entry, btcPrice) ? parseFloat(String(rawBtc.entry).replace(/,/g, '')) : btcPrice;
    const btcSL = isLevelValid(rawBtc.sl, btcPrice) ? parseFloat(String(rawBtc.sl).replace(/,/g, '')) : btcPrice - btcSLOffset;

    const levels = {
      xau: {
        resistance: getLevel(rawXau.resistance, xauPrice, 0.25, false).toFixed(2),
        support: getLevel(rawXau.support, xauPrice, -0.25, false).toFixed(2),
        pivot: xauPrice.toFixed(2),
        entry: xauEntry.toFixed(2),
        sl: xauSL.toFixed(2),
        tp: calculateRR(xauEntry, xauSL, 2, false),
        tp2: calculateRR(xauEntry, xauSL, 3, false),
        tp3: calculateRR(xauEntry, xauSL, 4, false)
      },
      btc: {
        resistance: getLevel(rawBtc.resistance, btcPrice, 50, true).toFixed(0),
        support: getLevel(rawBtc.support, btcPrice, -50, true).toFixed(0),
        pivot: btcPrice.toFixed(0),
        entry: btcEntry.toFixed(0),
        sl: btcSL.toFixed(0),
        tp: calculateRR(btcEntry, btcSL, 2, true),
        tp2: calculateRR(btcEntry, btcSL, 3, true),
        tp3: calculateRR(btcEntry, btcSL, 4, true)
      }
    };

    const rawSwingXau = raw?.swingLevels?.xau || {};
    const rawSwingBtc = raw?.swingLevels?.btc || {};

    const processSwing = (raw: any, currentPrice: number, isBtc: boolean) => {
      // Dynamic offsets for swing/log levels
      let entryOffset = isBtc ? 10 : 0.50; // Scalping
      let slOffset = isBtc ? 50 : 1.00;
      
      if (selectedTimeframe === '15M' || selectedTimeframe === '30M') {
        entryOffset = isBtc ? 20 : 1.50; // Intraday
        slOffset = isBtc ? 50 : 3.00;
      } else if (selectedTimeframe === '1H' || selectedTimeframe === '4H' || selectedTimeframe === '1D') {
        entryOffset = isBtc ? 30 : 5.00; // Swing
        slOffset = isBtc ? 50 : 10.00;
      }

      const buyEntry = isLevelValid(raw.buy?.entry, currentPrice) ? parseFloat(String(raw.buy.entry).replace(/,/g, '')) : currentPrice - entryOffset;
      const buySL = isLevelValid(raw.buy?.sl, currentPrice) ? parseFloat(String(raw.buy.sl).replace(/,/g, '')) : buyEntry - slOffset;
      
      const sellEntry = isLevelValid(raw.sell?.entry, currentPrice) ? parseFloat(String(raw.sell.entry).replace(/,/g, '')) : currentPrice + entryOffset;
      const sellSL = isLevelValid(raw.sell?.sl, currentPrice) ? parseFloat(String(raw.sell.sl).replace(/,/g, '')) : sellEntry + slOffset;

      return {
        buy: {
          entry: buyEntry.toFixed(isBtc ? 0 : 2),
          sl: buySL.toFixed(isBtc ? 0 : 2),
          tp: calculateRR(buyEntry, buySL, 3, isBtc),
          tp2: calculateRR(buyEntry, buySL, 4, isBtc),
          tp3: calculateRR(buyEntry, buySL, 5, isBtc)
        },
        sell: {
          entry: sellEntry.toFixed(isBtc ? 0 : 2),
          sl: sellSL.toFixed(isBtc ? 0 : 2),
          tp: calculateRR(sellEntry, sellSL, 3, isBtc),
          tp2: calculateRR(sellEntry, sellSL, 4, isBtc),
          tp3: calculateRR(sellEntry, sellSL, 5, isBtc)
        }
      };
    };

    const swingLevels = {
      xau: processSwing(rawSwingXau, xauPrice, false),
      btc: processSwing(rawSwingBtc, btcPrice, true)
    };

    return {
      analysis: raw.analysis || 'Analisis pasar tidak tersedia saat ini.',
      setupType: raw.setupType || 'Standard Setup',
      confirmations: Array.isArray(raw.confirmations) ? raw.confirmations : ['Konfirmasi Struktur Harga', 'Analisis Volume', 'Indikator Teknikal'],
      identifiedMethods: Array.isArray(raw.identifiedMethods) ? raw.identifiedMethods : [],
      sentiment: {
        xau: { 
          label: raw.sentiment?.xau?.label || 'NEUTRAL', 
          value: typeof raw.sentiment?.xau?.value === 'number' ? raw.sentiment.xau.value : 50, 
          change: raw.sentiment?.xau?.change || '0%' 
        },
        btc: { 
          label: raw.sentiment?.btc?.label || 'NEUTRAL', 
          value: typeof raw.sentiment?.btc?.value === 'number' ? raw.sentiment.btc.value : 50, 
          change: raw.sentiment?.btc?.change || '0%' 
        }
      },
      levels: levels,
      swingLevels: swingLevels,
      indicators: {
        rsi: String(raw.indicators?.rsi || '50'),
        macd: raw.indicators?.macd || 'NEUTRAL',
        bollingerBands: raw.indicators?.bollingerBands || 'MID',
        volatility: raw.indicators?.volatility || 'LOW',
        volume24h: raw.indicators?.volume24h || 'LOW',
        rsiDivergence: {
          m5: raw.indicators?.rsiDivergence?.m5 || 'NONE',
          m15: raw.indicators?.rsiDivergence?.m15 || 'NONE',
          m30: raw.indicators?.rsiDivergence?.m30 || 'NONE',
          h1: raw.indicators?.rsiDivergence?.h1 || 'NONE',
          h4: raw.indicators?.rsiDivergence?.h4 || 'NONE',
          d1: raw.indicators?.rsiDivergence?.d1 || 'NONE',
        }
      },
      predictions: {
        h1: { 
          direction: raw.predictions?.h1?.direction || 'SIDEWAYS', 
          confidence: typeof raw.predictions?.h1?.confidence === 'number' ? raw.predictions.h1.confidence : 50, 
          target: String(raw.predictions?.h1?.target || '0') 
        },
        h4: { 
          direction: raw.predictions?.h4?.direction || 'SIDEWAYS', 
          confidence: typeof raw.predictions?.h4?.confidence === 'number' ? raw.predictions.h4.confidence : 50, 
          target: String(raw.predictions?.h4?.target || '0') 
        }
      },
      newsSentiment: {
        summary: raw.newsSentiment?.summary || 'Tidak ada berita signifikan.',
        score: typeof raw.newsSentiment?.score === 'number' ? raw.newsSentiment.score : 0,
        sources: Array.isArray(raw.newsSentiment?.sources) ? raw.newsSentiment.sources : []
      },
      economicCalendar: Array.isArray(raw.economicCalendar) ? raw.economicCalendar : []
    };
  };

  // Fungsi untuk menghasilkan data analisis sistem
    const generateSystemFallback = () => {
      setIsFallback(true);
      const xauPrice = livePrices['XAU/USD']?.price || 2350.50;
      const btcPrice = livePrices['BTC/USD']?.price || 65000.00;
      
      // Simulasi perhitungan teknikal sederhana
      const rsi = calculateLocalRSI(chartData.map(d => d.price));
      const volatility = (Math.random() * 2 + 0.5).toFixed(2) + '%';
      
      // Logika S/R: Berikan spread yang lebih lebar agar tidak menumpuk (RR lebih akurat)
      const xauResistance = xauPrice + 2.50 + (Math.random() * 0.5);
      const xauSupport = xauPrice - 2.50 - (Math.random() * 0.5);
      const btcResistance = btcPrice + 450 + (Math.random() * 100);
      const btcSupport = btcPrice - 450 - (Math.random() * 100);

      const isXauAtResistance = rsi > 60;
      const isXauAtSupport = rsi < 40;
      const isBtcAtResistance = btcPrice > (chartData[0]?.price || 0);
      const isBtcAtSupport = btcPrice < (chartData[0]?.price || 0);

      const rawFallback = {
        analysis: `### ALGORITHM ANALYSIS (SYSTEM FALLBACK)\n\n**Sistem Algoritma Cerdas** telah mengidentifikasi lebih dari 30 metode analisa teknikal untuk memberikan perspektif jernih.\n\n**XAU/USD Analysis:**\nHarga saat ini berada di ${xauPrice.toFixed(2)}. ${isXauAtResistance ? 'Harga mendekati RESISTANCE, sinyal SELL disarankan.' : isXauAtSupport ? 'Harga mendekati SUPPORT, sinyal BUY disarankan.' : 'Harga berada di area netral.'} Berdasarkan indikator teknikal sistem, pasar menunjukkan kondisi ${rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NETRAL'}.\n\n**BTC/USD Analysis:**\nHarga BTC di ${btcPrice.toLocaleString()} menunjukkan volatilitas ${volatility}. ${isBtcAtResistance ? 'Harga mendekati RESISTANCE, sinyal SELL disarankan.' : isBtcAtSupport ? 'Harga mendekati SUPPORT, sinyal BUY disarankan.' : 'Harga berada di area netral.'} Tren jangka pendek terlihat ${btcPrice > (chartData[0]?.price || 0) ? 'BULLISH' : 'BEARISH'}.`,
      identifiedMethods: [
        "RSI (Relative Strength Index)",
        "MACD (Moving Average Convergence Divergence)",
        "Bollinger Bands",
        "Moving Averages (MA 50/200)",
        "Fibonacci Retracement",
        "Candlestick Pattern Recognition",
        "Support & Resistance Analysis",
        "Pivot Points (Standard)",
        "Volume Analysis",
        "Volatility Index (ATR)"
      ],
        sentiment: {
          xau: { label: isXauAtResistance ? 'BEARISH' : isXauAtSupport ? 'BULLISH' : (rsi > 50 ? 'BULLISH' : 'BEARISH'), value: rsi, change: livePrices['XAU/USD']?.change || '0%' },
          btc: { label: isBtcAtResistance ? 'BEARISH' : isBtcAtSupport ? 'BULLISH' : (btcPrice > (chartData[0]?.price || 0) ? 'BULLISH' : 'BEARISH'), value: 65, change: livePrices['BTC/USD']?.change || '0%' }
        },
        levels: {
          xau: { 
            resistance: xauResistance.toFixed(2), 
            support: xauSupport.toFixed(2), 
            pivot: xauPrice.toFixed(2), 
            entry: xauPrice.toFixed(2), 
            sl: (isXauAtResistance ? xauPrice + 3.00 : xauPrice - 3.00).toFixed(2), 
            tp: calculateRR(xauPrice, (isXauAtResistance ? xauPrice + 3.00 : xauPrice - 3.00), 2, false),
            tp2: calculateRR(xauPrice, (isXauAtResistance ? xauPrice + 3.00 : xauPrice - 3.00), 3, false),
            tp3: calculateRR(xauPrice, (isXauAtResistance ? xauPrice + 3.00 : xauPrice - 3.00), 4, false)
          },
          btc: { 
            resistance: btcResistance.toFixed(0), 
            support: btcSupport.toFixed(0), 
            pivot: btcPrice.toFixed(0), 
            entry: btcPrice.toFixed(0), 
            sl: (isBtcAtResistance ? btcPrice + 300 : btcPrice - 300).toFixed(0), 
            tp: calculateRR(btcPrice, (isBtcAtResistance ? btcPrice + 300 : btcPrice - 300), 2, true),
            tp2: calculateRR(btcPrice, (isBtcAtResistance ? btcPrice + 300 : btcPrice - 300), 3, true),
            tp3: calculateRR(btcPrice, (isBtcAtResistance ? btcPrice + 300 : btcPrice - 300), 4, true)
          }
        },
        swingLevels: {
          xau: { 
            buy: {
              entry: (xauPrice - 5.00 - (Math.random() * 2)).toFixed(2),
              sl: (xauPrice - 15.00).toFixed(2),
              tp: calculateRR(xauPrice - 5.00 - (Math.random() * 2), xauPrice - 15.00, 3, false),
              tp2: calculateRR(xauPrice - 5.00 - (Math.random() * 2), xauPrice - 15.00, 4, false),
              tp3: calculateRR(xauPrice - 5.00 - (Math.random() * 2), xauPrice - 15.00, 5, false)
            },
            sell: {
              entry: (xauPrice + 5.00 + (Math.random() * 2)).toFixed(2),
              sl: (xauPrice + 15.00).toFixed(2),
              tp: calculateRR(xauPrice + 5.00 + (Math.random() * 2), xauPrice + 15.00, 3, false),
              tp2: calculateRR(xauPrice + 5.00 + (Math.random() * 2), xauPrice + 15.00, 4, false),
              tp3: calculateRR(xauPrice + 5.00 + (Math.random() * 2), xauPrice + 15.00, 5, false)
            }
          },
          btc: { 
            buy: {
              entry: (btcPrice - 1500 - (Math.random() * 500)).toFixed(0),
              sl: (btcPrice - 3000).toFixed(0),
              tp: calculateRR(btcPrice - 1500 - (Math.random() * 500), btcPrice - 3000, 3, true),
              tp2: calculateRR(btcPrice - 1500 - (Math.random() * 500), btcPrice - 3000, 4, true),
              tp3: calculateRR(btcPrice - 1500 - (Math.random() * 500), btcPrice - 3000, 5, true)
            },
            sell: {
              entry: (btcPrice + 1500 + (Math.random() * 500)).toFixed(0),
              sl: (btcPrice + 3000).toFixed(0),
              tp: calculateRR(btcPrice + 1500 + (Math.random() * 500), btcPrice + 3000, 3, true),
              tp2: calculateRR(btcPrice + 1500 + (Math.random() * 500), btcPrice + 3000, 4, true),
              tp3: calculateRR(btcPrice + 1500 + (Math.random() * 500), btcPrice + 3000, 5, true)
            }
          }
        },
      indicators: {
        rsi: rsi.toString(),
        macd: rsi > 50 ? 'BULLISH CROSSOVER' : 'BEARISH CROSSOVER',
        bollingerBands: 'MID-RANGE',
        volatility: volatility,
        volume24h: 'MODERATE',
        rsiDivergence: {
          m5: Math.random() > 0.8 ? 'BULLISH' : Math.random() > 0.8 ? 'BEARISH' : 'NONE',
          m15: Math.random() > 0.8 ? 'BULLISH' : Math.random() > 0.8 ? 'BEARISH' : 'NONE',
          m30: Math.random() > 0.8 ? 'BULLISH' : Math.random() > 0.8 ? 'BEARISH' : 'NONE',
          h1: Math.random() > 0.7 ? 'BULLISH' : Math.random() > 0.7 ? 'BEARISH' : 'NONE',
          h4: Math.random() > 0.9 ? 'BULLISH' : Math.random() > 0.9 ? 'BEARISH' : 'NONE',
          d1: 'NONE'
        }
      },
      predictions: {
        h1: { direction: rsi > 50 ? 'UP' : 'DOWN', confidence: 60, target: (xauPrice * (rsi > 50 ? 1.005 : 0.995)).toFixed(2) },
        h4: { direction: 'SIDEWAYS', confidence: 45, target: xauPrice.toFixed(2) }
      },
      newsSentiment: {
        summary: "Analisis teknikal real-time berdasarkan Ninz AI dan data historis pasar.",
        score: rsi - 50,
        sources: [
          { title: "Technical Analysis Report", url: "#" },
          { title: "Market Volatility Index", url: "#" }
        ]
      },
      economicCalendar: [
        { time: "NOW", event: "System Analysis Active", impact: "LOW", currency: "SYSTEM" }
      ]
    };
    
    const normalized = normalizeMarketData(rawFallback);
    setData(normalized);
    setError(null); // Clear any previous error
    setLastUpdated(new Date());
    setLoading(false);
    setIsFallback(true);
    toast.success('Ninz AI Aktif', {
      icon: '⚙️',
      style: { background: '#0A0A0A', color: '#fff', border: '1px solid #3b82f6' }
    });
  };

  const downloadReport = () => {
    if (!data) return;
    
    const report = `
NINZ TRADE ANALYSIS REPORT
Generated: ${new Date().toLocaleString()}
------------------------------------------

MARKET SENTIMENT:
XAU/USD: ${data.sentiment.xau.label} (${data.sentiment.xau.value}%)
BTC/USD: ${data.sentiment.btc.label} (${data.sentiment.btc.value}%)

TECHNICAL INDICATORS:
RSI (14): ${data.indicators.rsi}
MACD: ${data.indicators.macd}
Bollinger Bands: ${data.indicators.bollingerBands}
Volatility: ${data.indicators.volatility}
24h Volume: ${data.indicators.volume24h}

PREDICTIONS:
H1: ${data.predictions.h1.direction} (Confidence: ${data.predictions.h1.confidence}%, Target: ${data.predictions.h1.target})
H4: ${data.predictions.h4.direction} (Confidence: ${data.predictions.h4.confidence}%, Target: ${data.predictions.h4.target})

TRADING LEVELS (SCALP):
XAU/USD: Entry ${data.levels.xau.entry}, SL ${data.levels.xau.sl}, TP ${data.levels.xau.tp}
BTC/USD: Entry ${data.levels.btc.entry}, SL ${data.levels.btc.sl}, TP ${data.levels.btc.tp}

NEWS SUMMARY:
${data.newsSentiment.summary}

------------------------------------------
Disclaimer: Trading involves high risk. This report is for informational purposes only.
    `;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Market_Report_${selectedPair.replace('/', '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Laporan berhasil diunduh.', {
      style: { background: '#0A0A0A', color: '#fff', border: '1px solid #22C55E' }
    });
  };

  useEffect(() => {
    // Add a small random delay to prevent simultaneous calls from multiple tabs
    const delay = Math.floor(Math.random() * 5000);
    const timeout = setTimeout(() => {
      generateAnalysis();
    }, delay);
    return () => clearTimeout(timeout);
  }, [selectedPair, generateAnalysis]);

  // Auto-refresh Analysis every 5 minutes as requested
  useEffect(() => {
    const timer = setInterval(() => {
      setNextRefreshIn((prev) => {
        if (prev <= 1) {
          if (document.visibilityState === 'visible') {
            console.log('Auto-refreshing Terminal analysis...');
            generateAnalysis(0, true);
          }
          return 900;
        }
        return prev - 1;
      });
    }, 1000);

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setGlobalSettings(snapshot.data());
      }
    });

    return () => {
      clearInterval(timer);
      unsubscribeSettings();
    };
  }, [generateAnalysis]);

  // Reset countdown when pair changes or manual refresh
  useEffect(() => {
    setNextRefreshIn(900);
  }, [selectedPair, lastUpdated]);

  // Signal Monitor: Auto-refresh when TP or SL is hit
  useEffect(() => {
    if (!data || loading || isFallback) return;
    
    // Cooldown 30 seconds to prevent rapid refreshes
    if (Date.now() - lastTPHitTimeRef.current < 30000) return;

    const checkTP = (pair: Pair) => {
      try {
        const currentPrice = livePrices[pair]?.price;
        if (!currentPrice || currentPrice <= 0) return false;

        const levels = pair === 'XAU/USD' ? data.levels.xau : data.levels.btc;
        
        const entry = parseFloat(String(levels.entry).replace(/,/g, ''));
        const sl = parseFloat(String(levels.sl).replace(/,/g, ''));
        const tp = parseFloat(String(levels.tp).replace(/,/g, ''));
        
        if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return false;

        const isBuy = entry > sl;
        
        // Check if TP is hit
        if (isBuy && currentPrice >= tp) return true;
        if (!isBuy && currentPrice <= tp) return true;
        
        // Check if SL is hit
        if (isBuy && currentPrice <= sl) return true;
        if (!isBuy && currentPrice >= sl) return true;
      } catch (e) {
        console.error('Error checking TP/SL hit:', e);
      }
      
      return false;
    };

    if (checkTP(selectedPair)) {
      console.log(`TP/SL Hit for ${selectedPair}! Refreshing signal...`);
      lastTPHitTimeRef.current = Date.now();
      toast.success(`Target/Stop Tercapai! Memperbarui sinyal ${selectedPair}...`, {
        icon: '🎯',
        style: { background: '#0A0A0A', color: '#fff', border: '1px solid #22C55E' }
      });
      generateAnalysis(0, true);
    }
  }, [livePrices, data, selectedPair, loading, isFallback, generateAnalysis]);

  // Sync trading inputs with AI levels
  useEffect(() => {
    if (data) {
      const pairLevels = selectedPair === 'XAU/USD' ? data.swingLevels.xau : data.swingLevels.btc;
      const levels = swingAction === 'BUY' ? pairLevels.buy : pairLevels.sell;
      
      setEntryPrice(levels.entry || '');
      
      // Auto-sync SL TP Tracker as well for "Active Order" feel
      setLogEntry(levels.entry || '');
      setLogSL(levels.sl || '');
      setLogTP(levels.tp || '');
      
      if (!useCustomSwing) {
        setSwingStopLoss(String(parseFloat(String(levels.sl).replace(/,/g, '')) || ''));
        setSwingTakeProfit(String(parseFloat(String(levels.tp).replace(/,/g, '')) || ''));
        setSwingTakeProfit2(String(parseFloat(String(levels.tp2).replace(/,/g, '')) || ''));
        setSwingTakeProfit3(String(parseFloat(String(levels.tp3).replace(/,/g, '')) || ''));
      }
    }
  }, [data, selectedPair, swingAction, useCustomSwing]);

  return (
    <div className="space-y-4 pb-12 font-sans min-h-screen text-white p-4">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col">
        </div>
      </div>

      {/* Pair & Timeframe Selectors */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 relative">
          <button 
            onClick={() => setShowPairDropdown(!showPairDropdown)}
            className="flex items-center gap-2 bg-[#1A1A1A] border border-indigo-500/30 px-4 py-2 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.8)] border border-indigo-400/50 hover:bg-[#2A2A2A] transition-colors"
          >
            <span className="text-sm font-black text-white tracking-tighter">
              {selectedPair === 'XAU/USD' ? 'XAUUSD' : 'BTCUSD'}
            </span>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <span className="text-[10px] font-bold text-white/40 uppercase">
              {selectedPair === 'XAU/USD' ? 'GOLD' : 'BITCOIN'}
            </span>
            <ArrowDownRight size={14} className="text-white/40 ml-1" />
          </button>

          {showPairDropdown && (
            <div className="absolute top-full left-0 mt-2 w-48 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
              <button 
                onClick={() => { setSelectedPair('XAU/USD'); setShowPairDropdown(false); }}
                className={`flex items-center gap-2 px-4 py-3 hover:bg-white/5 transition-colors ${selectedPair === 'XAU/USD' ? 'bg-white/5' : ''}`}
              >
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-sm font-black text-white tracking-tighter">XAUUSD</span>
                <span className="text-[10px] font-bold text-white/40 uppercase ml-auto">GOLD</span>
              </button>
              <div className="h-px w-full bg-white/5" />
              <button 
                onClick={() => { setSelectedPair('BTC/USD'); setShowPairDropdown(false); }}
                className={`flex items-center gap-2 px-4 py-3 hover:bg-white/5 transition-colors ${selectedPair === 'BTC/USD' ? 'bg-white/5' : ''}`}
              >
                <div className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-sm font-black text-white tracking-tighter">BTCUSD</span>
                <span className="text-[10px] font-bold text-white/40 uppercase ml-auto">BITCOIN</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 overflow-x-auto pb-2 no-scrollbar">
          {(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as string[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf.replace('M', 'M').replace('H', 'H') as Timeframe)}
              className={`text-[11px] font-black tracking-widest transition-all px-3 py-1.5 rounded-lg ${
                selectedTimeframe === tf.replace('M', 'M').replace('H', 'H')
                  ? 'bg-indigo-400/20 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] border border-indigo-400/40 shadow-[0_0_15px_rgba(129,140,248,0.4)] shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Top Section: Chart */}
        <div className="space-y-4">
          {/* Scalping Monitor (Above Chart) */}
          {(selectedTimeframe === '1M' || selectedTimeframe === '5M') && (
            <div className="w-full h-24 bg-[#0A0A0A] border border-white/10 rounded-2xl p-3 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping" />
                  <span className="text-[8px] font-black text-white/60 uppercase tracking-widest">Live Scalp Monitor</span>
                </div>
                <span className="text-xs font-mono font-black text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">
                  {livePrices[selectedPair].price.toFixed(selectedPair === 'XAU/USD' ? 2 : 1)}
                </span>
              </div>
              <div className="h-12 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={tape.slice().reverse()}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <YAxis domain={['auto', 'auto']} hide={true} />
                    <Area type="monotone" dataKey="price" stroke="#22c55e" fillOpacity={1} fill="url(#colorPrice)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="h-[450px] w-full bg-[#0A0A0A]/40 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden relative group shadow-2xl">
            <TradingViewWidget symbol={selectedPair} timeframe={selectedTimeframe} />
          </div>

          {/* RSI Divergence Indicator (Below Chart) */}
          <div className="w-full bg-[#0A0A0A] border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)]" />
              <span className="text-[10px] font-bold text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)] uppercase tracking-widest">Multi-Timeframe RSI Divergence</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(data?.indicators?.rsiDivergence ? [
                { tf: 'M5', val: data.indicators.rsiDivergence.m5 },
                { tf: 'M15', val: data.indicators.rsiDivergence.m15 },
                { tf: 'M30', val: data.indicators.rsiDivergence.m30 },
                { tf: 'H1', val: data.indicators.rsiDivergence.h1 },
                { tf: 'H4', val: data.indicators.rsiDivergence.h4 },
                { tf: 'D1', val: data.indicators.rsiDivergence.d1 },
              ] : [
                { tf: 'M5', val: 'NONE' },
                { tf: 'M15', val: 'NONE' },
                { tf: 'M30', val: 'NONE' },
                { tf: 'H1', val: 'NONE' },
                { tf: 'H4', val: 'NONE' },
                { tf: 'D1', val: 'NONE' },
              ]).map((item, idx) => (
                <div key={idx} className={`p-2 rounded-xl flex flex-col items-center justify-center text-center border transition-all ${
                  item.val === 'BULLISH' 
                    ? 'bg-indigo-400/10 border-indigo-400/30 shadow-[0_0_10px_rgba(129,140,248,0.2)]' 
                    : item.val === 'BEARISH'
                      ? 'bg-purple-500/10 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                      : 'bg-white/5 border-white/10'
                }`}>
                  <span className="text-[9px] text-white/50 font-bold uppercase tracking-widest mb-1">{item.tf}</span>
                  <span className={`text-[8px] font-black uppercase tracking-wider ${
                    item.val === 'BULLISH' ? 'text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]' :
                    item.val === 'BEARISH' ? 'text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' :
                    'text-white/20'
                  }`}>
                    {item.val === 'NONE' ? '-' : item.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Trading */}
        <div className="space-y-6">
          {/* Cara Kerja & Mode Trade Section */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4 relative overflow-hidden">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -mr-16 -mt-16 rounded-full pointer-events-none" />
            
            <div className="flex items-center justify-between border-b border-white/5 pb-2 relative z-10">
              <h3 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest flex items-center gap-2">
                <Info size={14} className="animate-pulse" />
                Cara Kerja & Mode Trading
              </h3>
            </div>

            <div className="space-y-3 relative z-10">
              <div className="grid grid-cols-1 gap-2">
                <div className="p-3 bg-white/5 border border-white/5 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-blue-400">
                    <Clock size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Swing Trading</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-white/40">H1 Timeframe</span>
                      <span className="text-white/80 font-bold">Swing Mingguan</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-white/40">H4 Timeframe</span>
                      <span className="text-white/80 font-bold">Swing Bulanan</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white/5 border border-white/5 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-violet-400">
                    <Activity size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Day Trading</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-white/40">M30 / M15</span>
                      <span className="text-white/80 font-bold">Intraday Trade</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white/5 border border-white/5 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-purple-400">
                    <Zap size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Scalping</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-white/40">M5 / M1</span>
                      <span className="text-white/80 font-bold">Fast Scalping 🔥</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <p className="text-[9px] text-blue-200/70 leading-relaxed italic">
                  "Gunakan timeframe sesuai dengan gaya trading Anda. Ninz AI akan menyesuaikan level kalkulasi berdasarkan volatilitas market saat ini."
                </p>
              </div>
            </div>
          </div>

          {/* Trading Signal Section */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 space-y-6 relative overflow-hidden shadow-2xl">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-[100px] -mr-24 -mt-24 rounded-full pointer-events-none" />
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/5 pb-3 relative z-10 gap-3">
              <div className="flex items-center justify-between w-full md:w-auto">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                    <Sparkles size={18} className="text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)] animate-pulse" />
                  </div>
                  <h3 className="text-sm font-black text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)] uppercase tracking-[0.4em] flex flex-col">
                    <span>SIGNAL</span>
                  </h3>
                </div>
                {/* Mobile Tab */}
                <div className="flex md:hidden bg-white/5 p-1 rounded-xl border border-white/10">
                  {(['XAU', 'BTC'] as const).map((pair) => (
                    <button 
                      key={pair}
                      onClick={() => setSignalTab(pair)}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${
                        signalTab === pair 
                          ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.8)] border border-indigo-400/50' 
                          : 'text-white/30 hover:text-white/60'
                      }`}
                    >
                      {pair}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
                <button 
                  onClick={() => generateAnalysis(0, true)}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-3 py-1.5 md:py-1 bg-indigo-500/10 rounded-xl md:rounded-full border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)] flex-1 md:flex-none whitespace-nowrap"
                >
                  <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                  <span className="text-[9px] md:text-[8px] font-black uppercase tracking-widest">AUTO SIGNAL</span>
                </button>
                <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-indigo-400/10 rounded-full border border-indigo-400/20 shadow-[0_0_15px_rgba(129,140,248,0.4)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  <span className="text-[8px] font-black text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] uppercase tracking-widest">REAL-TIME AI</span>
                </div>
                {/* Desktop Tab */}
                <div className="hidden md:flex bg-white/5 p-1 rounded-xl border border-white/10">
                  {(['XAU', 'BTC'] as const).map((pair) => (
                    <button 
                      key={pair}
                      onClick={() => setSignalTab(pair)}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest ${
                        signalTab === pair 
                          ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.8)] border border-indigo-400/50' 
                          : 'text-white/30 hover:text-white/60'
                      }`}
                    >
                      {pair}
                    </button>
                  ))}
                </div>
                <span className={`text-[8px] sm:text-[9px] px-2 sm:px-3 py-1.5 rounded-xl border font-black uppercase tracking-[0.1em] text-center flex-1 md:flex-none ${
                  data?.predictions?.h1?.direction === 'UP' ? 'bg-indigo-400/10 border-indigo-400/30 shadow-[0_0_15px_rgba(129,140,248,0.4)] text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]' : 
                  data?.predictions?.h1?.direction === 'DOWN' ? 'bg-purple-500/10 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.4)] text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 
                  'bg-white/5 border-white/10 text-white/30'
                }`}>
                  {data?.predictions?.h1?.direction === 'UP' ? 'BULLISH' : data?.predictions?.h1?.direction === 'DOWN' ? 'BEARISH' : 'NEUTRAL'}
                </span>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-6 relative z-10">
              {/* Vertical Timeframe - Left Side as in image */}
              <div className="flex flex-col gap-2 bg-[#141414] p-1.5 rounded-2xl border border-white/5 min-w-[40px] sm:min-w-[50px] items-center justify-between">
                {(['1M', '5M', '15M', '30M', '1H', '4H'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`w-full aspect-square flex items-center justify-center rounded-xl text-[9px] sm:text-[10px] font-black transition-all ${
                      selectedTimeframe === tf 
                        ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.8)] border border-indigo-400/50' 
                        : 'text-white/20 hover:text-white/40 hover:bg-white/5'
                    }`}
                  >
                    {tf.toLowerCase()}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-0 space-y-4">
                {loading ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-16 bg-white/5 rounded-2xl"></div>
                    <div className="h-16 bg-white/5 rounded-2xl"></div>
                    <div className="h-32 bg-white/5 rounded-2xl"></div>
                  </div>
                ) : data ? (
                  <div className="space-y-4">
                    {(() => {
                      const price = livePrices[selectedPair].price;
                      const pairKey = selectedPair === 'XAU/USD' ? 'xau' : 'btc';
                      const resistance = parseFloat(String(data.levels[pairKey].resistance).replace(/,/g, ''));
                      const support = parseFloat(String(data.levels[pairKey].support).replace(/,/g, ''));
                      const isNearResistance = Math.abs(price - resistance) / price < 0.0015; 
                      const isNearSupport = Math.abs(price - support) / price < 0.0015;
                      
                      if (!isNearResistance && !isNearSupport) return null;
                      
                      return (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4 shadow-[0_0_15px_rgba(168,85,247,0.2)] mb-4"
                        >
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="text-purple-400 mt-1 flex-shrink-0 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)] animate-pulse" size={18} />
                            <div>
                              <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]">
                                Peringatan Zona Kritis
                              </h4>
                              <p className="text-xs text-purple-200/80 leading-relaxed font-medium">
                                {isNearResistance 
                                  ? `Harga masuk ke zona RESISTANCE psikologis di kisaran ${data.levels[pairKey].resistance}. Sorotan: Bersiap untuk potensi REVERSAL (pembalikan arah) ke bawah atau BREAKOUT jika momentum kuat.` 
                                  : `Harga masuk ke zona SUPPORT signifikan di kisaran ${data.levels[pairKey].support}. Sorotan: Waspadai potensi REVERSAL (pantulan kembali) ke atas atau BREAKDOWN jika tekanan jual berlanjut.`}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })()}

                    {/* Titik Entry Card */}
                    <motion.div 
                      whileHover={{ scale: 1.02 }}
                      className="p-3 sm:p-4 bg-[#111111] border border-white/5 rounded-2xl flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/10 group-hover:border-indigo-500/30 transition-all">
                          <Target size={20} className="text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)] sm:w-6 sm:h-6" />
                        </div>
                        <div>
                          <p className="text-[8px] sm:text-[9px] text-white/30 uppercase font-bold tracking-[0.2em] mb-0.5 sm:mb-1">Titik Entry</p>
                          <p className="text-xl sm:text-2xl font-black text-white tracking-tighter">
                            {signalTab === 'XAU' ? data.levels.xau.entry : data.levels.btc.entry}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] sm:text-[9px] text-white/20 uppercase font-black tracking-widest">PIVOT</p>
                        <p className="text-xs sm:text-sm font-bold text-white/50">{signalTab === 'XAU' ? data.levels.xau.pivot : data.levels.btc.pivot}</p>
                      </div>
                    </motion.div>

                    {/* Stop Loss Card */}
                    <motion.div 
                      whileHover={{ scale: 1.02 }}
                      className="p-3 sm:p-4 bg-purple-500/5 border border-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.4)] rounded-2xl flex items-center gap-3 sm:gap-4 group cursor-pointer"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.4)] flex-shrink-0">
                        <TrendingDown size={20} className="text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)] sm:w-6 sm:h-6" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-[8px] sm:text-[9px] text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]/50 uppercase font-bold tracking-[0.2em] mb-0.5 sm:mb-1 truncate">Batasi Kerugian (SL)</p>
                        <p className="text-xl sm:text-2xl font-black text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)] tracking-tighter">
                          {signalTab === 'XAU' ? data.levels.xau.sl : data.levels.btc.sl}
                        </p>
                      </div>
                    </motion.div>

                    {/* Take Profits Card */}
                    <motion.div 
                      whileHover={{ scale: 1.01 }}
                      className="p-3 sm:p-4 bg-indigo-400/5 border border-indigo-400/10 shadow-[0_0_15px_rgba(129,140,248,0.4)] rounded-3xl space-y-3 sm:space-y-4"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-400/10 rounded-2xl flex items-center justify-center border border-indigo-400/20 shadow-[0_0_15px_rgba(129,140,248,0.4)] flex-shrink-0">
                          <TrendingUp size={20} className="text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] sm:w-6 sm:h-6" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[8px] sm:text-[9px] text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]/50 uppercase font-bold tracking-[0.1em] sm:tracking-[0.2em] truncate">Target Keuntungan (TP)</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        {[
                          { label: 'TP 1', value: signalTab === 'XAU' ? data.levels.xau.tp : data.levels.btc.tp },
                          { label: 'TP 2', value: signalTab === 'XAU' ? data.levels.xau.tp2 : data.levels.btc.tp2 },
                          { label: 'TP 3', value: signalTab === 'XAU' ? data.levels.xau.tp3 : data.levels.btc.tp3 }
                        ].map((tp, i) => (
                          <div key={i} className="bg-white/5 p-2 sm:p-3 rounded-2xl border border-white/5 text-center group hover:bg-indigo-400/10 transition-all cursor-pointer">
                            <p className="text-[6px] sm:text-[7px] text-white/20 uppercase font-black mb-1 sm:mb-1.5 tracking-widest">{tp.label}</p>
                            <p className="text-[10px] sm:text-xs font-black text-indigo-300 tracking-tighter group-hover:scale-110 transition-transform truncate">
                              {tp.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                    
                    {/* Live Sync Status */}
                    <div className="pt-2 flex items-center justify-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                       <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em]">Market Real-Time Feed</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center space-y-4 bg-white/5 rounded-3xl border border-dashed border-white/10">
                    <div className="flex justify-center">
                      <RefreshCw size={24} className="text-white/10 animate-spin" />
                    </div>
                    <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em]">Sinkronisasi Pasar...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <h3 className="text-[10px] font-bold text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)] uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
              <ShieldCheck size={14} />
              Panduan Disiplin & Manajemen Risiko
            </h3>
            
            <div className="space-y-4">
              {/* Prompts Section */}
              <div className="grid grid-cols-1 gap-3">
                {[
                  {
                    title: "Prompt 1 (Dasar – Disiplin Risiko)",
                    text: "“Ajarkan saya strategi trading yang fokus pada manajemen risiko, dengan aturan maksimal risiko 1–2% per transaksi. Jelaskan kenapa penggunaan full margin berbahaya dan bagaimana menghindarinya dalam kondisi pasar apa pun.”"
                  },
                  {
                    title: "Prompt 2 (Mindset & Psikologi)",
                    text: "“Bimbing saya untuk memiliki mindset trader profesional yang tidak serakah, tidak FOMO, dan tidak menggunakan full margin. Berikan contoh kesalahan umum trader pemula dan cara menghindarinya.”"
                  },
                  {
                    title: "Prompt 3 (Praktikal & Sistem Trading)",
                    text: "“Buatkan sistem trading sederhana dengan aturan jelas: entry, stop loss, take profit, dan batas maksimal penggunaan margin. Pastikan sistem ini aman dari risiko overtrading dan full margin.”"
                  },
                  {
                    title: "Prompt 4 (Simulasi Kerugian)",
                    text: "“Simulasikan apa yang terjadi jika saya menggunakan full margin dalam trading, termasuk risiko margin call dan kerugian cepat. Bandingkan dengan strategi risk management yang sehat.”"
                  },
                  {
                    title: "Prompt 5 (Checklist Sebelum Entry)",
                    text: "“Buatkan checklist sebelum entry trading yang memastikan saya tidak menggunakan full margin, termasuk konfirmasi setup, risk-reward ratio, and ukuran lot yang aman.”"
                  },
                  {
                    title: "Prompt 6 (Pengingat Harian)",
                    text: "“Berikan saya pengingat harian sebagai trader untuk selalu menjaga manajemen risiko, menghindari overleverage, dan tetap disiplin meskipun sedang profit atau loss.”"
                  }
                ].map((p, i) => (
                  <div key={i} className="p-3 bg-white/5 border border-white/10 rounded-lg group hover:border-indigo-500/30 transition-all">
                    <h4 className="text-[9px] font-black text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)] uppercase mb-1 flex items-center gap-2">
                      <div className="w-1 h-1 bg-indigo-500 rounded-full" />
                      {p.title}
                    </h4>
                    <p className="text-[10px] text-white/70 leading-relaxed italic">
                      {p.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Tips Section */}
              <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)] mb-1">
                  <Zap size={14} />
                  <h4 className="text-[10px] font-black uppercase tracking-widest">💡 Tips Penting</h4>
                </div>
                <ul className="space-y-2">
                  {[
                    "Jangan pernah pakai 100% margin",
                    "Gunakan maksimal 10–30% dari margin",
                    "Risiko per trade: 1–2% dari balance",
                    "Selalu pakai stop loss",
                    "Hindari revenge trading & FOMO"
                  ].map((tip, i) => (
                    <li key={i} className="flex items-center gap-2 text-[10px] text-white/80">
                      <div className="w-1 h-1 bg-indigo-500 rounded-full" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-[10px] font-bold text-violet-500 uppercase tracking-widest flex items-center gap-2">
                <Globe size={14} />
                Kalender Ekonomi
              </h3>
              <select 
                value={impactFilter}
                onChange={(e) => setImpactFilter(e.target.value as any)}
                className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[8px] font-bold text-white/60 uppercase tracking-widest focus:outline-none focus:border-violet-500/50 transition-colors cursor-pointer"
              >
                <option value="ALL">SEMUA IMPACT</option>
                <option value="HIGH">HIGH IMPACT</option>
                <option value="MEDIUM">MEDIUM IMPACT</option>
                <option value="LOW">LOW IMPACT</option>
              </select>
            </div>
            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-10 bg-white/5 rounded"></div>
                <div className="h-10 bg-white/5 rounded"></div>
                <div className="h-10 bg-white/5 rounded"></div>
              </div>
            ) : data ? (
              <div className="space-y-2">
                {filteredCalendar.map((event, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-white/5 border border-white/10 rounded group hover:border-violet-500/30 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-violet-500">{event.time}</span>
                        <span className="text-[8px] px-1 bg-white/10 text-white/60 rounded font-bold">{event.currency}</span>
                      </div>
                      <span className="text-[10px] text-white font-medium line-clamp-1">{event.event}</span>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      event.impact === 'HIGH' ? 'bg-purple-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                      event.impact === 'MEDIUM' ? 'bg-violet-500' : 'bg-blue-500'
                    }`} title={`Dampak ${event.impact}`} />
                  </div>
                ))}
                {filteredCalendar.length === 0 && (
                  <p className="text-[9px] text-white/20 italic text-center py-4">
                    {impactFilter === 'ALL' ? 'Tidak ada acara yang dijadwalkan' : `Tidak ada acara berdampak ${impactFilter} yang dijadwalkan`}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-[10px] text-white/20">Tidak ada data kalender</p>
              </div>
            )}
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-bold text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)] uppercase tracking-widest flex items-center gap-2">
                  <BarChart2 size={14} />
                  Pelacak SL TP
                </h3>
                <span className="text-[7px] px-1 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30 font-bold animate-pulse">LIVE SYNC</span>
              </div>
              {data && (
                <button 
                  onClick={() => {
                    const pairLevels = selectedPair === 'XAU/USD' ? data.swingLevels.xau : data.swingLevels.btc;
                    const levels = logAction === 'BUY' ? pairLevels.buy : pairLevels.sell;
                    setLogEntry(levels.entry || '');
                    setLogSL(levels.sl || '');
                    setLogTP(levels.tp || '');
                  }}
                  className="text-[8px] text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]/60 hover:text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)] font-bold uppercase tracking-widest transition-colors"
                >
                  Gunakan Level Sistem
                </button>
              )}
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Aksi</label>
                  <select 
                    value={logAction}
                    onChange={(e) => setLogAction(e.target.value as 'BUY' | 'SELL')}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Entry</label>
                  <input 
                    type="text" 
                    placeholder="Entry Price"
                    value={logEntry}
                    onChange={(e) => setLogEntry(e.target.value)}
                    onBlur={(e) => setLogEntry(String(parseFloat(String(e.target.value).replace(/,/g, '')) || ''))}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest text-purple-400">Batasi Kerugian (SL)</label>
                  <input 
                    type="text" 
                    placeholder="Harga SL"
                    value={logSL}
                    onChange={(e) => setLogSL(e.target.value)}
                    onBlur={(e) => setLogSL(String(parseFloat(String(e.target.value).replace(/,/g, '')) || ''))}
                    className="w-full bg-white/5 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.4)] rounded px-2 py-1.5 text-xs font-bold text-purple-400 focus:outline-none focus:border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest text-indigo-300">Target Keuntungan (TP)</label>
                  <input 
                    type="text" 
                    placeholder="Harga TP"
                    value={logTP}
                    onChange={(e) => setLogTP(e.target.value)}
                    onBlur={(e) => setLogTP(String(parseFloat(String(e.target.value).replace(/,/g, '')) || ''))}
                    className="w-full bg-white/5 border border-indigo-400/20 shadow-[0_0_15px_rgba(129,140,248,0.4)] rounded px-2 py-1.5 text-xs font-bold text-indigo-300 focus:outline-none focus:border-indigo-400/50 shadow-[0_0_15px_rgba(129,140,248,0.4)] transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Hasil (Profit/Loss $)</label>
                <input 
                  type="text" 
                  placeholder="misal: 50 atau -20"
                  value={logResult}
                  onChange={(e) => setLogResult(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              <button
                onClick={handleLogTrade}
                disabled={isLogging}
                className="w-full bg-white hover:bg-gray-200 disabled:opacity-50 text-black font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-white/20 flex items-center justify-center gap-2"
              >
                {isLogging ? <RefreshCw className="animate-spin" size={14} /> : <BarChart2 size={14} />}
                Catat ke Performa
              </button>
            </div>
          </div>

          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)] uppercase tracking-widest">Informasi Analisis</span>
            </div>
            <p className="text-[9px] text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]/60 leading-tight italic">
              Analisis disediakan oleh Ninz AI. Semua timestamp adalah UTC. Analisis pasar diperbarui secara berkala.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
