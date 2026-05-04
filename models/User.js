import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: /^[a-zA-Z0-9_]+$/,
      immutable: true, // username can never be changed after creation
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // always stored in lowercase so "User@Ex.com" == "user@ex.com"
      trim: true,
    },
    passwordHash: { type: String, required: true }, // we never store the raw password, only the bcrypt hash
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    bio: { type: String, default: '', maxlength: 200 },
    avatarUrl: { type: String, default: '' },
    acceptingQuestions: { type: Boolean, default: true }, // owner can toggle this off to stop receiving questions
    tags: {
      type: [String],
      default: [],
      validate: {
        // custom validator: max 10 tags, each must be a lowercase slug (e.g. "web-dev", "ai")
        validator: (arr) =>
          arr.length <= 10 && arr.every((t) => /^[a-z0-9-]{2,20}$/.test(t)),
        message: 'Invalid tags',
      },
    },
  },
  { timestamps: true }, // automatically adds createdAt and updatedAt fields
);

userSchema.set('toJSON', {
  virtuals: true,   // include virtual fields (like the 'id' virtual Mongoose adds)
  versionKey: false, // remove the __v field Mongoose adds for versioning
  transform(_doc, ret) {
    // TODO:
    // Hint: map _id -> id, delete _id, delete passwordHash. Return ret.
    // Purpose: never leak passwordHash through res.json.

    ret.id = ret._id;       // copy _id to id so the response uses the friendlier "id" key
    delete ret._id;         // remove the original _id key to avoid duplication
    delete ret.passwordHash; // CRITICAL: never send the hashed password to any client
    return ret;             // return the cleaned object — this is what res.json() will serialize
  },
});

userSchema.methods.comparePassword = function (plain) {
  // TODO:
  // Hint: bcrypt.compare(plain, this.passwordHash) — returns a Promise<boolean>.

  // bcrypt.compare hashes 'plain' with the same salt used to create this.passwordHash
  // and returns true if they match — used during login to verify the entered password
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
  // TODO:
  // Hint: bcrypt.hash(plain, 10). Cost 10 is a reasonable default.

  // bcrypt.hash takes the plain password and a salt rounds number (10 = ~100ms, good balance
  // of security vs speed). Returns a Promise<string> with the resulting hash to store in DB.
  return bcrypt.hash(plain, 10);
};

export const User = mongoose.model('User', userSchema);