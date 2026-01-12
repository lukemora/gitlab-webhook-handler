/**
 * 简单的日志工具
 * 可以用 winston、pino 或其他日志库替换
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLogLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
const levelValue = LOG_LEVELS[currentLogLevel] ?? LOG_LEVELS.INFO;

const formatMessage = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level}] ${message}${dataStr}`;
};

export const logger = {
  error: (message, data) => {
    if (levelValue >= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', message, data));
    }
  },

  warn: (message, data) => {
    if (levelValue >= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', message, data));
    }
  },

  info: (message, data) => {
    if (levelValue >= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', message, data));
    }
  },

  debug: (message, data) => {
    if (levelValue >= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', message, data));
    }
  },
};
