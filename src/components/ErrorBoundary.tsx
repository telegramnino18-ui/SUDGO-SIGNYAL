import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'Terjadi kesalahan yang tidak terduga.';
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            errorMessage = `Kesalahan Database: ${parsed.error}`;
            isFirestoreError = true;
          }
        }
      } catch (e) {
        // Not a JSON error message
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-[#0A0A0A] border border-white/5 rounded-3xl m-8">
          <div className="w-16 h-16 rounded-2xl bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-500 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)] mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Ups! Ada Masalah</h2>
          <p className="text-sm text-white/40 max-w-md mb-8">
            {errorMessage}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all border border-white/10"
          >
            <RefreshCcw size={16} /> Segarkan Halaman
          </button>
          
          {isFirestoreError && (
            <p className="mt-8 text-[10px] text-white/20 uppercase tracking-widest font-bold">
              Hubungi dukungan jika masalah berlanjut
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
