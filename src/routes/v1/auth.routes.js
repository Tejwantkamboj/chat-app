import { Router } from "express";
import { login, register } from "../../controllers/auth.controller.js";
import validate from "../../middlewares/validate.js";
import {
  registerSchema,
  loginSchema,
} from "../../validation/auth.validation.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);

export default router;
