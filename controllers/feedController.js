import { Question } from '../models/Question.js';
import { User } from '../models/User.js';

export async function listGlobalFeed(req, res, next) {
  // TODO:
  // Hint: filter status='answered', visibility='public'.
  // Optional ?tag=xxx: first find user ids with that tag (User.find({tags: xxx}).distinct('_id')),
  //   then add recipient: { $in: ids } to the filter. If no users match, return empty page.
  // Populate recipient with: username displayName avatarUrl tags.
  // Sort answeredAt desc. Pagination envelope { data, page, limit, total, totalPages }.
  // See: docs/API.md "GET /api/feed", tester/tests/global-feed.test.js

  try {
    // Base filter — only answered public questions appear in the global feed
    const filter = {
      status: 'answered',
      visibility: 'public', // bonus: private answers are hidden from global feed too
    };

    // Optional tag filter — ?tag=xxx narrows to questions whose recipient has that tag
    if (req.query.tag) {
      // Find all user ids that have this tag in their tags array
      // .distinct() returns a flat array of unique _id values — more efficient than .find()
      const userIds = await User.distinct('_id', { tags: req.query.tag });

      if (userIds.length === 0) {
        // No users have this tag — return an empty page immediately without hitting questions collection
        return res.json({ data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
      }

      // Narrow the filter to only questions from those users
      filter.recipient = { $in: userIds };
    }

    // Parse pagination with same defaults as other endpoints
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Run count and data queries in parallel
    const [total, rawData] = await Promise.all([
      Question.countDocuments(filter),
      Question.find(filter)
        .sort({ answeredAt: -1 }) // most recently answered first across the whole site
        .skip(skip)
        .limit(limit)
        // Populate the recipient field with ONLY the safe public fields — never email or passwordHash
        .populate('recipient', 'username displayName avatarUrl tags'),
    ]);

    // Map to plain objects and enforce the minimal recipient projection.
    // Even though .populate() only selected the 4 allowed fields, we sanitize defensively.
    const data = rawData.map((q) => {
      const obj = q.toJSON();

      // Ensure the recipient sub-document only contains the 4 public fields.
      // populate already limits the fields, but this guarantees no _id/_v leakage.
      if (obj.recipient) {
        obj.recipient = {
          username: obj.recipient.username,
          displayName: obj.recipient.displayName,
          avatarUrl: obj.recipient.avatarUrl,
          tags: obj.recipient.tags,
        };
      }

      return obj;
    });

    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}