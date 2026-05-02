import { User } from "../model/index.js";
import { asyncHandler, sendResponse, ApiError } from "../utils/index.js";
import httpStatus from "http-status";

const userList = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;

  const filter = { _id: { $ne: req.user.id } };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [users, totalResults] = await Promise.all([
    User.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    User.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalResults / limit) || 1;

  const data = {
    results: users,
    pagination: {
      currentPage: page,
      limit: limit,
      totalPages,
      totalResults,
    },
  };

  sendResponse(res, httpStatus.OK, "Users retrieved successfully", data);
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }
  sendResponse(res, httpStatus.OK, "User retrieved successfully", user);
});

export { userList, getUserById };
