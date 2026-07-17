import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'accessToken';
export const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Shared cookie attributes for set and clear (must stay in sync). */
function getAccessCookieBaseOptions(): CookieOptions {
  const production = isProduction();
  return {
    httpOnly: true,
    path: '/',
    secure: production,
    sameSite: production ? 'none' : 'lax',
  };
}

export function getAccessCookieOptions(): CookieOptions {
  return {
    ...getAccessCookieBaseOptions(),
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

export function getClearAccessCookieOptions(): CookieOptions {
  return getAccessCookieBaseOptions();
}
