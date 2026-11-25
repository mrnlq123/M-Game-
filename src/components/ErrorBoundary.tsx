import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  public state: State = { hasError: false, message: '' };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#070B14] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#0D1526] border border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-rose-400">Session Interrupted</h2>
            <p className="text-sm text-slate-300 leading-relaxed break-words">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Reload World Arena
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
