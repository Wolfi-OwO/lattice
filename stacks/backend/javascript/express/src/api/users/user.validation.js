import Joi from 'joi';

export const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(2).max(80).required(),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string().valid('user', 'admin').default('user'),
});

export const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(80),
  role: Joi.string().valid('user', 'admin'),
}).min(1);

export const listUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().allow('').default(''),
});
