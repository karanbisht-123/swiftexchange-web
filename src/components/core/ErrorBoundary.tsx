import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} onReload={this.handleReload} />;
    }

    return this.props.children;
  }
}

export const ErrorScreen = ({
  error,
  onReload,
}: {
  error?: Error | unknown;
  onReload: () => void;
}) => {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4 bg-[#0a0a0a] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('/v882-mind-04%202.webp')` }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-black/50 p-10 text-center shadow-[0_0_80px_-20px_rgba(239,68,68,0.4)] backdrop-blur-2xl">
        <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-red-500/20 blur-[80px]" />

        <div className="relative mb-6 flex justify-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/5 bg-gradient-to-b from-white/10 to-transparent shadow-[0_0_30px_rgba(239,68,68,0.2)]">
            <div className="absolute inset-0 animate-ping rounded-full bg-red-500/20" />
            <AlertOctagon className="relative z-10 h-12 w-12 text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
          </div>
        </div>

        <div className="relative space-y-4">
          <h1 className="bg-gradient-to-br from-white via-red-100 to-red-400 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent drop-shadow-sm">
            Unexpected Application Error
          </h1>
          <p className="text-base leading-relaxed text-gray-300">
            We sincerely apologize for the disruption. You have encountered an unexpected interface
            error.
          </p>
          <p className="text-sm font-medium text-[#5865F2] drop-shadow-[0_0_8px_rgba(88,101,242,0.3)]">
            Please report this issue in our Discord. Our team is actively responding there and will
            help resolve it promptly.
          </p>
        </div>

        {process.env.NODE_ENV === 'development' && error != null && (
          <div className="relative mt-8 overflow-hidden rounded-xl border border-red-500/20 bg-black/60 p-4 text-left shadow-inner">
            <p className="font-mono text-xs text-red-400/90 break-all leading-relaxed">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <a
            href="https://discord.gg/TkZrnv97MV"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex w-full flex-1 items-center justify-center gap-3 overflow-hidden rounded-xl bg-[#5865F2] px-6 py-3.5 font-semibold text-white shadow-[0_0_40px_-10px_rgba(88,101,242,0.4)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_60px_-15px_rgba(88,101,242,0.6)]"
          >
            <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
            <img
              src="/discord-icon.svg"
              alt="Discord"
              className="relative z-10 h-6 w-6 brightness-0 invert"
            />
            <span className="relative z-10 tracking-wide">Report</span>
          </a>

          <button
            onClick={onReload}
            className="group relative flex w-full flex-1 items-center justify-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 font-semibold text-gray-300 transition-all duration-300 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="h-5 w-5 transition-transform duration-500 group-hover:rotate-180" />
            <span className="relative z-10 tracking-wide">Reboot System</span>
          </button>
        </div>
      </div>
    </div>
  );
};
