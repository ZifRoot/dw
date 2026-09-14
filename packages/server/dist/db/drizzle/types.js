"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bytea = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.bytea = (0, pg_core_1.customType)({
    dataType() {
        return "bytea";
    },
    toDriver(val) {
        let newVal = val;
        if (val.startsWith("0x")) {
            newVal = val.slice(2);
        }
        return Buffer.from(newVal, "hex");
    },
    fromDriver(val) {
        if (Buffer.isBuffer(val)) {
            return val.toString("hex");
        }
        return val;
    },
});
