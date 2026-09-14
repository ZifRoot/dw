"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLoggedRunner = createLoggedRunner;
exports.createLoggedMethodRunner = createLoggedMethodRunner;
exports._safe = _safe;
exports.LogExecutionName = LogExecutionName;
exports.Log = Log;
exports.LogSafe = LogSafe;
exports.LogParamSafe = LogParamSafe;
exports.LogParam = LogParam;
exports.Safe = Safe;
function createLoggedRunner(fn, label) {
    const logLabel = label || fn.name || "anonymous";
    return async (...args) => {
        console.log(`[${logLabel}] запустилась`);
        const start = performance.now();
        try {
            const result = await fn(...args);
            const duration = (performance.now() - start).toFixed(2);
            console.log(`[${logLabel}] завершилась (${duration}ms)`);
            return result;
        }
        catch (error) {
            const duration = (performance.now() - start).toFixed(2);
            console.error(`[${logLabel}] ошибка через ${duration}ms`, error);
            throw error;
        }
    };
}
function createLoggedMethodRunner(fn, label, param = false, safe = false) {
    const logLabel = label || fn.name || "anonymous";
    return async function (...args) {
        const param_str = param ? ` | ${JSON.stringify(args)}` : "";
        console.log(`[${logLabel}] запустилась${param_str}`);
        const start = performance.now();
        try {
            const result = await fn.apply(this, args);
            const duration = (performance.now() - start).toFixed(2);
            console.log(`[${logLabel}] завершилась (${duration}ms)`);
            return result;
        }
        catch (error) {
            const duration = (performance.now() - start).toFixed(2);
            console.error(`[${logLabel}] ошибка через ${duration}ms`, error);
            if (safe)
                return null;
            throw error;
        }
    };
}
function _safe(fn) {
    return async function (...args) {
        try {
            const result = await fn.apply(this, args);
            return result;
        }
        catch (error) {
            console.error(error);
        }
        return null;
    };
}
function LogExecutionName(label) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = createLoggedMethodRunner(originalMethod, label ?? propertyKey);
    };
}
function Log(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey, false);
}
function LogSafe(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey, false, true);
}
function LogParamSafe(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey, true, true);
}
function LogParam(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey, true);
}
function Safe(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = _safe(originalMethod);
}
