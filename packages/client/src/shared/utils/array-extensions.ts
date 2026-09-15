// Расширения для массивов
declare global {
  interface Array<T> {
    shuffle(): T[];
  }
}

Array.prototype.shuffle = function <T>(this: T[]): T[] {
  const arr = [...this];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export {};
