const Category = require("../models/Category");
const User = require("../models/User");
const mongoose = require("mongoose");
// @desc    Get all categories
// @route   GET /api/dashboard/categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({})
      .select("-createdAt -updatedAt -__v")
      .sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({
      message: "Server error fetching categories",
      error: error.message,
    });
  }
};
// @desc    Get service providers by category with location-based sorting
// @route   GET /api/categories/:categoryId/providers
exports.getProvidersByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { longitude, latitude, page = 1, limit = 10 } = req.query;

    // Validate inputs
    const pageNumber = Math.max(1, parseInt(page));
    const pageSize = Math.max(1, parseInt(limit));
    const skip = (pageNumber - 1) * pageSize;

    if (!longitude || !latitude) {
      return res
        .status(400)
        .json({ message: "Longitude and latitude are required" });
    }

    const coordinates = [parseFloat(latitude), parseFloat(longitude)];

    // Aggregation pipeline using `$geoNear`
    const pipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates },
          distanceField: "distance",
          spherical: true,
          distanceMultiplier: 0.001, // Convert meters to KM
          query: {
            userType: "serviceProvider",
            category: new mongoose.Types.ObjectId(categoryId),
          },
        },
      },
      { $sort: { rank: -1, distance: 1 } }, // Sort by rank first, then nearest
      { $skip: skip },
      { $limit: pageSize },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $project: {
          password: 0,
          updatedAt: 0,
          userType: 0,
          rank: 0,
          __v: 0,
          "category.createdAt": 0,
          "category.updatedAt": 0,
          "category.__v": 0,
        },
      },
    ];

    const providers = await User.aggregate(pipeline);

    // Get total count of service providers in the category
    const totalProviders = await User.countDocuments({
      userType: "serviceProvider",
      category: new mongoose.Types.ObjectId(categoryId),
    });

    res.json({
      providers,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalProviders / pageSize),
      totalProviders,
      userLocation: { latitude: coordinates[1], longitude: coordinates[0] },
    });
  } catch (error) {
    console.error("Detailed error:", error);
    res.status(500).json({
      message: "Server error fetching providers",
      error: error.message,
    });
  }
};
