const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
    } = req.body;

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

    // Create user with basic information
    const user = await User.create({
      fullName,
      email,
      phoneNumber,
      password: hashedPassword,
      isClient: false, // Initially false
      isProvider: false, // Initially false
      isAdmin: false,
    });

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      isClient: user.isClient,
      isProvider: user.isProvider,
      phoneNumber: user.phoneNumber,
      isAdmin: user.isAdmin,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error("Error during signup:", error);
    res.status(500).json({
      message: "Server error during signup",
      error: error.message || error,
    });
  }
};

// @desc    Authenticate a user 
// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Check for user
    const user = await User.findOne({ phoneNumber });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        category: user.category,
        isClient: user.isClient,
        isProvider: user.isProvider,
        isAdmin: user.isAdmin,
        accountStatus: user.accountStatus,
        location: user.location,
        phoneNumber: user.phoneNumber,
        isOnline: user.isOnline,
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

exports.resetPassword = async (req, res) => {
  try {
    const { phoneNumber, newPassword } = req.body;
    console.log(req.body);
    

    if (!phoneNumber || !newPassword) {
      return res.status(400).json({ message: "Email and new password are required." });
    }

    const user = await User.findOne({ phoneNumber });


    if (!user) {
      return res.status(404).json({ message: "User not found with this email." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    await user.save();

    res.json({ message: "Password reset successful. Please log in with your new password." });
  } catch (error) {
    res.status(500).json({
      message: "Server error during password reset",
      error: error.message,
    });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    // req.user is set by the protect middleware
    const user = await User.findById(req.user.id)
      .select("-password");

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

exports.toggleOnlineStatus = async (req, res) => {
  try {
    const userId = req.user.id; // Get user ID from authenticated user

    // Find the user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is a service provider
    if (!user.isProvider) {
      return res.status(403).json({ 
        message: "Only service providers can toggle online status" 
      });
    }

    // Toggle the isOnline status
    user.isOnline = !user.isOnline;
    await user.save();

    res.status(200).json({
      message: "Online status updated successfully",
      isOnline: user.isOnline
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error while updating online status",
      error: error.message
    });
  }
};

exports.createProviderProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, location, hourlyRate, bio, profilePicUrl } = req.body;

    // Find the user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is already a provider
    if (user.isProvider) {
      return res.status(400).json({ 
        message: "Provider profile already exists" 
      });
    }

    // Validate required fields for provider
    if (!category || !Array.isArray(category) || category.length === 0) {
      return res.status(400).json({ 
        message: "At least one category is required" 
      });
    }

    if (!location || !location.coordinates || !location.streetAddress) {
      return res.status(400).json({ 
        message: "Location with coordinates and street address is required" 
      });
    }

    // Update user to provider
    user.isProvider = true;
    user.isClient = true;
    user.category = category;
    user.location = {
      type: "Point",
      coordinates: location.coordinates,
      streetAddress: location.streetAddress,
    };
    user.hourlyRate = hourlyRate || 0;
    
    // Update optional fields if provided
    if (bio) user.bio = bio;
    if (profilePicUrl) user.profilePicUrl = profilePicUrl;

    await user.save();

    // Get the updated user without sensitive fields
    const updatedUser = await User.findById(userId)
      .select("-password -__v");

    res.status(200).json({
      message: "Provider profile created successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error creating provider profile:", error);
    res.status(500).json({
      message: "Server error while creating provider profile",
      error: error.message
    });
  }
};

exports.createClientProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { location } = req.body;

    // Find the user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is already a client
    if (user.isClient) {
      return res.status(400).json({ 
        message: "Client profile already exists" 
      });
    }

    // Validate required fields for client
    if (!location || !location.coordinates || !location.streetAddress) {
      return res.status(400).json({ 
        message: "Location with coordinates and street address is required" 
      });
    }

    // Update user to client
    user.isClient = true;
    user.location = {
      type: "Point",
      coordinates: location.coordinates,
      streetAddress: location.streetAddress,
    };

    await user.save();

    // Get the updated user without sensitive fields
    const updatedUser = await User.findById(userId)
      .select("-password -__v");

    res.status(200).json({
      message: "Client profile created successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error creating client profile:", error);
    res.status(500).json({
      message: "Server error while creating client profile",
      error: error.message
    });
  }
};

exports.googleAuth = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Google token is required" });
    }

    // Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    
    // Extract required information
    const { name, email } = payload;

    if (!email) {
      return res.status(400).json({ message: "Email is required from Google profile" });
    }

    // Check if user already exists
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user if doesn't exist
      user = await User.create({
        fullName: name || email.split('@')[0], // Use email prefix if name not available
        email,
        phoneNumber: new Date().getTime(),
        password: 'google',
        googleId: payload.sub, // Google's unique ID for the user
      });
    } else {
      // Update googleId if not set
      if (!user.googleId) {
        user.googleId = payload.sub;
        await user.save();
      }
    }

    // Generate JWT token
    const jwtToken = generateToken(user._id);

    // Get user without sensitive fields
    const userWithoutPassword = await User.findById(user._id)
      .select("-password -__v");

    res.status(200).json({
      ...userWithoutPassword.toObject(),
      token: jwtToken,
    });
  } catch (error) {
    console.error("Google authentication error:", error);
    if (error.message.includes('Token used too late')) {
      return res.status(400).json({ message: "Token has expired" });
    }
    res.status(500).json({
      message: "Error during Google authentication",
      error: error.message,
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, location, category, bio, hourlyRate } = req.body;
    const user = req.user;

    // Update common fields
    if (fullName) {
      user.fullName = fullName;
    }

    // Update location if provided
    if (location) {
      if (!location.coordinates || !location.streetAddress) {
        return res.status(400).json({ 
          message: "Location must include coordinates and street address" 
        });
      }
      user.location = {
        type: "Point",
        coordinates: location.coordinates,
        streetAddress: location.streetAddress,
      };
    }

    // Update provider-specific fields
    if (user.isProvider) {
      if (category) {
        if (!Array.isArray(category) || category.length === 0) {
          return res.status(400).json({ 
            message: "At least one category is required for providers" 
          });
        }
        user.category = category;
      }

      if (bio !== undefined) {
        user.bio = bio;
      }

      if (hourlyRate !== undefined) {
        if (hourlyRate < 0) {
          return res.status(400).json({ 
            message: "Hourly rate cannot be negative" 
          });
        }
        user.hourlyRate = hourlyRate;
      }
    }

    await user.save();

    // Get the updated user without sensitive fields
    const updatedUser = await User.findById(user._id)
      .select("-password -__v");

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      message: "Server error while updating profile",
      error: error.message
    });
  }
};