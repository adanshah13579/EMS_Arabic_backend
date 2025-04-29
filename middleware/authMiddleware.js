const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      const user = await User.findById(decoded.id).select("-password");

      // Check if user existss
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // // Check if the account is suspended
      // if (
      //   user.accountStatus === "suspended" ||
      //   user.accountStatus === "deleted"
      // ) {
      //   return res
      //     .status(403)
      //     .json({
      //       message:
      //         "Account suspended. Access denied. Please contact with system administrator to resolve your issue.",
      //     });
      // }

      req.user = user; // Attach user to request
      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  } else {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

module.exports = { protect };
