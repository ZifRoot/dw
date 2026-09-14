"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uniqueBy = uniqueBy;
exports.uniqueById = uniqueById;
exports.groupToMap = groupToMap;
exports.groupToMapEm = groupToMapEm;
exports.removeByIndices = removeByIndices;
exports.shuffle = shuffle;
exports.intersection = intersection;
exports.mapAsync = mapAsync;
function uniqueBy(items, keySelector, strategy = "first") {
    const getKey = typeof keySelector === "function"
        ? keySelector
        : (item) => item[keySelector];
    const map = new Map();
    if (strategy === "last") {
        for (const item of items) {
            map.set(getKey(item), item);
        }
    }
    else {
        for (const item of items) {
            const key = getKey(item);
            if (!map.has(key)) {
                map.set(key, item);
            }
        }
    }
    return Array.from(map.values());
}
function uniqueById(items) {
    return [...new Map(items.map((item) => [item.id, item])).values()];
}
function groupToMap(array, keySelector) {
    const map = new Map();
    for (const item of array) {
        const key = keySelector(item);
        const group = map.get(key);
        if (group) {
            group.push(item);
        }
        else {
            map.set(key, [item]);
        }
    }
    return map;
}
function groupToMapEm(array, keySelector, em) {
    const grouped = groupToMap(array, keySelector);
    const result = new Map();
    for (const [key, group] of grouped) {
        result.set(key, em(group));
    }
    return result;
}
function removeByIndices(array, indices, del, add) {
    if (indices.length === 0)
        return;
    const toDelete = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < array.length).sort((a, b) => b - a);
    let prev = -1;
    let len1 = array.length - 1;
    for (const idx of toDelete) {
        if (idx === prev)
            continue;
        prev = idx;
        const removed = array[idx];
        del(removed);
        if (idx < len1) {
            const last = array[len1];
            array[idx] = last;
            add(last, idx);
        }
        --len1;
    }
    array.length = len1 + 1;
}
function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
function intersection(first, second) {
    const secondSet = new Set(second);
    const result = [];
    const added = new Set();
    for (const item of first) {
        if (secondSet.has(item) && !added.has(item)) {
            result.push(item);
            added.add(item);
        }
    }
    return result;
}
class MapAsyncError extends Error {
    constructor(message, partialResults) {
        super(message);
        this.name = "MapAsyncError";
        this.partialResults = partialResults;
    }
}
async function mapAsync(array, callbackfn, concurrency = 0) {
    if (array.length === 0)
        return [];
    if (concurrency <= 0 || concurrency >= array.length) {
        return Promise.all(array.map((item, index) => callbackfn(item, index, array)));
    }
    const results = new Array(array.length);
    let currentIndex = 0;
    let activeTasks = 0;
    let isRejected = false;
    return new Promise((resolve, reject) => {
        const next = () => {
            while (!isRejected && activeTasks < concurrency && currentIndex < array.length) {
                const index = currentIndex++;
                const item = array[index];
                activeTasks++;
                Promise.resolve(callbackfn(item, index, array))
                    .then((result) => {
                    if (!isRejected)
                        results[index] = result;
                })
                    .catch((err) => {
                    if (!isRejected) {
                        isRejected = true;
                        reject(new MapAsyncError(err.message || "Task failed", results));
                    }
                })
                    .finally(() => {
                    activeTasks--;
                    if (!isRejected) {
                        if (currentIndex === array.length && activeTasks === 0) {
                            resolve(results);
                        }
                        else {
                            queueMicrotask(next);
                        }
                    }
                });
            }
        };
        next();
    });
}
if (!Array.prototype.uniqueBy) {
    Object.defineProperty(Array.prototype, "uniqueBy", {
        value: function (keySelector, strategy = "first") {
            return uniqueBy(this, keySelector, strategy);
        },
        writable: true,
        configurable: true,
        enumerable: false,
    });
}
if (!Array.prototype.groupBy) {
    Object.defineProperty(Array.prototype, "groupBy", {
        value: function (keySelector, em) {
            if (em) {
                return groupToMapEm(this, keySelector, em);
            }
            return groupToMap(this, keySelector);
        },
        writable: true,
        configurable: true,
        enumerable: false,
    });
}
if (!Array.prototype.removeByIndices) {
    Object.defineProperty(Array.prototype, "removeByIndices", {
        value: function (indices, del, add) {
            removeByIndices(this, indices, del, add);
        },
        writable: true,
        configurable: true,
        enumerable: false,
    });
}
if (!Array.prototype.shuffle) {
    Object.defineProperty(Array.prototype, "shuffle", {
        value: function () {
            return shuffle(this);
        },
        writable: true,
        configurable: true,
        enumerable: false,
    });
}
if (!Array.prototype.intersection) {
    Object.defineProperty(Array.prototype, "intersection", {
        value: function (other) {
            return intersection(this, other);
        },
        writable: true,
        configurable: true,
        enumerable: false,
    });
}
if (!Array.prototype.mapAsync) {
    Object.defineProperty(Array.prototype, "mapAsync", {
        value: function (callbackfn, concurrency = 0) {
            return mapAsync(this, callbackfn, concurrency);
        },
        writable: true,
        configurable: true,
        enumerable: false,
    });
}
