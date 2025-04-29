const Category = require("../models/Category");
const User = require("../models/User");
const mongoose = require("mongoose");
const Message = require("../models/Message");


exports.createCategory = async (req, res) => {
  try {
    const { name, description, icon } = req.body;

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
      icon: icon,  // Assuming this is the icon URL
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
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Prevent deleting default category
    if (category.isDefault) {
      return res.status(400).json({ message: "Cannot delete default category" });
    }

    // Find the N/A category by 'name.en'
    let naCategory = await Category.findOne({ "name.en": "n/a", isDefault: true });

    // If N/A category doesn't exist, create it
    let naCategoryId = naCategory?._id;
    if (!naCategoryId) {
      const newNaCategory = await Category.create({
        name: { en: "n/a", ar: "غير محدد" },
        description: { en: "Unassigned Category", ar: "فئة غير محددة" },
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
    const { page = 1, limit, accountStatus, userType } = req.query;

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

    // Get job offer counts for each provider
    const jobOfferCounts = await Message.aggregate([
      {
        $match: {
          messageType: 'job_offer',
          recipient: { $in: users.map(user => user._id) }
        }
      },
      {
        $group: {
          _id: {
            recipient: "$recipient",
            status: "$jobOfferStatus"
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Create a map of user IDs to their job offer counts
    const jobOfferMap = {};
    jobOfferCounts.forEach(offer => {
      const userId = offer._id.recipient.toString();
      if (!jobOfferMap[userId]) {
        jobOfferMap[userId] = {
          pendingJobOffers: 0,
          acceptedJobOffers: 0,
          completedJobOffers:0
        };
      }
      if (offer._id.status === 'pending') {
        jobOfferMap[userId].pendingJobOffers = offer.count;
      } else if (offer._id.status === 'accepted') {
        jobOfferMap[userId].acceptedJobOffers = offer.count;
      } else if (offer._id.status === 'completed') {
        jobOfferMap[userId].completedJobOffers = offer.count;
      }
    });

    // Add job offer counts to each user
    const usersWithJobOffers = users.map(user => {
      const userId = user._id.toString();
      return {
        ...user.toObject(),
        jobOffers: jobOfferMap[userId] || {
          pendingJobOffers: 0,
          acceptedJobOffers: 0
        }
      };
    });

    res.json({
      users: usersWithJobOffers,
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
    const user = await User.findById(id).select("-password -__v").populate("category");

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
    const matchStage = { isAdmin: false };

    // Role projection for identifying whether the user is a provider, client, or both
    const roleProjection = {
      $switch: {
        branches: [
          {
            case: { $eq: ["$isProvider", true] },
            then: "provider",
          },
          {
            case: { $eq: ["$isClient", true] },
            then: "client",
          },
          {
            case: { $and: [{ $eq: ["$isProvider", true] }, { $eq: ["$isClient", true] }] },
            then: "both",
          },
        ],
        default: "unknown",
      },
    };

    // Aggregation for daily user registrations
    const userGrowthByDay = await User.aggregate([
      { $match: matchStage },
      {
        $project: {
          day: { $dayOfYear: "$createdAt" }, // Extract day of the year
          role: roleProjection,
        },
      },
      {
        $group: {
          _id: { day: "$day", role: "$role" }, // Group by day and role
          count: { $sum: 1 }, // Count the number of registrations for each role
        },
      },
      { $sort: { "_id.day": 1 } }, // Sort by day
    ]);

    // Aggregation for weekly user registrations
    const userGrowthByWeek = await User.aggregate([
      { $match: matchStage },
      {
        $project: {
          week: { $isoWeek: "$createdAt" }, // Extract ISO week number
          role: roleProjection,
        },
      },
      {
        $group: {
          _id: { week: "$week", role: "$role" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.week": 1 } }, // Sort by week
    ]);

    // Aggregation for monthly user registrations
    const userGrowthByMonth = await User.aggregate([
      { $match: matchStage },
      {
        $project: {
          month: { $month: "$createdAt" }, // Extract month
          role: roleProjection,
        },
      },
      {
        $group: {
          _id: { month: "$month", role: "$role" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } }, // Sort by month
    ]);

    // Helper function to restructure data for consistent format
    const restructureData = (data, timeUnit) => {
      const result = data.reduce((acc, item) => {
        const timeUnitValue = item._id[timeUnit];
        if (!acc[timeUnitValue]) {
          acc[timeUnitValue] = { client: 0, provider: 0, both: 0 };
        }
        acc[timeUnitValue][item._id.role] += item.count;
        return acc;
      }, {});
      return result;
    };

    // Restructure the data for easy response formatting
    const structuredGrowthByDay = restructureData(userGrowthByDay, "day");
    const structuredGrowthByWeek = restructureData(userGrowthByWeek, "week");
    const structuredGrowthByMonth = restructureData(userGrowthByMonth, "month");

    res.json({
      success: true,
      data: {
        userGrowthByDay: structuredGrowthByDay,
        userGrowthByWeek: structuredGrowthByWeek,
        userGrowthByMonth: structuredGrowthByMonth,
      },
    });
  } catch (error) {
    console.error("Error in getUserGrowth:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};




// 2️⃣ User Distribution by Account Type 🔍 (Excludes Admin)
exports.getUserDistribution = async (req, res) => {
  try {
    const { client, provider } = req.query;

    let matchQuery = {
      userType: { $ne: "admin" }, // Exclude admin if you have userType
    };

    // Adjust match query based on query parameters
    if (client === "true" && provider !== "true") {
      matchQuery.isClient = true;
    } else if (provider === "true" && client !== "true") {
      matchQuery.isProvider = true;
    } else if (provider !== "true" && client !== "true") {
      return res.status(400).json({ success: false, message: "At least one of 'client' or 'provider' must be true." });
    }

    const userDistribution = await User.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            isClient: "$isClient",
            isProvider: "$isProvider",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Optional: format response clearly
    const result = {
      clientOnly: 0,
      providerOnly: 0,
      both: 0,
    };

    userDistribution.forEach((entry) => {
      const { isClient, isProvider } = entry._id;
      if (isClient && isProvider) result.both += entry.count;
      else if (isClient) result.clientOnly += entry.count;
      else if (isProvider) result.providerOnly += entry.count;
    });

    res.json({ success: true, data: result });
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
      { $match: { isProvider: true } }, // Matching only service providers
      {
        $unwind: "$category", // Unwind the category array to group each provider's category individually
      },
      {
        $group: {
          _id: "$category", // Group by category ID
          count: { $sum: 1 }, // Count the number of providers per category
        },
      },
      {
        $lookup: {
          from: "categories", // Join with the categories collection
          localField: "_id", // Match with category ObjectId
          foreignField: "_id", // Match with category ObjectId
          as: "categoryDetails",
        },
      },
      {
        $unwind: "$categoryDetails", // Unwind the category details
      },
      {
        $project: {
          _id: 0,
          categoryId: "$_id", // Return category ID
          categoryName: {
            en: "$categoryDetails.name.en", // English category name
            ar: "$categoryDetails.name.ar", // Arabic category name
          },
          count: 1, // Return the count of providers
        },
      },
    ]);

    // Remove duplicate categories and aggregate counts in a single array
    const uniqueCategoryStats = categoryStats.reduce((acc, category) => {
      const existingCategory = acc.find(
        (cat) => cat.categoryId.toString() === category.categoryId.toString()
      );
      if (existingCategory) {
        existingCategory.count += category.count; // Increment count for existing category
      } else {
        acc.push(category); // Add new category
      }
      return acc;
    }, []);

    res.json({ success: true, data: uniqueCategoryStats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

