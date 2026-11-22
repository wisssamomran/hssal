import {Component, StrictMode, type ErrorInfo, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from '@/app/App';
import { applyStoredTheme } from '@/core/theme';
import '../index.css';

let locale: 'ar' | 'en' = 'ar';
try {
  if (typeof window !== 'undefined' && window.localStorage.getItem('hassal_locale') === 'en') {
    locale = 'en';
  }
} catch {
  // Storage may be denied inside restricted iframes.
}

document.documentElement.lang = locale;
document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';

// Before the first render: a remembered dark preference must not open on a
// white page for a frame.
applyStoredTheme();

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HASSAL render error:', error, info);
    const boot = document.getElementById('hassal-boot');
    if (boot) {
      boot.style.visibility = 'hidden';
      boot.style.display = 'none';
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-slate-900" dir="rtl">
          <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-white p-6 space-y-3 shadow-sm">
            <h1 className="text-base font-bold text-rose-800">تعذّر عرض الواجهة مؤقتاً</h1>
            <p className="text-xs text-slate-600 leading-relaxed">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white cursor-pointer"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
