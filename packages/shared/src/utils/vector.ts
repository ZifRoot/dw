export function sum(a: number[], b: number[]) {
  let c = Array.from({ length: Math.max(a.length, b.length) }).map((_) => 0);
  for (let i = 0; i < a.length; i++) {
    c[i] += a[i];
  }
  for (let i = 0; i < b.length; i++) {
    c[i] += b[i];
  }
  return c;
}

export function sumA(a: number[], b: number[]) {
  let al = a.length;
  a.length = Math.max(a.length, b.length);
  for (let i = al; i < a.length; i++) {
    a[i] = 0;
  }

  for (let i = 0; i < b.length; i++) {
    a[i] += b[i];
  }
  return a;
}

export function mult(a: number[], b: number) {
  for (let i = 0; i < a.length; i++) {
    a[i] *= +b;
  }
  return a;
}

export function div(a: number[], b: number) {
  return mult(a, 1 / b);
}

export function cosineDistance(vecA: number[], vecB: number[]): number {
  let c = vecA.map((a, i) => a - vecB[i]);
  for (let i = 0; i < c.length; i++) {
    c[i] *= c[i];
  }
  return accurateSum(c);
}

export function accurateSum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
  // Работаем с копией, чтобы не портить исходный массив
  const data = arr.slice();
  // Сортировка по убыванию модуля (большие модули в начало)
  data.sort((a, b) => Math.abs(b) - Math.abs(a));

  let len = data.length;
  if (len === 0) return 0;

  while (len > 1) {
    const a = data[len - 2];
    const b = data[len - 1];
    const sum = a + b;
    len--; // отбрасываем последний элемент
    let pos = len - 1; // позиция, куда записали сумму
    data[pos] = sum;

    // Пузырьковый подъём влево по модулю
    while (pos > 0 && Math.abs(data[pos]) > Math.abs(data[pos - 1])) {
      [data[pos], data[pos - 1]] = [data[pos - 1], data[pos]];
      pos--;
    }
  }
  return data[0];
}
