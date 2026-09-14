"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateThrottle = CreateThrottle;
exports.InjectThrottle = InjectThrottle;
exports.ThrottledMethod = ThrottledMethod;
exports.getThrottler = getThrottler;
const throttler_1 = require("./throttler");
const throttlerSymbol = Symbol("throttler");
function CreateThrottle(minMs, maxMs) {
    return function (constructor) {
        const throttler = new throttler_1.Throttler(minMs, maxMs);
        return class extends constructor {
            constructor(...args) {
                super(...args);
                this[throttlerSymbol] = throttler;
            }
        };
    };
}
function InjectThrottle(instance) {
    return function (constructor) {
        return class extends constructor {
            constructor(...args) {
                super(...args);
                this[throttlerSymbol] = instance;
            }
        };
    };
}
function ThrottledMethod(target, propertyKey, descriptor) {
    const original = descriptor.value;
    if (typeof original !== "function") {
        throw new Error("@ThrottledMethod can only be applied to methods");
    }
    descriptor.value = async function (...args) {
        const throttler = this[throttlerSymbol];
        if (!throttler) {
            throw new Error("No Throttler found. Use @CreateThrottle or @InjectThrottle on the class.");
        }
        return throttler.throttle(() => original.apply(this, args));
    };
}
function getThrottler(instance) {
    return instance[throttlerSymbol];
}
