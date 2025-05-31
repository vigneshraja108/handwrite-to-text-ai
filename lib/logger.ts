import * as logfire from 'logfire';

let isLogfireConfigured = false;

if (!isLogfireConfigured) {
  logfire.configure({
    token: process.env.LOGGER_API_KEY,
    serviceName: process.env.LOG_SERVICE_NAME,
    serviceVersion: '1.0.0',
  });
  isLogfireConfigured = true;
}

export const log = (
  level: 'info' | 'warn' | 'error',
  message: string,
  tags: string[] = [],
  extra: Record<string, any> = {}
) => {
  const common = { tags: ['api', ...tags] };

  switch (level) {
    case 'info':
      logfire.info(message, extra, common);
      break;
    case 'warn':
      logfire.info(`WARN: ${message}`, extra, { tags: ['warn', ...common.tags] });
      break;
    case 'error':
      logfire.error(message, extra, { tags: ['error', ...common.tags] });
      break;
  }

  console.log(`[${level.toUpperCase()}] ${message}`);
};
