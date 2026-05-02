import jwt from "jsonwebtoken";
import moment from "moment";
import envConfig from "../config/envConfig.js";

const generateToken = async (user, type) => {
  let expires;

  if (type === "access") {
    expires = moment().add(envConfig.jwt.accessExpirationMinutes, "minutes");
  } else if (type === "refresh") {
    expires = moment().add(envConfig.jwt.refreshExpirationDays, "days");
  } else {
    expires = moment().add(envConfig.jwt.accessExpirationMinutes, "minutes");
  }

  const payload = {
    sub: user.id,
    iat: moment().unix(),
    exp: expires.unix(),
    type,
    role: user.role,
  };

  const token = jwt.sign(payload, envConfig.jwt.secret);
  const date = expires.toDate();
  return { token, date, type };
};

const generateAuthTokens = async (user) => {
  const accessToken = await generateToken(user, "access");
  const refreshToken = await generateToken(user, "refresh");

  return {
    access: {
      token: accessToken.token,
      expires: accessToken.date,
    },
    refresh: {
      token: refreshToken.token,
      expires: refreshToken.date,
    },
  };
};

export default {
  generateAuthTokens,
  generateToken,
};
