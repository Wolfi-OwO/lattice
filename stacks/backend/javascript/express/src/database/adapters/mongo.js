import mongoose from 'mongoose';
import {
  toPublicUser,
  toPublicUsers,
  toPublicProduct,
  toPublicProducts,
} from '../serialize.js';
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

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Integer cents, never a Double: binary floating point cannot hold 0.10
    // exactly, and money that drifts by a cent is a bug nobody can reproduce.
    priceCents: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

/** Mongo's `_id` is the only id the rest of the app is allowed not to know about. */
function productRow(doc) {
  if (!doc) return null;
  const o = doc.toObject({ virtuals: false });
  return {
    id: String(o._id),
    sku: o.sku,
    name: o.name,
    description: o.description,
    priceCents: o.priceCents,
    stock: o.stock,
    createdAt: o.createdAt?.toISOString(),
    updatedAt: o.updatedAt?.toISOString(),
  };
}

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
  const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);

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

  const products = {
    async list({ page, limit, q }) {
      const filter = q
        ? { $or: [{ name: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }] }
        : {};

      const [docs, total] = await Promise.all([
        Product.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Product.countDocuments(filter),
      ]);

      return { items: toPublicProducts(docs.map(productRow)), total };
    },

    async findById(id) {
      if (!isValidId(id)) return null;
      return toPublicProduct(productRow(await Product.findById(id)));
    },

    async findBySku(sku) {
      return toPublicProduct(productRow(await Product.findOne({ sku: String(sku).toUpperCase() })));
    },

    async create({ sku, name, description = '', priceCents, stock = 0 }) {
      const doc = await Product.create({ sku, name, description, priceCents, stock });
      return toPublicProduct(productRow(doc));
    },

    async update(id, patch) {
      if (!isValidId(id)) return null;
      const doc = await Product.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
      return toPublicProduct(productRow(doc));
    },

    async remove(id) {
      if (!isValidId(id)) return false;
      const result = await Product.findByIdAndDelete(id);
      return Boolean(result);
    },
  };

  return {
    users,
    products,
    close: () => mongoose.connection.close(),
  };
}
