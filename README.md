# Whisper — Anonymous Q&A API

A minimalist, robust, and serverless-ready anonymous Q&A API (similar to ask.fm or NGL). Users can sign up, share their public profile link, and receive anonymous questions that they can selectively answer publicly.

## Features

- **Stateless Authentication:** Secure JWT-based authentication without session dependencies.
- **Robust Validation:** All incoming requests are strictly validated using `Zod`.
- **Serverless Ready:** MongoDB connection pooling is optimized for serverless environments (e.g., Deno Deploy, Vercel) through intelligent connection caching.
- **Advanced Rate Limiting:** A custom, MongoDB-backed rate limiting implementation prevents spam and abuse for anonymous endpoints, overcoming the limitations of in-memory rate limiters in edge environments.
- **Security Best Practices:** Passwords are securely hashed with `bcryptjs`. Data leaks are prevented using Mongoose schema transforms to automatically strip sensitive data (like `passwordHash`) from all JSON responses.
- **Privacy Controls:** Includes an exclusive private-answer feature, ensuring that specific answered questions only appear in the user's personal inbox and not on global or public feeds.

## Tech Stack

- **Runtime:** Node.js 20+ (ES Modules)
- **Framework:** Express 5
- **Database:** MongoDB with Mongoose ODM
- **Validation:** Zod
- **Authentication:** jsonwebtoken (JWT) + bcryptjs
- **Other:** cors, morgan, dotenv

## Getting Started

### Prerequisites

- Node.js (v20 or higher)
- MongoDB (Local instance or MongoDB Atlas URI)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd whisper-api-main
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and configure your environment variables:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/whisper
   JWT_SECRET=your_super_secret_jwt_key
   JWT_EXPIRES_IN=7d
   ```

4. **Start the server:**
   ```bash
   # Production mode
   npm start
   
   # Development mode (with file watching)
   npm run dev
   ```

## Testing

This project includes a comprehensive, zero-dependency `node:test` suite that tests all API requirements, including rate limiting and access controls.

To run the test suite locally against the running server:

```bash
npm run test:api
```

You can also run tests against a deployed URL:

```bash
npm run test:api -- https://your-deployed-url.com
```

## API Reference

### Authentication
- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Authenticate and receive a JWT
- `GET /api/auth/me` - Get current authenticated user details

### Users & Profiles
- `GET /api/users/:username` - Get a user's public profile
- `PATCH /api/users/me` - Update current user profile details (bio, tags, accepting questions)

### Questions
- `POST /api/users/:username/questions` - Send an anonymous question to a user
- `GET /api/questions/inbox` - View your inbox of received questions
- `POST /api/questions/:id/answer` - Answer a question in your inbox
- `PATCH /api/questions/:id` - Update a question's status or visibility
- `DELETE /api/questions/:id` - Delete a question

### Feeds
- `GET /api/users/:username/questions` - View a user's publicly answered questions
- `GET /api/feed` - View the global feed of all public answered questions (filterable by tag)

## Project Structure

```
whisper/
├── config/
│   └── db.js                 # Serverless-ready MongoDB connection caching
├── controllers/              # Request handlers and business logic
├── middleware/               # Auth, validation, error handling, and rate limiting
├── models/                   # Mongoose schemas (User, Question, RateLimitHit)
├── routes/                   # Express router definitions
├── tester/                   # Comprehensive HTTP black-box test suite
├── validations/              # Zod schemas for request bodies
├── server.js                 # Main application entry point
└── package.json
```
