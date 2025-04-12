const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  signup,
  login,
  getCurrentUser,
  submitVerification,
} = require("../controllers/authController");
const router = express.Router();

// @route   POST /api/auth/signup
router.post("/signup", signup);
router.post("/submitVerification", submitVerification);



// @route   POST /api/auth/login
router.post("/login", login);
router.get("/me", protect, getCurrentUser);

module.exports = router;
