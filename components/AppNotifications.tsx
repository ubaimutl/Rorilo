'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type NotificationType = 'success' | 'info' | 'error';

type AppNotification = {
  id: number;
  type: NotificationType;
  title: string;
  message?: string;
};

type NotificationEventDetail = {
  type?: NotificationType;
  title: string;
  message?: string;
};

const EVENT_NAME = 'rorilo:notify';
let nextId = 1;

export function notify(detail: NotificationEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NotificationEventDetail>(EVENT_NAME, { detail }));
}

export function AppNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    const onNotify = (event: Event) => {
      const detail = (event as CustomEvent<NotificationEventDetail>).detail;
      if (!detail?.title) return;

      const id = nextId++;
      setItems((current) => [
        ...current.slice(-2),
        {
          id,
          type: detail.type || 'info',
          title: detail.title,
          message: detail.message,
        },
      ]);

      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 4200);
    };

    window.addEventListener(EVENT_NAME, onNotify);
    return () => window.removeEventListener(EVENT_NAME, onNotify);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((item) => {
        const Icon = item.type === 'success' ? CheckCircle2 : item.type === 'error' ? XCircle : Info;
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-card-foreground shadow-xl',
              item.type === 'success' && 'border-emerald-200',
              item.type === 'error' && 'border-red-200',
              item.type === 'info' && 'border-border'
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 size-4 shrink-0',
                item.type === 'success' && 'text-emerald-600',
                item.type === 'error' && 'text-red-600',
                item.type === 'info' && 'text-neutral-500'
              )}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5 text-neutral-900">{item.title}</p>
              {item.message && (
                <p className="mt-0.5 text-xs leading-5 text-neutral-500">{item.message}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
