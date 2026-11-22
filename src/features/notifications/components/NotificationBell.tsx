import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { getNotifications, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from '@/features/notifications/api';
import { formatDateTime, translations } from '@/core/i18n';
import type { Locale } from '@/core/i18n';

interface NotificationItem {
  id: number;
  title_ar: string;
  body_ar: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export const NotificationBell: React.FC<{ locale?: Locale }> = ({ locale = 'ar' }) => {
  const t = translations[locale];
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    const response = await getUnreadNotificationCount();
    if (response.success && response.data) setCount(response.data.count);
  };

  const loadItems = async () => {
    const response = await getNotifications();
    if (response.success && response.data) setItems(response.data as NotificationItem[]);
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) loadItems();
  };

  const markRead = async (id: number) => {
    await markNotificationRead(id);
    setItems((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
    setCount((current) => Math.max(0, current - 1));
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    setCount(0);
  };

  return (
    <div className="relative">
      <button type="button" onClick={toggle} className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label={t.notifications}>
        <Bell className="h-5 w-5" />
        {count > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-black leading-5 text-white">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && <div className="absolute left-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white text-right shadow-2xl" dir="rtl">
        <div className="flex items-center justify-between border-b border-slate-100 p-3">
          <span className="font-black text-slate-900">{t.notifications}</span>
          <button type="button" onClick={markAllRead} className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><CheckCheck className="h-3.5 w-3.5" /> {t.markAllRead}</button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? <p className="p-5 text-center text-sm text-slate-500">{t.noNotifications}</p> : items.map((item) => <button type="button" key={item.id} onClick={() => !item.is_read && markRead(item.id)} className={`block w-full border-b border-slate-100 p-3 text-right hover:bg-slate-50 ${item.is_read ? 'opacity-60' : 'bg-emerald-50/40'}`}>
            <div className="text-sm font-black text-slate-800">{item.title_ar}</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">{item.body_ar}</div>
            <div className="mt-1 text-[10px] text-slate-400">{formatDateTime(item.created_at, locale) || item.created_at}</div>
          </button>)}
        </div>
      </div>}
    </div>
  );
};