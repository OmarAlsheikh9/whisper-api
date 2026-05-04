import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { HttpError } from './errorHandler.js';

export async function authenticate(req, _res, next) {
  // TODO:
  // Hint: read Authorization: Bearer <token>. Verify with jwt.verify(token, JWT_SECRET).
  // Load User.findById(payload.sub). Attach to req.user. Any failure -> 401.
  // See: docs/API.md "Authentication", tester/tests/auth.test.js

  try {
    // 1. Read the Authorization header — expected format: "Bearer <token>"
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No header or wrong format — reject immediately
      throw new HttpError(401, 'Missing or malformed Authorization header');
    }

    // 2. Extract the raw JWT string after "Bearer "
    const token = authHeader.slice(7); // "Bearer " is 7 characters

    // 3. Verify the token signature and expiry using the secret from env
    // jwt.verify throws if the token is invalid, expired, or tampered with
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Load the user from DB using the subject claim (sub = user.id stored at sign time)
    // We use .select('-passwordHash') as an extra safety net, though toJSON also strips it
    const user = await User.findById(payload.sub);

    if (!user) {
      // Token was valid but the user no longer exists in the DB
      throw new HttpError(401, 'User not found');
    }

    // 5. Attach the full user document to req so controllers can access it (e.g. req.user.id)
    req.user = user;

    next(); // authentication passed — continue to the next middleware or controller
  } catch (err) {
    // If err is already an HttpError (e.g. missing header), pass it through
    // If it's a JWT error (JsonWebTokenError, TokenExpiredError), wrap it in 401
    if (err instanceof HttpError) {
      return next(err);
    }
    // jwt.verify throws JsonWebTokenError or TokenExpiredError on bad/expired tokens
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

export function signToken(user) {
  // TODO:
  // Hint: jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN || '7d' })

  // jwt.sign creates a signed JWT containing the payload { sub: user.id }
  // 'sub' (subject) is the standard JWT claim for the entity the token represents
  // expiresIn comes from env so it can be configured per environment (default '7d')
  return jwt.sign(
    { sub: user.id },                        // payload: who this token belongs to
    process.env.JWT_SECRET,                  // secret used to sign — must match verify
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }, // token lifetime
  );
}