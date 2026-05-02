import Joi from "joi";
import { objectId } from "./custom.validation.js";

export const paramIdValidation = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

export const listWithPagination = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    search: Joi.string().trim().allow("").optional(),
  }),
};
