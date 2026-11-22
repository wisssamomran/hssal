import React from 'react';
import { Clock, Film, Shield, Truck } from 'lucide-react';
import { reservationWindowMinutes } from '@/core/config';

/**
 * What this screen is, in the buyer's own terms, before anything is asked of them.
 *
 * Three facts belong here because they are the three a first-time buyer would
 * otherwise infer wrongly from the cards: a request is not a hold (`Clock`, with the
 * window the platform actually configured), the seller's `verified` badge is the
 * platform's review and not a government claim (`Shield`), and delivery is whatever
 * each seller declared rather than a service the market provides (`Truck`).
 *
 * Each line reads its own setting and says so when the setting has not arrived —
 * "مدة الحجز: لم تُقرأ من إعدادات المنصة بعد" is a truer sentence than a number
 * copied from a specification document.
 */
export const MarketplaceHero: React.FC<{ onOpenCommercial?: () => void }> = ({ onOpenCommercial }) => (
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-slate-900 p-4 text-white shadow-lg sm:p-8">
    <div className="relative z-10 max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
          <span className="min-w-0">عروض مخزونات نشرة من مؤسسات على المنصة</span>
        </div>
        {onOpenCommercial && (
          <button
            type="button"
            onClick={onOpenCommercial}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200 transition hover:bg-amber-400/25"
          >
            <Film className="h-3.5 w-3.5" />
            <span>شاهد الفيديو الإعلاني الرسمي (دقيقتان)</span>
          </button>
        )}
      </div>
      <h1 className="font-serif text-xl font-black leading-tight tracking-tight text-white sm:text-3xl">
        ابحث في العروض المتاحة، ثم أرسل طلب شراء إلى البائع
      </h1>
      <p className="text-sm leading-relaxed text-slate-300">
        الطلب هنا لا يوقف أي كمية: يصل إلى البائع للمراجعة، والكمية تُحجز من المخزون المتاح فقط عندما يقبله البائع،
        ولمدة الحجز المعتمدة لدى المنصة. التسعير والضريبة والعمولة تُحسب في الصفقة وفق الإعدادات المقررة، ولا تعرض
        هذه الشاشة ما يثبت توثيقاً حكومياً لأي مؤسسة.
      </p>

      <div className="flex flex-col gap-2 pt-2 text-xs sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-xs">
          <Shield className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="min-w-0">توثيق البائع مراجعة من إدارة المنصة، لا شهادة حكومية</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-xs">
          <Clock className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="min-w-0">
            {reservationWindowMinutes()
              ? `مدة الحجز بعد قبول البائع: ${reservationWindowMinutes()} دقيقة`
              : 'مدة الحجز: لم تُقرأ من إعدادات المنصة بعد'}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-xs">
          <Truck className="h-4 w-4 shrink-0 text-sky-400" />
          <span className="min-w-0">التسليم كما يحدده كل بائع على عرضه</span>
        </div>
      </div>
    </div>

    <div className="pointer-events-none absolute -bottom-12 -left-12 h-80 w-80 rounded-full bg-emerald-600/20 blur-3xl"></div>
  </div>
);
