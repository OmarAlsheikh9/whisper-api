import { Question } from '../models/Question.js';
import { User } from '../models/User.js';
import { HttpError } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';

// Helper — returns true if str is a valid MongoDB ObjectId string (24 hex chars).
// Used to catch bad :id params before Mongoose throws a CastError (which becomes a 500).
function isValidObjectId(str) {
  return mongoose.Types.ObjectId.isValid(str);
}

export async function sendQuestion(req, res, next) {
  // TODO:
  // Hint: find recipient by :username. 404 if missing, 403 if acceptingQuestions === false.
  // Create Question { recipient: recipient._id, body }. Respond 201 WITHOUT recipient field
  // (anonymous send — do not leak sender OR recipient id in the echo).
  // See: docs/API.md "POST /api/users/:username/questions", tester/tests/send-question.test.js

  try {
    const { username } = req.params;
    const { body } = req.body;

    // Find the recipient user by username
    const recipient = await User.findOne({ username });

    if (!recipient) {
      throw new HttpError(404, 'User not found');
    }

    // Check if the recipient is accepting questions — 403 if they've turned it off
    if (!recipient.acceptingQuestions) {
      throw new HttpError(403, 'This user is not accepting questions');
    }

    // Create the question — no sender stored anywhere (fully anonymous by design)
    const question = await Question.create({
      recipient: recipient._id,
      body,
    });

    // Build the response manually — we must NOT include the recipient field.
    // The spec says: "Response MUST NOT leak sender or recipient id in the echo."
    // We use question.toJSON() to get id/_id mapping, then delete recipient explicitly.
    const responseData = question.toJSON();
    delete responseData.recipient; // strip recipient id — the URL already identifies the user

    res.status(201).json(responseData);
  } catch (err) {
    next(err);
  }
}

export async function listInbox(req, res, next) {
  // TODO:
  // Hint: filter { recipient: req.user._id }. Optional ?status=pending|answered|ignored (else 400).
  // Pagination: page (default 1, min 1), limit (default 20, min 1, max 50).
  // Sort createdAt desc. Envelope: { data, page, limit, total, totalPages }.
  // See: docs/API.md "GET /api/questions/inbox", tester/tests/inbox.test.js

  try {
    // Build the base filter — only questions belonging to the authenticated user
    const filter = { recipient: req.user._id };

    // Optional status filter — must be one of the valid enum values
    const VALID_STATUSES = ['pending', 'answered', 'ignored'];
    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        throw new HttpError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      filter.status = req.query.status;
    }

    // Parse and clamp pagination params with safe defaults
    const page = Math.max(1, parseInt(req.query.page) || 1);              // min 1, default 1
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20)); // 1-50, default 20
    const skip = (page - 1) * limit; // number of documents to skip for this page

    // Run count and data queries in parallel for efficiency
    const [total, data] = await Promise.all([
      Question.countDocuments(filter),
      Question.find(filter)
        .sort({ createdAt: -1 }) // newest first
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      data,                                        // array of question documents
      page,
      limit,
      total,                                       // total matching documents (for client pagination)
      totalPages: Math.ceil(total / limit),        // how many pages exist in total
    });
  } catch (err) {
    next(err);
  }
}

// Helper — loads a question by id and verifies the requesting user owns it.
// Returns the question doc on success.
// Throws 404 if id is invalid or not found, 403 if the authenticated user is not the recipient.
async function getOwnedQuestion(id, userId) {
  // TODO:
  // Hint: load by id -> 404 if missing -> 403 if recipient !== userId.
  // Compare as strings (ObjectId). Returns the question doc.

  // Guard against invalid ObjectId strings — Mongoose throws a CastError (-> 500) without this check.
  // We convert it to a clean 404 so the tester never sees a 500 for a bad id param.
  if (!isValidObjectId(id)) {
    throw new HttpError(404, 'Question not found');
  }

  const question = await Question.findById(id);

  if (!question) {
    throw new HttpError(404, 'Question not found');
  }

  // Compare as strings — ObjectId.equals() also works, but string comparison is simpler
  // and avoids any type mismatch between ObjectId and string id from the JWT payload
  if (question.recipient.toString() !== userId.toString()) {
    throw new HttpError(403, 'You do not have permission to access this question');
  }

  return question;
}

export async function answerQuestion(req, res, next) {
  // TODO:
  // Hint: use getOwnedQuestion for 404/403. Set answer, answeredAt=now, status='answered'.
  // If body has visibility, apply it. Save + return the question.
  // See: docs/API.md "POST /api/questions/:id/answer", tester/tests/answer.test.js

  try {
    const question = await getOwnedQuestion(req.params.id, req.user._id);

    const { answer, visibility } = req.body;

    // Set the answer fields — answeredAt records when it was answered
    question.answer = answer;
    question.answeredAt = new Date();
    question.status = 'answered'; // answering always moves the question to 'answered' status

    // visibility is a bonus field — only apply it if provided
    if (visibility !== undefined) {
      question.visibility = visibility;
    }

    await question.save(); // persist changes and run schema validators

    res.json(question);
  } catch (err) {
    next(err);
  }
}

export async function updateQuestion(req, res, next) {
  // TODO:
  // Hint: ownership check. Accept any of answer / status / visibility. If answer provided,
  // also set answeredAt + status='answered'. Save + return.
  // See: docs/API.md "PATCH /api/questions/:id", tester/tests/answer.test.js

  try {
    const question = await getOwnedQuestion(req.params.id, req.user._id);

    const { answer, status, visibility } = req.body;
    // Note: validation schema already ensures at least one field is present (updateQuestionSchema refine)

    // Apply whichever fields were provided
    if (answer !== undefined) {
      question.answer = answer;
      // When an answer is provided (or updated), also record the timestamp and mark as answered
      question.answeredAt = new Date();
      question.status = 'answered';
    }

    // status can be set independently (e.g. marking as 'ignored') unless answer was also sent.
    // If both answer and status are sent, answer wins and forces status='answered' above.
    if (status !== undefined && answer === undefined) {
      question.status = status;
    }

    if (visibility !== undefined) {
      question.visibility = visibility;
    }

    await question.save();

    res.json(question);
  } catch (err) {
    next(err);
  }
}

export async function removeQuestion(req, res, next) {
  // TODO:
  // Hint: ownership check, deleteOne, 204 no content.
  // See: docs/API.md "DELETE /api/questions/:id", tester/tests/answer.test.js

  try {
    const question = await getOwnedQuestion(req.params.id, req.user._id);

    // deleteOne on the document instance — removes this specific document from the collection
    await question.deleteOne();

    // 204 No Content — success with no body (tester accepts 200 or 204)
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listPublicFeed(req, res, next) {
  // TODO:
  // Hint: find user by :username (404 if missing). Filter questions:
  //   recipient=user._id, status='answered', visibility='public'.
  // Exclude recipient field from response. Sort answeredAt desc. Same pagination envelope as inbox.
  // See: docs/API.md "GET /api/users/:username/questions", tester/tests/public-feed.test.js

  try {
    const { username } = req.params;

    // First verify the user exists — return 404 if not (even if they have no questions)
    const user = await User.findOne({ username });
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    // Only show answered + public questions (private answers are hidden from all public feeds)
    const filter = {
      recipient: user._id,
      status: 'answered',
      visibility: 'public', // bonus: private answers are excluded
    };

    // Parse pagination with same defaults as inbox
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [total, rawData] = await Promise.all([
      Question.countDocuments(filter),
      Question.find(filter)
        .sort({ answeredAt: -1 }) // most recently answered first
        .skip(skip)
        .limit(limit)
        .select('-recipient'), // exclude recipient field — username is already in the URL
    ]);

    // Convert to plain objects so we can delete recipient if it somehow survived .select()
    const data = rawData.map((q) => {
      const obj = q.toJSON();
      delete obj.recipient; // belt-and-suspenders — never leak recipient in this response
      return obj;
    });

    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}