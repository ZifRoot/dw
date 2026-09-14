"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const uuid_1 = require("../../shared/utils/uuid");
class User {
    constructor(data) {
        this.id = (0, uuid_1.normalizeUUID)(data.id) ?? crypto.randomUUID();
        this.name = data.name;
        this.credentials = data.credentials ?? null;
    }
}
exports.User = User;
