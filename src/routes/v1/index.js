import { Router } from "express";
const router = Router();
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.route.js";

const defaultRoutes = [
  {
    path: "/auth",
    route: authRoutes,
  },
  {
    path: "/users",
    route: userRoutes,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
