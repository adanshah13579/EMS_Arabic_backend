const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
  getProvidersByCategory,
  getAllCategories,
  searchCategories,
} = require("../controllers/dashboardController");

// Public route to get providers by category
router.get("/categories",  getAllCategories);
router.get("/categories/search", searchCategories);



router.get(
  "/categories/:categoryId/providers",
  protect,
  getProvidersByCategory
);
module.exports = router;
