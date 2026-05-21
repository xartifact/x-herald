/** 应用版本，构建时注入，默认 'dev' */
export const APP_VERSION = process.env.APP_VERSION ?? 'dev';

/** Cron 任务鉴权密钥，未配置则为空字符串 */
export const CRON_SECRET = process.env.CRON_SECRET ?? '';

/** 当前运行环境 */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

/** 是否强制开启日志自动清理（生产环境始终开启） */
export const ENABLE_LOG_CLEANUP = process.env.ENABLE_LOG_CLEANUP === 'true';
