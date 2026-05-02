import { User } from "../model/index.js";
import { asyncHandler, sendResponse, ApiError } from "../utils/index.js";
import { tokenService } from "../services/index.js";
import httpStatus from 'http-status';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  
  if (await User.isEmailTaken(email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Email already taken");
  }
  const user = await User.create({ name, email, password });
  sendResponse(res, httpStatus.CREATED, "User registered successfully");
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isMatch = await user.isPasswordMatch(password);

  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }
  const token = await tokenService.generateAuthTokens(user);

  sendResponse(res, 200, "User logged in successfully", {
    user: user,
    tokens: token,
  });
});
