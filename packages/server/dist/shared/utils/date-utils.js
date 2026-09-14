"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.format = exports.ItemWithFormattedDate = void 0;
exports.formatDate = formatDate;
exports.toDate = toDate;
exports.dateStr = dateStr;
exports.getHighResTime = getHighResTime;
function formatDate(date) {
    if (date == null)
        return {
            timestamp: 0,
            isoString: "",
            formatted: "",
        };
    return {
        timestamp: date.getTime() / 1000,
        isoString: date.toISOString(),
        formatted: date.toLocaleString("ru-RU"),
    };
}
class ItemWithFormattedDate {
    constructor(item) {
        this.id = item.id;
        this.title = item.title;
        this.title_type = item.title_type;
        this.pinned = item.pinned;
        this.updated_at = formatDate(item.updated_at);
    }
}
exports.ItemWithFormattedDate = ItemWithFormattedDate;
function toDate(value) {
    if (value === null || value === undefined)
        return null;
    if (value instanceof Date)
        return isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") {
        if (value < 0)
            return null;
        const asSeconds = new Date(value * 1000);
        const currentYearPlus5 = new Date().getFullYear() + 5;
        const date = asSeconds.getFullYear() <= currentYearPlus5 ? asSeconds : new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "string") {
        return parseStringToDate(value);
    }
    return null;
}
function parseStringToDate(str) {
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
    if (isoRegex.test(str)) {
        const date = new Date(str);
        if (!isNaN(date.getTime()))
            return date;
    }
    const dateOnlyRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const matchDateOnly = str.match(dateOnlyRegex);
    if (matchDateOnly) {
        const [, year, month, day] = matchDateOnly;
        const date = new Date(Date.UTC(+year, +month - 1, +day));
        if (!isNaN(date.getTime()))
            return date;
    }
    const datetimeRegex = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;
    const matchDatetime = str.match(datetimeRegex);
    if (matchDatetime) {
        const [, year, month, day, hour, minute, second, msPart] = matchDatetime;
        let ms = 0;
        if (msPart)
            ms = parseInt(msPart.padEnd(3, "0").slice(0, 3), 10);
        const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, ms));
        if (!isNaN(date.getTime()))
            return date;
    }
    const usRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const matchUs = str.match(usRegex);
    if (matchUs) {
        const [, month, day, year] = matchUs;
        const date = new Date(Date.UTC(+year, +month - 1, +day));
        if (!isNaN(date.getTime()))
            return date;
    }
    if (/^\d+$/.test(str)) {
        const num = Number(str);
        if (!isNaN(num)) {
            return toDate(+num);
        }
    }
    return null;
}
function dateStr(value) {
    return toDate(value)?.toLocaleString("ru-RU", exports.format) ?? "";
}
exports.format = {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
};
function getHighResTime() {
    const now = new Date();
    const micro = (performance.now() % 1).toFixed(3).substring(2);
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}${micro}`;
}
