"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionGuard = void 0;
exports.createSingleRunner = createSingleRunner;
exports.createSingleCallGuard = createSingleCallGuard;
exports.createGuardedRunner = createGuardedRunner;
exports.SingleExecution = SingleExecution;
exports.SingleGuarded = SingleGuarded;
function createSingleRunner(fn) {
    let running = null;
    return async (...args) => {
        if (running)
            return running;
        running = fn(...args);
        try {
            return await running;
        }
        finally {
            running = null;
        }
    };
}
function createSingleCallGuard(fn, storageKey) {
    return function (...args) {
        const existing = this[storageKey];
        if (existing) {
            console.warn(`SingleCallGuard ${storageKey.toString()}`);
            return existing;
        }
        const promise = fn.apply(this, args);
        this[storageKey] = promise;
        promise.finally(() => {
            delete this[storageKey];
        });
        return promise;
    };
}
class ExecutionGuard {
    constructor() {
        this.running = null;
    }
    tryStart(fn) {
        if (this.running)
            return this.running;
        this.running = fn();
        this.running.finally(() => (this.running = null));
        return this.running;
    }
}
exports.ExecutionGuard = ExecutionGuard;
function createGuardedRunner(fn, guard) {
    return function (...args) {
        return guard.tryStart(() => fn.apply(this, args));
    };
}
function SingleExecution(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    const guardKey = Symbol(`guard_${propertyKey}`);
    descriptor.value = createSingleCallGuard(originalMethod, guardKey);
}
function SingleGuarded(guard) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = createGuardedRunner(originalMethod, guard);
    };
}
