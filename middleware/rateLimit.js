import { RateLimitHit } from '../models/RateLimitHit.js';
import { HttpError } from './errorHandler.js';

export function rateLimit({ max, windowMs, keyFn }) {
  // rateLimit is a middleware factory — it returns a middleware function configured
  // with the given options:
  //   max      — maximum allowed requests in the window (e.g. 10)
  //   windowMs — window duration in milliseconds (e.g. 60 * 60 * 1000 for 1 hour)
  //   keyFn    — function(req) → string that uniquely identifies this rate-limit bucket
  //              e.g. "(ip, username)" so each sender+recipient pair has its own counter

  return async function rateLimitMiddleware(req, _res, next) {
    // TODO:
    // Hint: compute windowStart = floor(now / windowMs) * windowMs.
    // Use findOneAndUpdate with { upsert: true, new: true } and $inc: { count: 1 } on { key, windowStart }.
    // If returned count > max, throw HttpError(429). Otherwise next().
    // See: docs/API.md "Rate limiting", tester/tests/bonus-rate-limit.test.js

    try {
      // 1. Compute which time window we're currently in by flooring to the nearest windowMs boundary
      //    e.g. if windowMs = 3600000 (1 hr) and now = 13:42, windowStart = 13:00 exactly
      const now = Date.now();
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

      // 2. Build the unique key for this request bucket (e.g. "1.2.3.4:alice")
      const key = keyFn(req);

      // 3. Atomically find-or-create the counter document for (key, windowStart)
      //    and increment count by 1 in one DB operation — avoids race conditions
      //    upsert: true  → create the document if it doesn't exist yet
      //    new: true     → return the document AFTER the update (so we see the new count)
      const hit = await RateLimitHit.findOneAndUpdate(
        { key, windowStart },           // filter: this exact bucket
        { $inc: { count: 1 } },         // update: increment the counter
        { upsert: true, new: true },    // options: create if missing, return updated doc
      );

      // 4. If the count now exceeds the max, reject with 429 Too Many Requests
      //    Note: we check > max (not >=) because the increment already happened,
      //    so count === max+1 on the 11th request when max=10
      if (hit.count > max) {
        throw new HttpError(429, 'Too many requests — please slow down');
      }

      next(); // under the limit — allow the request through
    } catch (err) {
      next(err); // pass HttpError(429) or any unexpected DB error to the error handler
    }
  };
}

export function clientIp(req) {
  // TODO:
  // Hint: prefer x-forwarded-for (first IP before comma) — required behind proxies/serverless.
  // Fall back to req.socket.remoteAddress, then 'unknown'.

  // X-Forwarded-For can contain a comma-separated list when there are multiple proxies:
  // e.g. "203.0.113.5, 70.41.3.18, 150.172.238.178"
  // The first IP is the original client; the rest are intermediate proxies — we want the first
  const forwarded = req.headers['x-forwarded-for'];

  if (forwarded) {
    // Split on comma, trim whitespace, and take the first entry (the real client IP)
    return forwarded.split(',')[0].trim();
  }

  // Fallback: direct connection (no proxy) — use the raw socket address
  return req.socket?.remoteAddress || 'unknown';
}