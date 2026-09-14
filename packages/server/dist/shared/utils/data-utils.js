"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.delay = delay;
exports.safe = safe;
exports.safeSync = safeSync;
exports.subtractSets = subtractSets;
exports.removeByIndices = removeByIndices;
exports.randomInt = randomInt;
exports.md = md;
function delay(ms) {
    if (ms <= 0)
        return;
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function safe(fn, _default) {
    try {
        return await fn();
    }
    catch (error) {
        console.error(error);
        return _default;
    }
}
function safeSync(fn, _default) {
    try {
        return fn();
    }
    catch (error) {
        console.error(error);
        return _default;
    }
}
function subtractSets(A, B) {
    let setB = new Set([...B]);
    return [...new Set([...A].filter((x) => !setB.has(x)))];
}
function removeByIndices(arr, indices, del, add) {
    const toDelete = indices.filter((i) => i >= 0 && i < arr.length).sort((a, b) => b - a);
    let prev = -1;
    for (const idx of toDelete) {
        if (idx === prev)
            continue;
        prev = idx;
        if (idx >= arr.length)
            continue;
        const removedObj = arr[idx];
        del(removedObj);
        if (idx === arr.length - 1) {
            arr.pop();
        }
        else {
            add(idx, (arr[idx] = arr.pop()));
        }
    }
}
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
const regex = /^```(?<lang>[^\r\n]*)(?:\r\n|\n|\r)(?<code>[\s\S]*?)^```$/gm;
function md(text) {
    return [...text.matchAll(regex)].map((match) => ({ lang: match.groups.lang, code: match.groups.code }));
}
