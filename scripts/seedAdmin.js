require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const connectDB = require("../config/db");

const seedAdmin = async () => {
  try {
    // Connect to the database
    await connectDB();

    // Check if an admin already exists
    const existingAdmin = await User.findOne({
      userType: "admin",
    });

    if (existingAdmin) {
      console.log("Admin already exists. Skipping seed.");
      process.exit(0);
    }

    // Hash the admin password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(
      process.env.ADMIN_PASSWORD || "admin123",
      salt
    );

    // Create admin user
    const admin = await User.create({
      email: process.env.ADMIN_EMAIL || "admin@example.com",
      password: hashedPassword,
      userType: "admin",
    });

    console.log("Admin user created successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding admin:", error);
    process.exit(1);
  }
};

seedAdmin();
