import { User } from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';

export async function signup(req, res, next) {
  // TODO:
  // Hint: validate already ran (see routes). Pull { username, email, password, displayName } from req.body.
  // Check duplicate email/username -> 409. Hash password with User.hashPassword, create user,
  // signToken(user), respond 201 { token, user }. toJSON strips passwordHash automatically.
  // Mongo duplicate-key errors (err.code === 11000) must also become 409.
  // See: docs/API.md "POST /api/auth/signup", tester/tests/auth.test.js

  try {
    const { username, email, password, displayName } = req.body;

    // Pre-check for duplicates before hitting the DB unique index.
    // We check both fields explicitly so we can give a clear 409 message.
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      // Don't leak which field collided — just 409
      throw new HttpError(409, 'Email or username already in use');
    }

    // Hash the plain-text password before storing — bcrypt cost 10 (defined in User.hashPassword)
    const passwordHash = await User.hashPassword(password);

    // Create the user document — passwordHash is stored, never the raw password
    const user = await User.create({ username, email, passwordHash, displayName });

    // Sign a JWT for the new user — sub = user.id (the string form of _id)
    const token = signToken(user);

    // toJSON transform (defined in User.js) strips passwordHash and maps _id→id automatically
    // so res.json(user) is safe — passwordHash never reaches the client
    res.status(201).json({ token, user });
  } catch (err) {
    // MongoDB duplicate key error (race condition — another request created the same user
    // between our findOne check above and the User.create call)
    if (err.code === 11000) {
      return next(new HttpError(409, 'Email or username already in use'));
    }
    next(err); // pass HttpError or unexpected errors to errorHandler
  }
}

export async function login(req, res, next) {
  // TODO:
  // Hint: find user by email. If missing OR comparePassword fails, 401 with a GENERIC message
  // (don't leak which half was wrong). On success return { token, user }.
  // See: docs/API.md "POST /api/auth/login", tester/tests/auth.test.js

  try {
    const { email, password } = req.body;

    // Look up the user by email — we need passwordHash to compare, so don't exclude it here
    const user = await User.findOne({ email });

    // Use a single generic message for both "user not found" and "wrong password"
    // — never tell the client which half failed (prevents user enumeration attacks)
    const INVALID_MSG = 'Invalid email or password';

    if (!user) {
      throw new HttpError(401, INVALID_MSG);
    }

    // comparePassword is an instance method defined in User.js — uses bcrypt.compare internally
    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      throw new HttpError(401, INVALID_MSG);
    }

    // Credentials are valid — issue a JWT and return the private user projection
    const token = signToken(user);

    // toJSON strips passwordHash automatically before serialization
    res.status(200).json({ token, user });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  // TODO:
  // Hint: authenticate middleware has already attached the user — just return it.
  // See: docs/API.md "GET /api/auth/me", tester/tests/auth.test.js

  // req.user was attached by the authenticate middleware after verifying the JWT.
  // toJSON strips passwordHash automatically — safe to return directly.
  // This is the private projection (includes email) since only the owner can reach this route.
  res.json(req.user);
}