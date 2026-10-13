import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '$': 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  '₽': 'RUB',
  '₹': 'INR',
  '₩': 'KRW',
  'R$': 'BRL',
};

export function normalizeCurrencyCode(input: string | undefined | null): string {
  const cleaned = (input || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(cleaned)) return cleaned;
  if (CURRENCY_SYMBOLS[cleaned]) return CURRENCY_SYMBOLS[cleaned];
  const letters = cleaned.replace(/[^A-Z]/g, '');
  if (/^[A-Z]{3}$/.test(letters)) return letters;
  return 'USD';
}

export function formatCurrency(amount: number | null | undefined, currency: string = 'USD'): string {
  if (amount == null) return '';
  const code = normalizeCurrencyCode(currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}
