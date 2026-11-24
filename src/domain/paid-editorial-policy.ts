/** Shared paid Terra comparison and certified live editorial limits.
 * Keep the provider deadline shorter than both function runtimes so validation,
 * billing settlement and saving the article finish. Never used by World Lock.
 */
export const TERRA_PREVIEW_TIMEOUT_MS=150_000;
export const ADMIN_PREVIEW_MAX_DURATION_SECONDS=180;
export const TERRA_DAILY_PREVIEW_ATTEMPTS=4;
export const TERRA_DAILY_TOKEN_BUDGET=50_000;
export const TERRA_PER_REQUEST_TOKEN_BUDGET=25_000;
