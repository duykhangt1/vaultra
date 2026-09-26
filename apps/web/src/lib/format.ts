import { getLocale, STATUS_EN } from './i18n';

function localeMap<T extends Record<string, string>>(vi: T, en: Record<keyof T, string>): T {
  return new Proxy(vi, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in target) {
        return getLocale() === 'en' ? (en[prop as keyof T] ?? target[prop]) : target[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const vndFmt = new Intl.NumberFormat('vi-VN');
