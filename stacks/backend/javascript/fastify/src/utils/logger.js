import winston from 'winston';
import { config } from '../config/index.js';

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${message}${rest}`;
  }),
);

export const logger = winston.createLogger({
  level: config.logLevel,
  format: config.isProduction
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : devFormat,
  transports: [new winston.transports.Console({ silent: config.isTest })],
});
