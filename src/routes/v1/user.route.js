import { Router } from "express";
import authRoutes from "./auth.routes.js";
import authChecker from "../../middlewares/authChecker.js";
import { userList, getUserById } from "../../controllers/user.controller.js";
import validate from "../../middlewares/validate.js";
import {
  paramIdValidation,
  listWithPagination,
} from "../../validation/commonValidation.js";

const router = Router();
router.use(authChecker);

router.route("/").get(validate(listWithPagination), userList);
router.route("/:id").get(validate(paramIdValidation), getUserById);

export default router;
