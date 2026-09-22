"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import neMessages from '@/messages/ne.json';

export type Locale = 'en' | 'ne';

const messagesMap: Record<Locale, any> = {
  en: enMessages,
  ne: neMessages
};

interface LocaleContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  t: (keyPath: string, fallback?: string) => string;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'en',
  setLocale: () => {},
  toggleLocale: () => {},
  t: (keyPath: string, fallback?: string) => fallback || keyPath
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [locale, setLocaleState] = useState<Locale>('en');
  const [mounted, setMounted] = useState<boolean>(false);

  // Determine initial role-based default or stored locale
  useEffect(() => {
    setMounted(true);
    const saved = typeof window !== 'undefined' ? localStorage.getItem('app_locale') as Locale | null : null;
    if (saved && (saved === 'en' || saved === 'ne')) {
      setLocaleState(saved);
      document.documentElement.lang = saved;
      document.documentElement.setAttribute('data-locale', saved);
      return;
    }

    // Role-based defaults:
    // Consumer/Subject portal defaults to 'ne'.
    // Admin, Analyst, Provider default to 'en'.
    let initialLocale: Locale = 'en';
    if (pathname && (pathname.startsWith('/subject') || pathname === '/consumer')) {
      initialLocale = 'ne';
    } else {
      initialLocale = 'en';
    }

    setLocaleState(initialLocale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = initialLocale;
      document.documentElement.setAttribute('data-locale', initialLocale);
    }
  }, [pathname]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_locale', newLocale);
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = newLocale;
      document.documentElement.setAttribute('data-locale', newLocale);
    }
  };

  const toggleLocale = () => {
    setLocale(locale === 'en' ? 'ne' : 'en');
  };

  // Safe nested translation lookup
  const t = (keyPath: string, fallback?: string): string => {
    const keys = keyPath.split('.');
    let cur = messagesMap[locale];
    for (const k of keys) {
      if (cur && typeof cur === 'object' && k in cur) {
        cur = cur[k];
      } else {
        // Fallback to English if key missing in current locale
        let fb = messagesMap['en'];
        for (const fbk of keys) {
          if (fb && typeof fb === 'object' && fbk in fb) {
            fb = fb[fbk];
          } else {
            return fallback || keyPath;
          }
        }
        return typeof fb === 'string' ? fb : fallback || keyPath;
      }
    }
    return typeof cur === 'string' ? cur : fallback || keyPath;
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, toggleLocale, t }}>
      <NextIntlClientProvider locale={locale} messages={messagesMap[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleContext() {
  return useContext(LocaleContext);
}

export function useLocale() {
  return useContext(LocaleContext);
}

export type TranslationFunction = {
  (key: string, fallback?: string): string;
  t: (key: string, fallback?: string) => string;
  locale: Locale;
};

export function useTranslations(namespace?: string): TranslationFunction {
  const { t, locale } = useLocaleContext();
  const fn = ((key: string, fallback?: string) => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    return t(fullKey, fallback);
  }) as TranslationFunction;
  fn.t = fn;
  fn.locale = locale;
  return fn;
}
