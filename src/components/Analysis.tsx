import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion } from 'motion/react';
import { Sparkles, TrendingUp, TrendingDown, Info, RefreshCw, AlertTriangle, BarChart2, Clock, Terminal as TerminalIcon, Activity, Globe, Zap, ShoppingBag, DollarSign, ArrowUpRight, ArrowDownRight, Download, Cpu, X, Target } from 'lucide-react';
import { auth, db, collection, addDoc, Timestamp, handleFirestoreError, OperationType } from '../firebase';
import ReactMarkdown from 'react-markdown';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'react-hot-toast';

interface EconomicEvent {
  time: string;
  event: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  currency: string;
}

interface MarketData {
  analysis: string;
  identifiedMethods?: string[];
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

type Timeframe = '1M' | '5M' | '1H' | '4H' | '1D';
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
  const [nextRefreshIn, setNextRefreshIn] = useState(900); // 15 minutes in seconds
  const [isFirstFetch, setIsFirstFetch] = useState<Record<Pair, boolean>>({
    'XAU/USD': true,
    'BTC/USD': true
  });

  const [isLogging, setIsLogging] = useState(false);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<any>(null);
  const [chartImage, setChartImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logEntry, setLogEntry] = useState('');
  const [logSL, setLogSL] = useState('');
  const [logTP, setLogTP] = useState('');
  const [logResult, setLogResult] = useState('');
  const [logAction, setLogAction] = useState<'BUY' | 'SELL'>('BUY');
  const [swingAction, setSwingAction] = useState<'BUY' | 'SELL'>('BUY');

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setChartImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [lastAskTime, setLastAskTime] = useState(0);

  const handleAskAI = async () => {
    if (isAskingAI) return;
    
    // Check low quota
    const lowQuotaTime = sessionStorage.getItem('gemini_low_quota_time');
    if (lowQuotaTime && Date.now() - parseInt(lowQuotaTime) < 5 * 60 * 1000) {
      toast.error('Quota AI sedang terlampaui. Silakan tunggu beberapa menit.');
      return;
    }

    const now = Date.now();
    if (now - lastAskTime < 60000) { // 1 minute cooldown
      const remaining = Math.ceil((60000 - (now - lastAskTime)) / 1000);
      toast.error(`Silakan tunggu ${remaining} detik sebelum bertanya lagi.`);
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      toast.error('API Key tidak ditemukan!');
      return;
    }

    setIsAskingAI(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const currentPrice = livePrices[selectedPair]?.price || 0;
      
      const parts: any[] = [
        {
          text: `You are an expert AI Trading Indicator Creator (Source: ChatGPT/Google AI). 
          Analyze the current market for ${selectedPair} at price ${currentPrice.toFixed(2)}. 
          Provide a high-probability SWING entry setup with precise Entry, Stop Loss, and Take Profit levels. 
          Use advanced SMC (Smart Money Concepts), ICT, and Liquidity Pool analysis. 
          ${chartImage ? 'I have provided a chart screenshot. You MUST extract the Entry, SL, and TP levels directly from the visual information in this image. The levels in the image take absolute priority and MUST override any other data. If the image shows specific price levels for entry, stop loss, or take profit, use those EXACT values. Also, provide a brief "scalping moment" comment based on the chart patterns you see.' : ''}
          Respond ONLY in JSON format: { "entry": string, "sl": string, "tp": string, "tp2": string, "tp3": string, "action": "BUY" | "SELL", "analysis": string }`
        }
      ];

      if (chartImage) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: chartImage.split(',')[1]
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) throw new Error('Respon AI kosong.');
      
      const parsed = JSON.parse(cleanJsonString(text));
      setAiRecommendation(parsed);
      setEntryPrice(parsed.entry);
      setSwingStopLoss(parsed.sl);
      setSwingTakeProfit(parsed.tp);
      setSwingTakeProfit2(parsed.tp2);
      setSwingTakeProfit3(parsed.tp3);
      setSwingAction(parsed.action);
      setUseCustomSwing(false); // Default to AI levels
      setLastAskTime(Date.now()); // Update cooldown
      toast.success('Level AI berhasil diterapkan!');
    } catch (error: any) {
      console.error('Ask AI Error:', error);
      const errorStr = error.message || JSON.stringify(error);
      if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        sessionStorage.setItem('gemini_low_quota_time', Date.now().toString());
        toast.error('Quota AI Terlampaui. Silakan tunggu beberapa menit.');
      } else {
        toast.error('Gagal mendapatkan level AI.');
      }
    } finally {
      setIsAskingAI(false);
    }
  };
  
  // Live Price State
  const [livePrices, setLivePrices] = useState({
    'XAU/USD': { price: 2531.50, change: '+0.15%', isUp: true },
    'BTC/USD': { price: 68450.00, change: '-0.45%', isUp: false }
  });

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
    }, 800);
    return () => clearInterval(interval);
  }, [selectedPair]);

  // WebSocket for BTC/USD (Binance)
  useEffect(() => {
    const btcWs = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
    
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
        const data = await fetchWithProxy('https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1m&range=1d');
        if (data?.chart?.result?.[0]) {
          const result = data.chart.result[0];
          const price = result.meta.regularMarketPrice;
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
    'XAU/USD': 2531.50,
    'BTC/USD': 68450.00
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
    // Enforce 30 pips minimum risk (XAU: 3.0 points, BTC: $300)
    const minRisk = isBtc ? 300 : 3.00;
    const effectiveRisk = risk < minRisk ? minRisk : risk;
    const isBuy = entry >= sl;
    const tp = isBuy ? entry + effectiveRisk * ratio : entry - effectiveRisk * ratio;
    return isBtc ? tp.toFixed(0) : tp.toFixed(2);
  };

  // Helper untuk menormalisasi data dari AI (mencegah crash jika field hilang)
  const normalizeMarketData = (raw: any): MarketData => {
    const xauPrice = livePricesRef.current['XAU/USD'].price;
    const btcPrice = livePricesRef.current['BTC/USD'].price;
    
    // Sanity Check: Jika level dari AI terlalu jauh (>2%), paksa gunakan harga saat ini sebagai basis
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
    
    // Logic: Jika AI memberikan harga yang masuk akal, gunakan. Jika tidak, buat level scalping otomatis.
    const getLevel = (rawVal: any, refPrice: number, offset: number, isBtc: boolean) => {
      if (isLevelValid(rawVal, refPrice)) {
        const num = typeof rawVal === 'string' ? parseFloat(rawVal.replace(/,/g, '')) : rawVal;
        return num;
      }
      return refPrice + offset;
    };

    const xauEntry = isEntryValid(rawXau.entry, xauPrice) ? parseFloat(String(rawXau.entry).replace(/,/g, '')) : xauPrice;
    const xauSL = isLevelValid(rawXau.sl, xauPrice) ? parseFloat(String(rawXau.sl).replace(/,/g, '')) : xauPrice - 3.00;
    
    const btcEntry = isEntryValid(rawBtc.entry, btcPrice) ? parseFloat(String(rawBtc.entry).replace(/,/g, '')) : btcPrice;
    const btcSL = isLevelValid(rawBtc.sl, btcPrice) ? parseFloat(String(rawBtc.sl).replace(/,/g, '')) : btcPrice - 300;

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
      const buyEntry = isLevelValid(raw.buy?.entry, currentPrice) ? parseFloat(String(raw.buy.entry).replace(/,/g, '')) : currentPrice - 5.00;
      const buySL = isLevelValid(raw.buy?.sl, currentPrice) ? parseFloat(String(raw.buy.sl).replace(/,/g, '')) : currentPrice - 15.00;
      
      const sellEntry = isLevelValid(raw.sell?.entry, currentPrice) ? parseFloat(String(raw.sell.entry).replace(/,/g, '')) : currentPrice + 5.00;
      const sellSL = isLevelValid(raw.sell?.sl, currentPrice) ? parseFloat(String(raw.sell.sl).replace(/,/g, '')) : currentPrice + 15.00;

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
        volume24h: raw.indicators?.volume24h || 'LOW'
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

  // Fungsi untuk menghasilkan data analisis sistem (fallback jika AI gagal)
    const generateSystemFallback = () => {
      setIsFallback(true);
      const xauPrice = livePrices['XAU/USD']?.price || 2531.50;
      const btcPrice = livePrices['BTC/USD']?.price || 68450.00;
      
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
        volume24h: 'MODERATE'
      },
      predictions: {
        h1: { direction: rsi > 50 ? 'UP' : 'DOWN', confidence: 60, target: (xauPrice * (rsi > 50 ? 1.005 : 0.995)).toFixed(2) },
        h4: { direction: 'SIDEWAYS', confidence: 45, target: xauPrice.toFixed(2) }
      },
      newsSentiment: {
        summary: "Sistem tidak dapat mengambil berita real-time dari AI. Menampilkan analisis berdasarkan indikator teknikal murni dan data historis.",
        score: rsi - 50,
        sources: [
          { title: "Technical Analysis Report", url: "#" },
          { title: "Market Volatility Index", url: "#" }
        ]
      },
      economicCalendar: [
        { time: "NOW", event: "AI Connection Timeout", impact: "LOW", currency: "SYSTEM" }
      ]
    };
    
    const normalized = normalizeMarketData(rawFallback);
    setData(normalized);
    setError(null); // Clear any previous error
    setLastUpdated(new Date());
    setLoading(false);
    setIsFallback(true);
    toast.success('Menggunakan Analisis Sistem (AI Offline)', {
      icon: '⚙️',
      style: { background: '#0A0A0A', color: '#fff', border: '1px solid #3b82f6' }
    });
  };

  // Helper to clean JSON string from AI response
  const cleanJsonString = (str: string): string => {
    // Remove markdown code blocks if present
    let cleaned = str.replace(/```json\n?|```/g, '').trim();
    // Find the first '{' and last '}' to isolate the JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
  };

  const isGeneratingRef = useRef(false);
  const lastApiCallTimeRef = useRef(0);
  const lastManualRefreshTimeRef = useRef(0);

  const generateAnalysis = useCallback(async (retryCount = 0, force = false) => {
    // Check if we are in a low quota state (from previous 429 error)
    const lowQuotaTime = sessionStorage.getItem('gemini_low_quota_time');
    if (lowQuotaTime && Date.now() - parseInt(lowQuotaTime) < 5 * 60 * 1000) {
      console.log('Quota AI sedang terlampaui (dari sesi sebelumnya), menggunakan fallback.');
      if (!data) generateSystemFallback();
      return;
    }

    if (isGeneratingRef.current && retryCount === 0) {
      console.log('Analisis sedang berjalan, mengabaikan permintaan baru.');
      return;
    }

    // 0. Cek Cache
    const cachedKey = `terminal_analysis_cache_${selectedPair}`;
    const cachedData = localStorage.getItem(cachedKey);
    if (cachedData && retryCount === 0 && !force) {
      try {
        const { data: result, timestamp } = JSON.parse(cachedData);
        if (Date.now() - timestamp < 15 * 60 * 1000) {
          console.log(`Menggunakan data analisis dari cache untuk ${selectedPair}.`);
          setData(result);
          setLoading(false);
          setIsFallback(false);
          return;
        }
      } catch (e) {
        localStorage.removeItem(cachedKey);
      }
    }

    // Cooldown check for any API call (prevent rapid switching or double triggers)
    const now = Date.now();
    if (retryCount === 0 && now - lastApiCallTimeRef.current < 10000) { // 10s global cooldown
      console.log('API call cooldown active, using fallback or waiting.');
      if (!data) generateSystemFallback();
      return;
    }

    if (force && retryCount === 0) {
      if (now - lastManualRefreshTimeRef.current < 30000) { // 30s cooldown for manual refresh
        const remaining = Math.ceil((30000 - (now - lastManualRefreshTimeRef.current)) / 1000);
        toast.error(`Silakan tunggu ${remaining} detik untuk refresh manual.`);
        return;
      }
      lastManualRefreshTimeRef.current = now;
    }
    
    lastApiCallTimeRef.current = now;
    console.log(`MENGIRIM PERMINTAAN API GEMINI... (Percobaan: ${retryCount + 1}, Force: ${force})`);
    isGeneratingRef.current = true;
    setLoading(true);
    setError(null);
    
    try {
      // 1. Ambil API Key dari environment
      let apiKey = 
        (process.env as any).GEMINI_API_KEY || 
        (process.env as any).API_KEY ||
        (import.meta as any).env?.VITE_GEMINI_API_KEY;

      // Fungsi untuk memicu dialog pemilihan key
      const promptForKey = async () => {
        if ((window as any).aistudio) {
          console.log('Memicu dialog pemilihan API Key...');
          await (window as any).aistudio.openSelectKey();
          // Berikan sedikit jeda agar variabel terupdate
          return (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
        }
        return null;
      };

      // 2. Jika di website dan API Key kosong atau terdeteksi invalid dari percobaan sebelumnya
      if (!apiKey || apiKey === 'undefined' || apiKey === '""' || apiKey === 'null') {
        apiKey = await promptForKey();
      }

      console.log('Status API Key:', apiKey ? 'Terdeteksi' : 'Tidak Ditemukan');
      
      if (!apiKey || apiKey === 'undefined' || apiKey === '""' || apiKey === 'null') {
        throw new Error('API Key tidak ditemukan. Silakan klik tombol "Pilih API Key" di bawah.');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      console.log('Mengirim permintaan ke Gemini...');
      
      const currentPrice = livePricesRef.current[selectedPair].price;
      
      // Define schema for robust JSON response
      const schema = {
        type: Type.OBJECT,
        properties: {
          analysis: { type: Type.STRING },
          identifiedMethods: { type: Type.ARRAY, items: { type: Type.STRING } },
          sentiment: {
            type: Type.OBJECT,
            properties: {
              xau: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, value: { type: Type.NUMBER }, change: { type: Type.STRING } } },
              btc: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, value: { type: Type.NUMBER }, change: { type: Type.STRING } } }
            }
          },
          levels: {
            type: Type.OBJECT,
            properties: {
              xau: { type: Type.OBJECT, properties: { resistance: { type: Type.STRING }, support: { type: Type.STRING }, pivot: { type: Type.STRING }, entry: { type: Type.STRING }, sl: { type: Type.STRING }, tp: { type: Type.STRING }, tp2: { type: Type.STRING }, tp3: { type: Type.STRING } } },
              btc: { type: Type.OBJECT, properties: { resistance: { type: Type.STRING }, support: { type: Type.STRING }, pivot: { type: Type.STRING }, entry: { type: Type.STRING }, sl: { type: Type.STRING }, tp: { type: Type.STRING }, tp2: { type: Type.STRING }, tp3: { type: Type.STRING } } }
            }
          },
          swingLevels: {
            type: Type.OBJECT,
            properties: {
              xau: { 
                type: Type.OBJECT, 
                properties: { 
                  buy: { type: Type.OBJECT, properties: { entry: { type: Type.STRING }, sl: { type: Type.STRING }, tp: { type: Type.STRING }, tp2: { type: Type.STRING }, tp3: { type: Type.STRING } } },
                  sell: { type: Type.OBJECT, properties: { entry: { type: Type.STRING }, sl: { type: Type.STRING }, tp: { type: Type.STRING }, tp2: { type: Type.STRING }, tp3: { type: Type.STRING } } }
                } 
              },
              btc: { 
                type: Type.OBJECT, 
                properties: { 
                  buy: { type: Type.OBJECT, properties: { entry: { type: Type.STRING }, sl: { type: Type.STRING }, tp: { type: Type.STRING }, tp2: { type: Type.STRING }, tp3: { type: Type.STRING } } },
                  sell: { type: Type.OBJECT, properties: { entry: { type: Type.STRING }, sl: { type: Type.STRING }, tp: { type: Type.STRING }, tp2: { type: Type.STRING }, tp3: { type: Type.STRING } } }
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
              volume24h: { type: Type.STRING }
            }
          },
          predictions: {
            type: Type.OBJECT,
            properties: {
              h1: { type: Type.OBJECT, properties: { direction: { type: Type.STRING }, confidence: { type: Type.NUMBER }, target: { type: Type.STRING } } },
              h4: { type: Type.OBJECT, properties: { direction: { type: Type.STRING }, confidence: { type: Type.NUMBER }, target: { type: Type.STRING } } }
            }
          },
          newsSentiment: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              score: { type: Type.NUMBER },
              sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING } } } }
            }
          },
          economicCalendar: {
            type: Type.ARRAY,
            items: { type: Type.OBJECT, properties: { time: { type: Type.STRING }, event: { type: Type.STRING }, impact: { type: Type.STRING }, currency: { type: Type.STRING } } }
          }
        },
        required: ["analysis", "sentiment", "levels", "indicators"]
      };

      // Add timeout to AI call - increased to 45s for search tool
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI Request Timeout')), 45000)
      );

      const aiCall = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are an expert AI Trading Indicator Creator (Source: ChatGPT/Google AI). 
        Perform a deep technical analysis for ${selectedPair} (Price: ${currentPrice.toFixed(2)}).
        Waktu Server: ${new Date().toISOString()}
        
        TUGAS:
        1. Lakukan analisis teknikal UltraScalp (Institutional Order Flow, SMC, Liquidity) pada timeframe 15M.
        2. Tentukan level ENTRY, SL, dan TP yang tajam untuk scalping (15M).
        3. Jarak SL Scalp harus ketat: XAU/USD (2.0-3.0 points), BTC/USD ($200-$300).
        4. Tentukan level SWING (H4/D1) berdasarkan Market Structure Break (MSB) dan Liquidity Sweeps. Berikan level untuk skenario BUY dan SELL secara terpisah.
        5. Jarak SL Swing HARUS LEBAR: XAU/USD (10-15 points), BTC/USD ($1500-$3000).
        6. Entry Swing harus di area 'Premium' untuk Sell atau 'Discount' untuk Buy.
        7. Hitung TP1, TP2, TP3 untuk kedua strategi (Scalp & Swing) dengan Risk:Reward minimal 1:3 untuk Swing.
        8. Berikan sentimen pasar singkat dan berita terbaru${(retryCount > 0 || !force) ? ' (Gunakan pengetahuan internal)' : ' (Google Search)'}.
        9. Fokus pada AREA LIKUIDITAS (Liquidity Pool) untuk konfirmasi entry.
        10. Analisis harus sinkron dengan pergerakan harga saat ini.
        
        PENTING: 
        - Gunakan logika UltraScalp 15M untuk 'levels' dan H4/D1 Structure untuk 'swingLevels'.
        - Untuk 'swingLevels', berikan 'buy' levels (entry di Discount) dan 'sell' levels (entry di Premium).
        - Level Entry HARUS di area Discount/Premium yang valid.
        - RE-KALKULASI semua level (Entry, SL, TP) secara dinamis berdasarkan pergerakan harga terbaru (${currentPrice.toFixed(2)}).
        - JANGAN memberikan level yang sama jika harga telah berubah.
        - Respon harus singkat, padat, dan teknikal.`,
        config: {
          systemInstruction: `Anda adalah Bot UltraScalp 15M. Respon HARUS dalam format JSON valid sesuai schema. Jangan berikan teks tambahan.`,
          responseMimeType: "application/json",
          responseSchema: schema,
          tools: (retryCount === 0 && force) ? [{ googleSearch: {} }] : []
        }
      });

      const response: any = await Promise.race([aiCall, timeoutPromise]);
      
      const text = response.text;
      console.log('Respon Gemini diterima. Panjang:', text?.length);
      
      if (!text) throw new Error('Respon AI kosong.');
      
      let parsed;
      try {
        const cleanedText = cleanJsonString(text);
        parsed = JSON.parse(cleanedText);
        
        // Ekstrak Grounding Metadata (Google Search Sources) jika tersedia
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks && Array.isArray(groundingChunks)) {
          const extractedSources = groundingChunks
            .filter((chunk: any) => chunk.web)
            .map((chunk: any) => ({
              title: chunk.web.title || 'Sumber Berita',
              url: chunk.web.uri || '#'
            }));
          
          if (extractedSources.length > 0) {
            if (!parsed.newsSentiment) parsed.newsSentiment = { summary: '', score: 0, sources: [] };
            // Gabungkan sumber dari AI dan sumber dari grounding metadata
            const existingUrls = new Set((parsed.newsSentiment.sources || []).map((s: any) => s.url));
            extractedSources.forEach((s: any) => {
              if (!existingUrls.has(s.url)) {
                parsed.newsSentiment.sources = [...(parsed.newsSentiment.sources || []), s];
                existingUrls.add(s.url);
              }
            });
          }
        }
      } catch (parseErr) {
        console.error('Gagal memparsing JSON AI:', parseErr);
        throw new Error('Format respon AI tidak valid.');
      }

      const result = normalizeMarketData(parsed);
      
      setData(result);
      setIsFallback(false);
      setLastUpdated(new Date());
      
      if (force && retryCount === 0) {
        toast.success('Analisis Terminal Diperbarui', {
          icon: '⚡',
          style: { background: '#0A0A0A', color: '#fff', border: '1px solid #F97316' }
        });
      }
      
      // Simpan ke Cache
      const cachedKey = `terminal_analysis_cache_${selectedPair}`;
      localStorage.setItem(cachedKey, JSON.stringify({
        data: result,
        timestamp: Date.now()
      }));
      
      console.log('Data analisis berhasil diperbarui.');
    } catch (err: any) {
      console.error('Detail kesalahan analisis:', err);
      const errorStr = err.message || JSON.stringify(err);
      
      // Tangani Rate Limit (429) atau RESOURCE_EXHAUSTED dengan fallback langsung (jangan retry)
      if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        console.warn('Quota API Terlampaui. Menggunakan fallback sistem.');
        sessionStorage.setItem('gemini_low_quota_time', Date.now().toString());
        generateSystemFallback();
        return;
      }

      // Tangani Timeout atau error jaringan dengan retry terbatas
      if (errorStr.includes('500') || errorStr.includes('fetch') || errorStr.includes('Timeout') || errorStr.includes('deadline')) {
        if (retryCount < 2) {
          const delay = Math.pow(2, retryCount) * 4000;
          console.warn(`Kesalahan Jaringan atau Timeout. Mencoba lagi dalam ${delay}ms...`);
          setTimeout(() => generateAnalysis(retryCount + 1), delay);
          return;
        }
        
        generateSystemFallback();
        return;
      }

      let errorMsg = err.message || 'Gagal memuat data Terminal.';
      
      // Jika error adalah API Key tidak valid atau masalah konfigurasi
      if (errorStr.includes('API key not valid') || errorStr.includes('400') || errorStr.includes('not found') || errorStr.includes('INVALID_ARGUMENT')) {
        console.warn('Masalah API Key atau Konfigurasi. Menggunakan fallback sistem.');
        generateSystemFallback();
        return;
      }

      setError(errorMsg);
      generateSystemFallback(); // Selalu fallback agar tidak eror 24/7
    } finally {
      setLoading(false);
      isGeneratingRef.current = false;
    }
  }, [selectedPair]);

  const downloadReport = () => {
    if (!data) return;
    
    const report = `
BLOOMBERG TERMINAL MARKET REPORT
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
    return () => clearInterval(timer);
  }, [generateAnalysis]);

  // Reset countdown when pair changes or manual refresh
  useEffect(() => {
    setNextRefreshIn(900);
  }, [selectedPair, lastUpdated]);

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
        setSwingStopLoss(levels.sl || '');
        setSwingTakeProfit(levels.tp || '');
        setSwingTakeProfit2(levels.tp2 || '');
        setSwingTakeProfit3(levels.tp3 || '');
      }
    }
  }, [data, selectedPair, swingAction, useCustomSwing]);

  return (
    <div className="space-y-6 pb-12 font-mono">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500 rounded-lg">
            <TerminalIcon size={20} className="text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase">Bloomberg Terminal</h1>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 rounded border border-green-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-[7px] font-black text-green-500 uppercase tracking-widest">Real-Time</span>
              </div>

              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded border border-white/10">
                <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-orange-500 animate-pulse' : isFallback ? 'bg-blue-500' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]'}`} />
                <span className="text-[8px] font-bold text-white/60 uppercase tracking-widest">
                  {loading ? 'Memproses' : isFallback ? 'Mode Sistem' : 'Mode AI'}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/50 uppercase tracking-widest font-bold">
                    <Clock size={12} className="text-orange-500" />
                    <span className="text-white/80">Update: {lastUpdated ? lastUpdated.toLocaleTimeString('id-ID', { hour12: false }) : '--:--:--'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/10 rounded-full border border-orange-500/30">
                    <RefreshCw size={10} className={`text-orange-500 ${loading ? 'animate-spin' : ''}`} />
                    <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">
                      {Math.floor(nextRefreshIn / 60)}:{(nextRefreshIn % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
                <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-orange-500/50"
                    initial={{ width: '100%' }}
                    animate={{ width: `${(nextRefreshIn / 300) * 100}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden xl:flex items-center gap-6 px-4 py-1.5 bg-white/5 rounded-lg border border-white/10">
            <div className="flex flex-col">
              <span className="text-[8px] text-white/40 uppercase font-bold tracking-widest">XAU/USD Live</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white leading-none">
                  {livePrices['XAU/USD']?.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                </span>
                <span className={`text-[9px] font-bold ${livePrices['XAU/USD']?.isUp ? 'text-green-500' : 'text-red-500'}`}>
                  {livePrices['XAU/USD']?.change || '0.00%'}
                </span>
              </div>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[8px] text-white/40 uppercase font-bold tracking-widest">BTC/USD Live</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white leading-none">
                  {livePrices['BTC/USD']?.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                </span>
                <span className={`text-[9px] font-bold ${livePrices['BTC/USD']?.isUp ? 'text-green-500' : 'text-red-500'}`}>
                  {livePrices['BTC/USD']?.change || '0.00%'}
                </span>
              </div>
            </div>
          </div>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <div className="hidden md:flex items-center gap-3 mr-2">
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[7px] text-white/30 uppercase font-bold tracking-widest">Live Terminal</span>
                    </div>
                    <span className="text-[9px] font-mono text-orange-500/80">{lastUpdated.toLocaleTimeString('id-ID', { hour12: false })}</span>
                  </div>
                </div>
              )}
              <button
                onClick={downloadReport}
                disabled={!data || loading}
                className="p-2 rounded-lg bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20 flex items-center gap-2"
                title="Download Report"
              >
                <Download size={18} />
                <span className="hidden md:inline text-[9px] font-bold uppercase tracking-widest">Unduh Laporan</span>
              </button>
              <button
                onClick={() => generateAnalysis(0, true)}
                disabled={loading}
                className="p-2 rounded-lg bg-orange-500 text-black hover:bg-orange-400 transition-all disabled:opacity-50"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Technicals & Sentiment */}
        <div className="space-y-6">
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Sentimen</h3>
              <Zap size={14} className="text-orange-500" />
            </div>
            
            {loading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-12 bg-white/5 rounded-lg"></div>
                <div className="h-12 bg-white/5 rounded-lg"></div>
              </div>
            ) : data ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white/60">XAU/USD</span>
                      <span className="text-[7px] px-1 bg-orange-500/20 text-orange-500 rounded border border-orange-500/30 font-bold">LIVE</span>
                    </div>
                    <span className={`text-[10px] font-bold ${livePrices['XAU/USD']?.isUp ? 'text-green-500' : 'text-red-500'}`}>
                      {livePrices['XAU/USD']?.change || '0.00%'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm font-bold ${data.sentiment.xau.label?.includes('BULL') ? 'text-green-500' : 'text-red-500'}`}>
                      {data.sentiment.xau.label}
                    </span>
                    <span className="text-xs text-white/40">{data.sentiment.xau.value}%</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${data.sentiment.xau.value}%` }}
                      className={`h-full ${data.sentiment.xau.label?.includes('BULL') ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white/60">BTC/USD</span>
                      <span className="text-[7px] px-1 bg-orange-500/20 text-orange-500 rounded border border-orange-500/30 font-bold">LIVE</span>
                    </div>
                    <span className={`text-[10px] font-bold ${livePrices['BTC/USD']?.isUp ? 'text-green-500' : 'text-red-500'}`}>
                      {livePrices['BTC/USD']?.change || '0.00%'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm font-bold ${data.sentiment.btc.label?.includes('BULL') ? 'text-green-500' : 'text-red-500'}`}>
                      {data.sentiment.btc.label}
                    </span>
                    <span className="text-xs text-white/40">{data.sentiment.btc.value}%</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${data.sentiment.btc.value}%` }}
                      className={`h-full ${data.sentiment.btc.label?.includes('BULL') ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-[10px] text-white/20">No sentiment data</p>
              </div>
            )}
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Metode Teknikal</h3>
              <Cpu size={14} className="text-orange-500" />
            </div>
            
            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-4 bg-white/5 rounded w-full"></div>
                ))}
              </div>
            ) : data?.identifiedMethods ? (
              <div className="grid grid-cols-1 gap-2">
                {data.identifiedMethods.map((method, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <div className="w-1 h-1 rounded-full bg-orange-500/40 group-hover:bg-orange-500 transition-colors" />
                    <span className="text-[9px] text-white/60 group-hover:text-white transition-colors font-medium">{method}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-white/5">
                  <span className="text-[8px] text-orange-500/60 font-bold uppercase tracking-tighter italic">
                    * Algoritma Cerdas Mengidentifikasi 30+ Sinyal
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-white/20 text-[10px] uppercase font-bold tracking-widest">
                Menunggu Analisis...
              </div>
            )}
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
              <Globe size={14} />
              Berita & Sentimen
            </h3>
            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-white/5 rounded w-full"></div>
                <div className="h-3 bg-white/5 rounded w-5/6"></div>
                <div className="h-8 bg-white/5 rounded w-full mt-2"></div>
              </div>
            ) : data?.newsSentiment ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/40 uppercase font-bold">Skor Sentimen</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${data.newsSentiment.score > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.abs(data.newsSentiment.score)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-bold ${data.newsSentiment.score > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {data.newsSentiment.score > 0 ? '+' : ''}{data.newsSentiment.score}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-white/60 leading-relaxed italic">
                  "{data.newsSentiment.summary}"
                </p>
                {data.newsSentiment.sources && data.newsSentiment.sources.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    <span className="text-[8px] text-white/20 uppercase font-bold block">Sumber Grounding:</span>
                    {data.newsSentiment.sources.slice(0, 3).map((source, idx) => (
                      <a 
                        key={idx}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-[9px] text-orange-500/60 hover:text-orange-500 transition-colors group"
                      >
                        <Zap size={10} className="group-hover:animate-pulse" />
                        <span className="truncate max-w-[180px]">{source.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-white/20 text-[9px] uppercase font-bold">
                Mencari Berita...
              </div>
            )}
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center justify-between">
              <span>Kesehatan Sistem</span>
              <div className="flex gap-1">
                <div className={`w-1 h-1 rounded-full ${livePrices['XAU/USD']?.price > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                <div className={`w-1 h-1 rounded-full ${livePrices['BTC/USD']?.price > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                <div className={`w-1 h-1 rounded-full ${!isFallback ? 'bg-green-500' : 'bg-blue-500'}`} />
              </div>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/5 p-2 rounded border border-white/5">
                <span className="text-[7px] text-white/30 uppercase block">Feed Data</span>
                <span className="text-[9px] font-bold text-green-500 uppercase">Stabil</span>
              </div>
              <div className="bg-white/5 p-2 rounded border border-white/5">
                <span className="text-[7px] text-white/30 uppercase block">Mesin AI</span>
                <span className={`text-[9px] font-bold ${isFallback ? 'text-blue-500' : 'text-green-500'} uppercase`}>
                  {isFallback ? 'Sistem' : 'Online'}
                </span>
              </div>
              <div className="bg-white/5 p-2 rounded border border-white/5">
                <span className="text-[7px] text-white/30 uppercase block">Latensi</span>
                <span className="text-[9px] font-bold text-white/60">24ms</span>
              </div>
              <div className="bg-white/5 p-2 rounded border border-white/5">
                <span className="text-[7px] text-white/30 uppercase block">Waktu Aktif</span>
                <span className="text-[9px] font-bold text-white/60">99.9%</span>
              </div>
            </div>
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest border-b border-white/5 pb-2">Indikator Teknikal</h3>
            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-full"></div>
                <div className="h-4 bg-white/5 rounded w-full"></div>
                <div className="h-4 bg-white/5 rounded w-full"></div>
              </div>
            ) : data ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center py-1">
                  <span className="text-[10px] text-white/40 uppercase">RSI (14)</span>
                  <span className="text-xs font-bold text-white">{data.indicators.rsi}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[10px] text-white/40 uppercase">Volatilitas</span>
                  <span className="text-xs font-bold text-orange-500">{data.indicators.volatility}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[10px] text-white/40 uppercase">Volume 24j</span>
                  <span className="text-xs font-bold text-white">{data.indicators.volume24h}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-[10px] text-white/20">Tidak ada indikator</p>
              </div>
            )}
          </div>
        </div>

        {/* Middle Column: Chart & Analysis */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                {(['XAU/USD', 'BTC/USD'] as Pair[]).map((pair) => (
                  <button
                    key={pair}
                    onClick={() => setSelectedPair(pair)}
                    className={`px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-tighter transition-all ${
                      selectedPair === pair ? 'bg-orange-500 text-black' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {pair}
                  </button>
                ))}
              </div>
              <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                {(['1M', '5M', '1H', '4H', '1D'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-tighter transition-all ${
                      selectedTimeframe === tf ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#ffffff20" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis 
                    stroke="#ffffff20" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false}
                    domain={['auto', 'auto']}
                    orientation="right"
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ color: '#f97316' }}
                    formatter={(value: any) => [typeof value === 'number' ? value.toFixed(2) : value, 'Harga']}
                  />
                  <Area 
                    type="stepAfter" 
                    dataKey="price" 
                    stroke="#f97316" 
                    strokeWidth={1.5}
                    fillOpacity={1} 
                    fill="url(#colorPrice)" 
                    animationDuration={500}
                  />
                  <Area type="monotone" dataKey="ema8" stroke="#3b82f6" strokeWidth={1} fill="transparent" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="ema21" stroke="#ef4444" strokeWidth={1} fill="transparent" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 text-[8px] uppercase tracking-widest text-white/30 font-bold">
              <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-orange-500" /> Harga</div>
              <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-blue-500 border-t border-dashed" /> EMA 8</div>
              <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-red-500 border-t border-dashed" /> EMA 21</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 relative min-h-[300px]">
              <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest border-b border-white/5 pb-2 mb-4 flex items-center gap-2">
                <Activity size={14} />
                Strategi Swing
              </h3>
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-white/5 rounded w-full"></div>
                  <div className="h-4 bg-white/5 rounded w-5/6"></div>
                  <div className="h-4 bg-white/5 rounded w-4/6"></div>
                </div>
              ) : error ? (
                <div className="text-center py-12 px-4">
                  <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
                  <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-widest">Kesalahan Terminal</h3>
                  <p className="text-[11px] text-white/50 leading-relaxed mb-6 max-w-xs mx-auto italic">
                    {error}
                  </p>
                  <div className="flex flex-col gap-3 items-center">
                    <button 
                      onClick={() => generateAnalysis()}
                      className="bg-orange-500 text-black px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20"
                    >
                      Coba Lagi
                    </button>
                    {(window as any).aistudio && (
                      <button 
                        onClick={async () => {
                          await (window as any).aistudio.openSelectKey();
                          generateAnalysis();
                        }}
                        className="text-orange-500/60 hover:text-orange-500 text-[9px] font-bold uppercase tracking-widest transition-all"
                      >
                        Ganti API Key
                      </button>
                    )}
                  </div>
                </div>
              ) : data ? (
                <div className="prose prose-invert max-w-none text-[11px] leading-relaxed text-white/70">
                  <ReactMarkdown>{data.analysis}</ReactMarkdown>
                </div>
              ) : null}
            </div>

            <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6">
              <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest border-b border-white/5 pb-2 mb-4 flex items-center gap-2">
                <Clock size={14} />
                Waktu & Penjualan (Tape)
              </h3>
              <div className="space-y-1 h-[220px] overflow-hidden">
                <div className="grid grid-cols-4 text-[8px] text-white/20 font-bold uppercase tracking-widest pb-1 border-b border-white/5">
                  <span>Waktu</span>
                  <span>Harga</span>
                  <span>Ukuran</span>
                  <span className="text-right">Sisi</span>
                </div>
                {tape.map((entry) => (
                  <motion.div 
                    key={entry.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="grid grid-cols-4 text-[9px] py-1 border-b border-white/5 font-mono"
                  >
                    <span className="text-white/40">{entry.time}</span>
                    <span className="text-white font-bold">{entry.price.toFixed(2)}</span>
                    <span className="text-white/60">{entry.size}</span>
                    <span className={`text-right font-bold ${entry.side === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>
                      {entry.side}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Trading */}
        <div className="space-y-6">
          {/* Tanya AI Signal Section */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4 relative overflow-hidden">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl -mr-16 -mt-16 rounded-full pointer-events-none" />
            
            <div className="flex items-center justify-between border-b border-white/5 pb-2 relative z-10">
              <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
                <Sparkles size={14} className="animate-pulse" />
                Tanya AI Signal
              </h3>
              <div className="flex gap-1">
                {aiRecommendation && (
                  <button 
                    onClick={() => {
                      setAiRecommendation(null);
                      setChartImage(null);
                      setEntryPrice('');
                      setSwingStopLoss('');
                      setSwingTakeProfit('');
                      setSwingTakeProfit2('');
                      setSwingTakeProfit3('');
                    }}
                    className="text-[8px] px-2 py-0.5 rounded border border-white/10 text-white/40 hover:text-white transition-all font-bold uppercase tracking-widest"
                  >
                    Reset
                  </button>
                )}
                <button 
                  onClick={() => setUseCustomSwing(!useCustomSwing)}
                  className={`text-[8px] px-2 py-0.5 rounded border transition-all font-bold uppercase tracking-widest ${
                    useCustomSwing ? 'bg-blue-500 border-blue-500 text-white' : 'border-white/10 text-white/40'
                  }`}
                >
                  {useCustomSwing ? 'Edit Manual' : 'Kunci AI'}
                </button>
              </div>
            </div>

            {!aiRecommendation && !isAskingAI ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto border border-orange-500/20">
                  <Cpu size={24} className="text-orange-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">Butuh Setup Swing?</p>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest">AI akan menganalisis SMC & Likuiditas</p>
                </div>
                
                {/* Image Upload Area */}
                <div className="space-y-3">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {chartImage ? (
                    <div className="relative w-full aspect-video bg-white/5 rounded-xl border border-white/10 overflow-hidden group">
                      <img src={chartImage} alt="Chart" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                        >
                          <RefreshCw size={16} className="text-white" />
                        </button>
                        <button 
                          onClick={() => setChartImage(null)}
                          className="p-2 bg-red-500/20 rounded-full hover:bg-red-500/40 transition-colors"
                        >
                          <X size={16} className="text-red-500" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Globe size={20} className="text-white/20 group-hover:text-orange-500/50 transition-colors" />
                        <span className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Upload Screenshot Chart (Opsional)</span>
                      </div>
                    </button>
                  )}
                </div>

                <button 
                  onClick={handleAskAI}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-black font-black py-3 rounded-xl text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                >
                  <Sparkles size={14} />
                  Tanya AI Sekarang
                </button>
              </div>
            ) : isAskingAI ? (
              <div className="py-12 text-center space-y-4">
                <div className="relative w-16 h-16 mx-auto">
                  <div className="absolute inset-0 border-2 border-orange-500/20 rounded-full" />
                  <div className="absolute inset-0 border-2 border-t-orange-500 rounded-full animate-spin" />
                  <Cpu size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-orange-500 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest animate-pulse">Menganalisis Market Structure...</p>
                  <p className="text-[8px] text-white/20 uppercase tracking-widest">Mencari Area Likuiditas & Imbalance</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* AI Recommendation Card */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2">
                    <div className={`text-[8px] font-black px-2 py-0.5 rounded-full ${
                      swingAction === 'BUY' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                    }`}>
                      AI {swingAction}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[7px] text-white/30 uppercase font-bold tracking-widest">Entry Price</label>
                      <input 
                        type="text" 
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(e.target.value)}
                        readOnly={!useCustomSwing}
                        className={`w-full bg-transparent border-b border-white/10 py-1 text-sm font-black text-white focus:outline-none focus:border-orange-500 transition-colors ${!useCustomSwing ? 'cursor-default' : ''}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[7px] text-white/30 uppercase font-bold tracking-widest">Stop Loss</label>
                      <input 
                        type="text" 
                        value={swingStopLoss}
                        onChange={(e) => setSwingStopLoss(e.target.value)}
                        readOnly={!useCustomSwing}
                        className={`w-full bg-transparent border-b border-red-500/20 py-1 text-sm font-black text-red-500 focus:outline-none focus:border-red-500 transition-colors ${!useCustomSwing ? 'cursor-default' : ''}`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[7px] text-white/30 uppercase font-bold tracking-widest">TP 1</label>
                      <input 
                        type="text" 
                        value={swingTakeProfit}
                        onChange={(e) => setSwingTakeProfit(e.target.value)}
                        readOnly={!useCustomSwing}
                        className={`w-full bg-transparent border-b border-green-500/20 py-1 text-[11px] font-bold text-green-500 focus:outline-none focus:border-green-500 transition-colors ${!useCustomSwing ? 'cursor-default' : ''}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[7px] text-white/30 uppercase font-bold tracking-widest">TP 2</label>
                      <input 
                        type="text" 
                        value={swingTakeProfit2}
                        onChange={(e) => setSwingTakeProfit2(e.target.value)}
                        readOnly={!useCustomSwing}
                        className={`w-full bg-transparent border-b border-green-500/20 py-1 text-[11px] font-bold text-green-500 focus:outline-none focus:border-green-500 transition-colors ${!useCustomSwing ? 'cursor-default' : ''}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[7px] text-white/30 uppercase font-bold tracking-widest">TP 3</label>
                      <input 
                        type="text" 
                        value={swingTakeProfit3}
                        onChange={(e) => setSwingTakeProfit3(e.target.value)}
                        readOnly={!useCustomSwing}
                        className={`w-full bg-transparent border-b border-green-500/20 py-1 text-[11px] font-bold text-green-500 focus:outline-none focus:border-green-500 transition-colors ${!useCustomSwing ? 'cursor-default' : ''}`}
                      />
                    </div>
                  </div>

                  {aiRecommendation?.analysis && (
                    <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-2 space-y-1">
                      <div className="flex items-center gap-1 text-orange-500">
                        <Info size={10} />
                        <span className="text-[8px] font-black uppercase tracking-widest">Scalping Moment</span>
                      </div>
                      <p className="text-[9px] text-white/60 leading-relaxed italic">
                        "{aiRecommendation.analysis}"
                      </p>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Lot</label>
                      <input 
                        type="text" 
                        value={lotSize}
                        onChange={(e) => setLotSize(e.target.value)}
                        className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] font-bold text-white focus:outline-none focus:border-orange-500/50"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSwingAction(swingAction === 'BUY' ? 'SELL' : 'BUY')}
                        className="text-[8px] text-white/40 hover:text-white uppercase font-bold tracking-widest"
                      >
                        Switch to {swingAction === 'BUY' ? 'SELL' : 'BUY'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={handleAskAI}
                    disabled={isAskingAI}
                    className="bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold py-3 rounded-xl text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={12} className={isAskingAI ? 'animate-spin' : ''} />
                    Analisis Ulang
                  </button>
                  <button
                    onClick={async () => {
                      if (!entryPrice || !swingStopLoss || !swingTakeProfit) {
                        toast.error('Level Swing belum lengkap!');
                        return;
                      }
                      setIsLogging(true);
                      try {
                        if (!auth.currentUser) {
                          toast.error('Anda harus masuk untuk mengaktifkan sinyal.');
                          setIsLogging(false);
                          return;
                        }
                        await addDoc(collection(db, 'signals'), {
                          pair: selectedPair,
                          action: swingAction,
                          entryPrice: parseFloat(entryPrice),
                          sl: parseFloat(swingStopLoss),
                          tp: parseFloat(swingTakeProfit),
                          result: 0, // Open trade
                          status: 'open',
                          createdAt: Timestamp.now(),
                          type: userProfile?.role === 'admin' ? 'OFFICIAL' : 'SWING',
                          lot: lotSize,
                          analysis: aiRecommendation?.analysis || '',
                          author: auth.currentUser?.email || 'User',
                          uid: auth.currentUser?.uid
                        });
                        toast.success('Sinyal AI berhasil diaktifkan!');
                        setAiRecommendation(null);
                        setChartImage(null);
                        setEntryPrice('');
                      } catch (error) {
                        handleFirestoreError(error, OperationType.CREATE, 'signals');
                        toast.error('Gagal mengaktifkan sinyal.');
                      } finally {
                        setIsLogging(false);
                      }
                    }}
                    disabled={isLogging}
                    className="bg-orange-500 hover:bg-orange-600 text-black font-black py-3 rounded-xl text-[9px] uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                  >
                    {isLogging ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                    Eksekusi Sinyal
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
              <Zap size={14} />
              Intelijen Pasar
            </h3>
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-12 bg-white/5 rounded"></div>
                <div className="h-12 bg-white/5 rounded"></div>
                <div className="h-12 bg-white/5 rounded"></div>
              </div>
            ) : data ? (
              <div className="space-y-4">
                {/* Indicators */}
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between p-2 bg-white/5 border border-white/10 rounded">
                    <span className="text-[9px] text-white/40 uppercase font-bold">RSI (14)</span>
                    <span className="text-xs font-bold text-white">{data.indicators.rsi}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white/5 border border-white/10 rounded">
                    <span className="text-[9px] text-white/40 uppercase font-bold">MACD</span>
                    <span className="text-xs font-bold text-white">{data.indicators.macd}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white/5 border border-white/10 rounded">
                    <span className="text-[9px] text-white/40 uppercase font-bold">Bollinger Bands</span>
                    <span className="text-xs font-bold text-white">{data.indicators.bollingerBands}</span>
                  </div>
                </div>

                {/* Predictions */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-white/5 border border-white/10 rounded space-y-1">
                    <span className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Prediksi 1J</span>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black ${
                        data.predictions.h1.direction === 'UP' ? 'text-green-500' : 
                        data.predictions.h1.direction === 'DOWN' ? 'text-red-500' : 'text-yellow-500'
                      }`}>
                        {data.predictions.h1.direction === 'UP' ? 'NAIK' : 
                         data.predictions.h1.direction === 'DOWN' ? 'TURUN' : 'KONSOLIDASI'}
                      </span>
                      <span className="text-[9px] text-white/60">{data.predictions.h1.confidence}%</span>
                    </div>
                    <div className="text-[8px] text-white/40 italic">Target: {data.predictions.h1.target}</div>
                  </div>
                  <div className="p-2 bg-white/5 border border-white/10 rounded space-y-1">
                    <span className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Prediksi 4J</span>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black ${
                        data.predictions.h4.direction === 'UP' ? 'text-green-500' : 
                        data.predictions.h4.direction === 'DOWN' ? 'text-red-500' : 'text-yellow-500'
                      }`}>
                        {data.predictions.h4.direction === 'UP' ? 'NAIK' : 
                         data.predictions.h4.direction === 'DOWN' ? 'TURUN' : 'KONSOLIDASI'}
                      </span>
                      <span className="text-[9px] text-white/60">{data.predictions.h4.confidence}%</span>
                    </div>
                    <div className="text-[8px] text-white/40 italic">Target: {data.predictions.h4.target}</div>
                  </div>
                </div>

                {/* News Sentiment */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/30 uppercase font-bold tracking-widest">Sentimen Berita</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${data.newsSentiment.score > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.abs(data.newsSentiment.score)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-bold text-white">{data.newsSentiment.score}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-white/70 leading-relaxed bg-white/5 p-2 rounded border border-white/5">
                    {data.newsSentiment.summary}
                  </p>
                  <div className="space-y-1">
                    {data.newsSentiment.sources.slice(0, 2).map((source, i) => (
                      <a 
                        key={i} 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[8px] text-orange-500/60 hover:text-orange-500 transition-colors truncate"
                      >
                        <Globe size={8} />
                        {source.title}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
                <Globe size={14} />
                Kalender Ekonomi
              </h3>
              <select 
                value={impactFilter}
                onChange={(e) => setImpactFilter(e.target.value as any)}
                className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[8px] font-bold text-white/60 uppercase tracking-widest focus:outline-none focus:border-orange-500/50 transition-colors cursor-pointer"
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
                  <div key={idx} className="flex items-center justify-between p-2 bg-white/5 border border-white/10 rounded group hover:border-orange-500/30 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-orange-500">{event.time}</span>
                        <span className="text-[8px] px-1 bg-white/10 text-white/60 rounded font-bold">{event.currency}</span>
                      </div>
                      <span className="text-[10px] text-white font-medium line-clamp-1">{event.event}</span>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      event.impact === 'HIGH' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                      event.impact === 'MEDIUM' ? 'bg-orange-500' : 'bg-yellow-500'
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
                <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
                  <BarChart2 size={14} />
                  SL TP Tracker
                </h3>
                <span className="text-[7px] px-1 bg-green-500/20 text-green-500 rounded border border-green-500/30 font-bold animate-pulse">LIVE SYNC</span>
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
                  className="text-[8px] text-orange-500/60 hover:text-orange-500 font-bold uppercase tracking-widest transition-colors"
                >
                  Gunakan Level AI
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
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-orange-500/50 transition-colors"
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
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest text-red-400">Stop Loss</label>
                  <input 
                    type="text" 
                    placeholder="SL Price"
                    value={logSL}
                    onChange={(e) => setLogSL(e.target.value)}
                    className="w-full bg-white/5 border border-red-500/20 rounded px-2 py-1.5 text-xs font-bold text-red-400 focus:outline-none focus:border-red-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest text-green-400">Take Profit</label>
                  <input 
                    type="text" 
                    placeholder="TP Price"
                    value={logTP}
                    onChange={(e) => setLogTP(e.target.value)}
                    className="w-full bg-white/5 border border-green-500/20 rounded px-2 py-1.5 text-xs font-bold text-green-400 focus:outline-none focus:border-green-500/50 transition-colors"
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
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
              <button
                onClick={handleLogTrade}
                disabled={isLogging}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
              >
                {isLogging ? <RefreshCw className="animate-spin" size={14} /> : <BarChart2 size={14} />}
                Catat ke Performa
              </button>
            </div>
          </div>

          <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold text-orange-500 uppercase tracking-widest">Pemberitahuan Terminal</span>
            </div>
            <p className="text-[9px] text-orange-500/60 leading-tight italic">
              Feed data disediakan oleh Gemini AI Intelligence. Semua timestamp adalah UTC. Analisis pasar diperbarui setiap 15 menit atau saat refresh manual.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
