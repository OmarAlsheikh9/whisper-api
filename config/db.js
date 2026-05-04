import mongoose from 'mongoose';

/**
 * WHY THIS PATTERN?
 * =================
 * In SERVERLESS environments (Vercel, Netlify, AWS Lambda), functions can spin up and down.
 * Without caching: Each COLD START creates a NEW database connection (slow - 200ms+)
 * With caching: WARM STARTS REUSE existing connection (fast - 5ms)
 * 
 * globalThis = Shared memory that MIGHT survive between function calls (for warm starts)
 * _mongoose = Just a variable name (using _ to show it's internal/private)
 */

// STEP 1: Try to get existing cache from global memory
let cached = globalThis._mongoose;

// STEP 2: If no cache exists yet (FIRST TIME EVER or COLD START)
// Create a new cache object with empty placeholders
// conn = will store the actual database connection
// promise = will store the connection attempt (prevents race conditions)
if (!cached) cached = globalThis._mongoose = { conn: null, promise: null };

export async function connectDB() {
  
  // STEP 3: FAST PATH - If we ALREADY have a connection
  // This is the magic! Reuse existing connection instead of creating new one
  // Happens on: WARM STARTS (function was called recently)
  // Result: SUPER FAST (5ms instead of 200ms)
  if (cached.conn) return cached.conn;
  
  // STEP 4: SLOW PATH BUT AVOIDS RACE CONDITIONS
  // If we're NOT already trying to connect (no pending promise)
  // This prevents 100 simultaneous calls from creating 100 connections
  if (!cached.promise) {
    
    // Get database connection string from environment variables
    const uri = process.env.MONGODB_URI;
    
    // Safety check - don't try to connect if no URI provided
    if (!uri) throw new Error('MONGODB_URI is not set');
    
    // START CONNECTING but DON'T WAIT yet (store the promise)
    // bufferCommands: false = Don't queue commands if disconnected (fail fast)
    // This is better for serverless (fail immediately instead of waiting)
    cached.promise = mongoose.connect(uri, { bufferCommands: false });
  }
  
  // STEP 5: WAIT for the connection to complete
  // If we just started it (STEP 4), this waits for it
  // If another call already started it, this waits for THAT promise
  // Result: Only ONE connection ever created, even with 100 simultaneous calls
  cached.conn = await cached.promise;
  
  // STEP 6: Return the connection (now it's cached for NEXT time)
  return cached.conn;
}

/**
 * QUICK MEMORY AID:
 * =================
 * 1st call (COLD START):  Creates connection (SLOW - 200ms)
 * 2nd call (WARM START):  Returns cached.conn (FAST - 5ms) ⚡
 * 100 calls at same time: Only ONE connection created (others wait)
 * 
 * WITHOUT this pattern (in serverless):
 * - Every cold start = new connection = SLOW + connection limit issues
 * 
 * WITH this pattern:
 * - Reuse connection across warm starts = FAST + efficient
 */

/**
 * VISUAL FLOW:
 * ============
 * connectDB() called
 *        ↓
 * cached.conn exists? ────YES────→ RETURN IT (FAST PATH) 🚀
 *        ↓ NO
 *        ↓
 * cached.promise exists? ────YES────→ WAIT FOR IT (RACE CONDITION PROTECTION)
 *        ↓ NO
 *        ↓
 * CREATE NEW CONNECTION (SLOW PATH) 🐢
 *        ↓
 * Store promise → Wait for it → Store connection → Return connection
 *        ↓
 * NEXT TIME: cached.conn exists → FAST PATH 🚀
 */

/**
 * REAL WORLD EXAMPLE:
 * ===================
 * // API Route in Next.js (serverless)
 * export async function GET(request) {
 *   await connectDB();  // First call: slow, subsequent calls: fast
 *   const users = await User.find({});
 *   return Response.json(users);
 * }
 * 
 * // Without caching: Every cold restart = 200ms delay
 * // With caching: After first call = 5ms delay
 */