const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    icon: {
      type: String,
      default: "https://img.icons8.com/color/512/services.png",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Category", CategorySchema);
