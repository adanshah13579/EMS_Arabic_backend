const express = require("express");
const {
  createCategory,

  updateCategory,
  deleteCategory,
  getAllUsers,
  suspendUser,
  reactivateUser,
  getUserGrowth,
  getUserDistribution,
  getUserStatusStats,
  getUsersByCategory,
  getUserById,
} = require("../controllers/adminController");

const { protect } = require("../middleware/authMiddleware");
const router = express.Router();

// Middleware to ensure only admin can access these routes
const adminOnly = (req, res, next) => {
  if (!req.user.isAdmin) {
    // console.log(req.user)
    return res.status(403).json({ message: "Not authorized as admin" });
  }
  next();
};

// Category Management Routes
router.post("/categories", protect, adminOnly, createCategory);
router.put("/categories/:id", protect, adminOnly, updateCategory);
router.delete("/categories/:id", protect, adminOnly, deleteCategory);

// Users Management Routes
router.get("/users", protect, adminOnly, getAllUsers);
router.get("/user/:id",protect, adminOnly, getUserById);
router.put("/user/:userId/reactivate", protect, adminOnly, reactivateUser);
router.put("/user/:userId/suspend", protect, adminOnly, suspendUser);

// Analytics Routes
router.get("/user-growth", protect, adminOnly, getUserGrowth);
router.get("/user-distribution", protect, adminOnly, getUserDistribution);
router.get("/user-status", protect, adminOnly, getUserStatusStats);
router.get("/users-by-category", protect, adminOnly, getUsersByCategory);

module.exports = router;
