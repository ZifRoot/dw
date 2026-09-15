// Простой логгер для приложения
export const Log = {
  debug: (...args: any[]) => console.debug(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
};

export const LogSafe = Log;
export const Safe = LogSafe;
