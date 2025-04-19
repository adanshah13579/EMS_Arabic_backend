const Category = require("../models/Category");
const User = require("../models/User");
const mongoose = require("mongoose");


exports.createCategory = async (req, res) => {
  try {
    const { name, description, image } = req.body;

    // Ensure that both English and Arabic fields are provided for name and description
    if (!name.en || !name.ar || !description.en || !description.ar) {
      return res.status(400).json({
        message: "Both English and Arabic name and description are required",
      });
    }

    // Check if category already exists (you can check using either en or ar or both, depending on your use case)
    const existingCategory = await Category.findOne({
      $or: [
        { "name.en": name.en.toLowerCase().trim() },
        { "name.ar": name.ar.toLowerCase().trim() },
      ],
    });

    if (existingCategory) {
      return res.status(400).json({
        message: "Category with the same name already exists",
      });
    }

    // Create new category with both English and Arabic names and descriptions
    const category = await Category.create({
      name: {
        en: name.en.toLowerCase().trim(),
        ar: name.ar.toLowerCase().trim(),
      },
      description: {
        en: description.en.trim(),
        ar: description.ar.trim(),
      },
      icon: image,  // Assuming this is the icon URL
    });

    // Return the newly created category
    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({
      message: "Server error creating category",
      error: error.message,
    });
  }
};


// @desc    Update a category
// @route   PUT /api/admin/categories/:id
exports.updateCategory = async (req, res) => {
  try {
    const { name, description, icon } = req.body;

    // Prevent updating the N/A category
    const category = await Category.findById(req.params.id);
    if (category.isDefault) {
      return res.status(400).json({
        message: "Cannot modify default category",
      });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description, icon },
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(updatedCategory);
  } catch (error) {
    res.status(500).json({
      message: "Server error updating category",
      error: error.message,
    });
  }
};

// @desc    Delete a category
// @route   DELETE /api/admin/categories/:id
exports.deleteCategory = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Find the category
    const category = await Category.findById(req.params.id);

    // Prevent deleting default category
    if (category.isDefault) {
      return res.status(400).json({
        message: "Cannot delete default category",
      });
    }

    // Find the N/A category
    const naCategory = await Category.findOne({
      name: "n/a",
      isDefault: true,
    });

    // If N/A category doesn't exist, create it
    let naCategoryId = naCategory?._id;
    if (!naCategoryId) {
      const newNaCategory = await Category.create({
        name: "n/a",
        description: "Unassigned Category",
        isDefault: true,
      });
      naCategoryId = newNaCategory._id;
    }

    // Update all users with this category to N/A category
    await User.updateMany(
      { category: req.params.id },
      { category: naCategoryId },
      { session }
    );

    // Delete the category
    await Category.findByIdAndDelete(req.params.id, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      message: "Server error deleting category",
      error: error.message,
    });
  }
};

//Get all users with account status and userType
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit , accountStatus, userType } = req.query;

    const pageNumber = Math.max(1, parseInt(page));
    const pageSize = Math.max(1, parseInt(limit));
    const skip = (pageNumber - 1) * pageSize;

    // Base filter: Exclude admin users
    const filter = { userType: { $ne: "admin" } };

    // Correct the typo in `accountStatus`
    if (accountStatus) {
      filter.accountStatus = accountStatus; 
    }

    // Only apply userType filter if provided & valid
    if (userType && ["user", "serviceProvider"].includes(userType)) {
      filter.userType = userType;
    }

    const totalUsers = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select("-password -__v")
      .populate("category", "name") 

      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    res.json({
      users,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalUsers / pageSize),
      totalUsers,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find user by ID and exclude password
    const user = await User.findById(id).select("-password -__v");

    // If user not found, return 404
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    
    // Handle invalid ObjectId error
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { accountStatus: "suspended" },
      { new: true }
    ).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User account suspended" });
  } catch (error) {
    console.error("Error suspending user:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
exports.reactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { accountStatus: "active" },
      { new: true }
    ).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User account reactivated" });
  } catch (error) {
    console.error("Error reactivating user:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// api/admin/userGrowth.js

// Helper function to restructure the data
const restructureData = (data, period) => {
  return data.reduce((acc, item) => {
    const timePeriod = item._id[period];
    const userType = item._id.userType;
    const count = item.count;

    if (!acc[timePeriod]) {
      acc[timePeriod] = { [userType]: count };
    } else {
      acc[timePeriod][userType] = (acc[timePeriod][userType] || 0) + count;
    }
    return acc;
  }, {});
};

// Function to get user growth
exports.getUserGrowth = async (req, res) => {
  try {
    // Aggregation pipeline to get user growth by month
    const userGrowthByMonth = await User.aggregate([
      { $match: { userType: { $ne: "admin" } } },
      {
        $group: {
          _id: { month: { $month: "$createdAt" }, userType: "$userType" }, 
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } }, // Sort by month
    ]);

    // Aggregation pipeline to get user growth by week
    const userGrowthByWeek = await User.aggregate([
      { $match: { userType: { $ne: "admin" } } },
      {
        $group: {
          _id: { week: { $isoWeek: "$createdAt" }, userType: "$userType" }, 
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.week": 1 } }, // Sort by week
    ]);

    // Restructure the data for better usability
    const structuredGrowthByMonth = restructureData(userGrowthByMonth, "month");
    const structuredGrowthByWeek = restructureData(userGrowthByWeek, "week");

    // Return the user growth data
    res.json({
      success: true,
      data: {
        userGrowthByMonth: structuredGrowthByMonth,
        userGrowthByWeek: structuredGrowthByWeek,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



// 2️⃣ User Distribution by Account Type 🔍 (Excludes Admin)
exports.getUserDistribution = async (req, res) => {
  try {
    const userDistribution = await User.aggregate([
      { $match: { userType: { $ne: "admin" } } },
      {
        $group: {
          _id: "$userType",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({ success: true, data: userDistribution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3️⃣ Active vs Suspended Users ⚖ (Excludes Admin)
exports.getUserStatusStats = async (req, res) => {
  try {
    const userStatus = await User.aggregate([
      { $match: { userType: { $ne: "admin" } } },
      {
        $group: {
          _id: "$accoutStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({ success: true, data: userStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4️⃣ Users by Category (For Service Providers) 🛠 (Excludes Admin)
exports.getUsersByCategory = async (req, res) => {
  try {
    const categoryStats = await User.aggregate([
      { $match: { userType: "serviceProvider" } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "categories", // Collection name in MongoDB
          localField: "_id",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $unwind: "$categoryDetails",
      },
      {
        $project: {
          _id: 0,
          categoryId: "$_id",
          categoryName: "$categoryDetails.name",
          count: 1,
        },
      },
    ]);

    res.json({ success: true, data: categoryStats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
