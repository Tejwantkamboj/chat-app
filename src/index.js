import mongoose from "mongoose";
import { server } from "./app.js";
import envConfig from "./config/envConfig.js";

mongoose
  .connect(envConfig.mongoose.url)
  .then(() => {
    console.log("Connected to MongoDB");
    server.listen(envConfig.port, () => {
      console.log(`Server is running on port ${envConfig.port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
  });
