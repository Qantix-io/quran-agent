import { createLogger, format, transports } from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: isDev
    ? format.combine(
        format.colorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} ${level}: ${message}${metaStr}`;
        }),
      )
    : format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

export default logger;
