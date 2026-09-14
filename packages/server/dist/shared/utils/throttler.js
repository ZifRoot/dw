"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Throttler = void 0;
const data_utils_1 = require("./data-utils");
class Throttler {
    constructor(minMs, maxMs = minMs) {
        this.minMs = minMs;
        this.maxMs = maxMs;
        this.lastCompletion = 0;
        this.nextPromise = null;
        const actualMin = Math.min(minMs, maxMs);
        const actualMax = Math.max(minMs, maxMs);
        if (actualMin <= 0)
            throw new RangeError("Интервал должен быть >0");
        this.minMs = actualMin;
        this.maxMs = actualMax;
    }
    async throttle(fn) {
        const release = await this.prepareNext();
        await this.applyDelay();
        try {
            return await this.exec(fn);
        }
        finally {
            this.updateCompletion();
            release();
        }
    }
    async prepareNext() {
        const prev = this.nextPromise;
        let release = null;
        this.nextPromise = new Promise((resolve) => {
            release = resolve;
        });
        if (prev)
            await prev;
        return release;
    }
    async exec(fn) {
        if (fn instanceof Function) {
            return await fn();
        }
        return Promise.resolve(undefined);
    }
    async applyDelay() {
        await (0, data_utils_1.delay)(this.getDelayMs());
    }
    getInterval() {
        if (this.minMs === this.maxMs)
            return this.minMs;
        return this.minMs + Math.random() * (this.maxMs - this.minMs);
    }
    getDelayMs() {
        const now = Date.now();
        const desiredStart = this.lastCompletion + this.getInterval();
        const delayTime = Math.max(0, desiredStart - now);
        return delayTime;
    }
    updateCompletion() {
        this.lastCompletion = Date.now();
    }
}
exports.Throttler = Throttler;
