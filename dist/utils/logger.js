"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const isDev = process.env.NODE_ENV !== 'production';
const devFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.colorize({ all: true }), winston_1.default.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const base = `${timestamp} ${level}: ${stack ?? message}`;
    const keys = Object.keys(meta).filter((k) => k !== 'splat');
    if (keys.length === 0)
        return base;
    return `${base} ${JSON.stringify(meta)}`;
}));
const prodFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
exports.logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    format: isDev ? devFormat : prodFormat,
    transports: [new winston_1.default.transports.Console()],
});
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map