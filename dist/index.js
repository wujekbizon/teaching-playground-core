"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeachingPlayground = void 0;
// Export interfaces
__exportStar(require("./interfaces/index"), exports);
__exportStar(require("./interfaces/event.interface"), exports);
__exportStar(require("./interfaces/user.interface"), exports);
__exportStar(require("./interfaces/errors.interface"), exports);
__exportStar(require("./interfaces/schema"), exports);
// Export systems
__exportStar(require("./systems/event/EventManagementSystem"), exports);
// Export utils
__exportStar(require("./utils/JsonDatabase"), exports);
// Export engine
var TeachingPlayground_1 = require("./engine/TeachingPlayground");
Object.defineProperty(exports, "TeachingPlayground", { enumerable: true, get: function () { return __importDefault(TeachingPlayground_1).default; } });
