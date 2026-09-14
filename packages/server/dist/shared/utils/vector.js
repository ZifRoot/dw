"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sum = sum;
exports.sumA = sumA;
exports.mult = mult;
exports.div = div;
exports.cosineDistance = cosineDistance;
exports.accurateSum = accurateSum;
function sum(a, b) {
    let c = Array.from({ length: Math.max(a.length, b.length) }).map((_) => 0);
    for (let i = 0; i < a.length; i++) {
        c[i] += a[i];
    }
    for (let i = 0; i < b.length; i++) {
        c[i] += b[i];
    }
    return c;
}
function sumA(a, b) {
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
function mult(a, b) {
    for (let i = 0; i < a.length; i++) {
        a[i] *= +b;
    }
    return a;
}
function div(a, b) {
    return mult(a, 1 / b);
}
function cosineDistance(vecA, vecB) {
    let c = vecA.map((a, i) => a - vecB[i]);
    for (let i = 0; i < c.length; i++) {
        c[i] *= c[i];
    }
    return accurateSum(c);
}
function accurateSum(arr) {
    return arr.reduce((a, b) => a + b, 0);
    const data = arr.slice();
    data.sort((a, b) => Math.abs(b) - Math.abs(a));
    let len = data.length;
    if (len === 0)
        return 0;
    while (len > 1) {
        const a = data[len - 2];
        const b = data[len - 1];
        const sum = a + b;
        len--;
        let pos = len - 1;
        data[pos] = sum;
        while (pos > 0 && Math.abs(data[pos]) > Math.abs(data[pos - 1])) {
            [data[pos], data[pos - 1]] = [data[pos - 1], data[pos]];
            pos--;
        }
    }
    return data[0];
}
