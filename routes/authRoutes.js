const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  signup,
  login,
  getCurrentUser,
  submitVerification,
  resetPassword,
  toggleOnlineStatus,
  createProviderProfile,
  createClientProfile,
  googleAuth,
  updateProfile,
} = require("../controllers/authController");
const router = express.Router();

// @route   POST /api/auth/signup
router.post("/signup", signup);
router.post("/submitVerification", submitVerification);

// @route   POST /api/auth/login
router.post("/login", login);
router.post("/reset-password", resetPassword);

router.get("/me", protect, getCurrentUser);
router.put("/toggle-online", protect, toggleOnlineStatus);
router.post("/provider-profile", protect, createProviderProfile);
router.post("/client-profile", protect, createClientProfile);
router.post("/google", googleAuth);
router.put("/profile", protect, updateProfile);

module.exports = router;
