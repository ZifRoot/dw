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
  let c = Array.from({ length: a.length });
  for (let i = 0; i < a.length; i++) {
    a[i] *= +b;
  }
  return a;
}

export function div(a: number[], b: number) {
  return mult(a, 1 / b);
}
