import mongoose from 'mongoose';
import { toPublicUser, toPublicUsers } from '../serialize.js';
import { logger } from '../../utils/logger.js';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true },
);

/** Mongo's `_id` is the only id the rest of the app is allowed not to know about. */
function row(doc) {
  if (!doc) return null;
  const o = doc.toObject({ virtuals: false });
  return {
    id: String(o._id),
    email: o.email,
    name: o.name,
    role: o.role,
    passwordHash: o.passwordHash,
    createdAt: o.createdAt?.toISOString(),
    updatedAt: o.updatedAt?.toISOString(),
  };
}

/** A malformed ObjectId would throw a CastError; a miss should just be a 404. */
const isValidId = (id) => mongoose.isValidObjectId(id);

export async function createAdapter({ url }) {
  mongoose.set('strictQuery', true);

  // mongoose.connection is an EventEmitter: a post-connect failure emits `error`,
  // and unhandled, it takes the process down. Log instead — the driver retries,
  // and /api/health/readiness reports 503 in the meantime.
  mongoose.connection.on('error', (error) => {
    logger.error(`mongodb connection error: ${error.message}`);
  });

  await mongoose.connect(url);

  const User = mongoose.models.User ?? mongoose.model('User', userSchema);

  const users = {
    async list({ page, limit, q }) {
      const filter = q
        ? { $or: [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }] }
        : {};

      const [docs, total] = await Promise.all([
        User.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        User.countDocuments(filter),
      ]);

      return { items: toPublicUsers(docs.map(row)), total };
    },

    async findById(id) {
      if (!isValidId(id)) return null;
      return toPublicUser(row(await User.findById(id)));
    },

    async findByEmail(email, { withPasswordHash = false } = {}) {
      const query = User.findOne({ email: String(email).toLowerCase() });
      if (withPasswordHash) query.select('+passwordHash');

      const doc = await query;
      if (!doc) return null;

      const full = row(doc);
      return withPasswordHash ? full : toPublicUser(full);
    },

    async create(data) {
      const doc = await User.create(data);
      return toPublicUser(row(doc));
    },

    async update(id, patch) {
      if (!isValidId(id)) return null;
      const doc = await User.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
      return toPublicUser(row(doc));
    },

    async remove(id) {
      if (!isValidId(id)) return false;
      return Boolean(await User.findByIdAndDelete(id));
    },
  };

  return {
    users,
    close: () => mongoose.connection.close(),
  };
}
