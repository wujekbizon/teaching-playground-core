"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemError = void 0;
class SystemError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'SystemError';
    }
}
exports.SystemError = SystemError;
