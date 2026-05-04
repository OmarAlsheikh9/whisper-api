import { User } from '../models/User.js';
import { HttpError } from '../middleware/errorHandler.js';

export async function getPublicProfile(req, res, next) {
  // TODO:
  // Hint: User.findOne({ username }). 404 if missing. Exclude email + passwordHash from response.
  // See: docs/API.md "GET /api/users/:username", tester/tests/profile.test.js

  try {
    const { username } = req.params;

    // Exclude email and passwordHash from the query result:
    // - passwordHash: never sent to anyone (toJSON also strips it, but belt-and-suspenders)
    // - email: public projection must not include email (only owner gets it)
    const user = await User.findOne({ username }).select('-email -passwordHash');

    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    // toJSON maps _id → id and removes __v; email and passwordHash are already excluded by .select()
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req, res, next) {
  // TODO:
  // Hint: whitelist fields a user may update: displayName, bio, avatarUrl, acceptingQuestions, tags.
  // Silently IGNORE username / email even if sent — they are immutable here.
  // Use findByIdAndUpdate with { new: true, runValidators: true }.
  // See: docs/API.md "PATCH /api/users/me", tester/tests/profile.test.js

  try {
    // Whitelist: only these 5 fields may be updated through this endpoint.
    // We destructure only the allowed keys from req.body — any other key (username, email,
    // or anything unknown that .passthrough() let through the schema) is silently discarded.
    const { displayName, bio, avatarUrl, acceptingQuestions, tags } = req.body;

    // Build the update object with only the fields that were actually provided.
    // We must not set a field to undefined — MongoDB would leave it unchanged,
    // but it's cleaner to only include keys the client explicitly sent.
    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (bio !== undefined) updates.bio = bio;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (acceptingQuestions !== undefined) updates.acceptingQuestions = acceptingQuestions;
    if (tags !== undefined) updates.tags = tags;

    // findByIdAndUpdate options:
    //   new: true          → return the document AFTER the update (not the old version)
    //   runValidators: true → run Mongoose schema validators on the updated fields
    const user = await User.findByIdAndUpdate(
      req.user._id,   // the authenticated user's id (attached by authenticate middleware)
      updates,
      { new: true, runValidators: true },
    );

    if (!user) {
      // Extremely unlikely (user was deleted between authenticate and here), but handle it
      throw new HttpError(404, 'User not found');
    }

    // Return the full private projection (includes email since this is the owner)
    // toJSON strips passwordHash automatically
    res.json(user);
  } catch (err) {
    next(err);
  }
}