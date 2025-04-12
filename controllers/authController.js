const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// @desc    Register new user
// @route   POST /api/auth/signup
exports.signup = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phoneNumber,
      password,
      userType = "user",
      category,
      location,
    } = req.body;

    console.log("req.body",req.body);
    console.log("Location:", location);
console.log("Category:", category);
    
    if (userType == "admin") {
      return res.status(400).json({
        message: "You can't  register as admin!",
      });
    }
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }],
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with this email or phone number",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      fullName,
      email,
      phoneNumber,
      password: hashedPassword,
      userType,
      category: userType === "serviceProvider" ? category : undefined,
      location: location
        ? {
            type: "Point",
            coordinates: location.coordinates,
            streetAddress: location.streetAddress,
          }
        : undefined,
    });
    

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      userType: userType,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error("Error during signup:", error);  // Print the full error object
    res.status(500).json({
      message: "Server error during signup",
      error: error.message || error,  // Respond with full error details
    });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        userType: user.userType,
        accountStatus:user.accountStatus,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({
      message: "Server error during login",
      error: error.message,
    });
  }
};
exports.getCurrentUser = async (req, res) => {
  try {
    // req.user is set by the protect middleware
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("category");

    res.json(user);
  } catch (error) {
    res.status(500).json({
      message: "Server error fetching user profile",
      error: error.message,
    });
  }
};
exports.submitVerification = async (req, res) => {
  try {
    const { userId, images } = req.body;  // Get userId and images from the request body
    
    if (!images || images.length < 3) {
      return res.status(400).json({ message: "Please upload at least 3 images." });
    }

    // Find the user by userId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const uploadedUrls = images; // In a real scenario, these should be URLs after uploading the images

    // Update the user's images field and accountStatus
    user.images = uploadedUrls;
    user.accountStatus = "pending";  // Set account status to pending

    // Save the user data to the database
    await user.save();

    // Respond with success message and the uploaded image URLs
    res.status(200).json({
      message: "Verification images uploaded successfully. Account status set to pending.",
      images: uploadedUrls,
    });
  } catch (error) {
    console.error("Error during verification image upload:", error);
    res.status(500).json({
      message: "Internal Server Error during image upload",
      error: error.message || error,
    });
  }
};