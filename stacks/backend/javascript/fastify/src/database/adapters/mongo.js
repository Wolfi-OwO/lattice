import mongoose from 'mongoose';
import { toPublicUser, toPublicUsers, toPublicProduct, toPublicProducts } from '../serialize.js';
import { logger } from '../../utils/logger.js';
import { user, product } from '../../models/index.js';

/**
 * The Mongoose schema, derived from the same model the SQL adapters read.
 *
 * Mongo needs no migration, so it would have been easy to leave a hand-written
 * schema here and let it drift from the tables — the drift would not surface
 * until someone switched storage and found a field missing. Deriving it means
 * a field added to the model reaches every storage at once, which is the
 * property the models directory exists to buy.
 */
const MONGO_TYPE = { string: String, enum: String, integer: Number };

function mongoField(spec) {
  const field = { type: MONGO_TYPE[spec.type] };

  if (spec.required) field.required = true;
  if (spec.unique) field.unique = true;
  if (spec.lowercase) field.lowercase = true;
  if (spec.uppercase) field.uppercase = true;
  if (spec.trim) field.trim = true;
  if (spec.values) field.enum = spec.values;
  if (spec.default !== undefined) field.default = spec.default;
  if (spec.min !== undefined) field.min = spec.min;
  /*
   * Never loaded unless a query asks for it by name, so a stray find() cannot
   * put a password hash somewhere it was not meant to go.
   */
  if (spec.secret) field.select = false;

  return field;
}

/**
 * `id` is Mongo's `_id` and the timestamps are Mongoose's own, so neither is
 * declared as a field — declaring them would shadow what the driver provides.
 */
function schemaOf(model) {
  const definition = Object.fromEntries(
    Object.entries(model.FIELDS)
      .filter(([, spec]) => spec.type !== 'id' && spec.type !== 'timestamp')
      .map(([field, spec]) => [field, mongoField(spec)]),
  );

  return new mongoose.Schema(definition, { timestamps: true });
}

const userSchema = schemaOf(user);
const productSchema = schemaOf(product);

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

  /*
   * mongoose.connection is an EventEmitter: a post-connect failure emits `error`,
   * and unhandled, it takes the process down. Log instead — the driver retries,
   * and /api/health/readiness reports 503 in the meantime.
   */
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
