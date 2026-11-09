
require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

async function seedAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB connected.");

        const name = process.env.ADMIN_NAME;
        const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD;

        if (!name || !email || !password) {
            throw new Error(
                "ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required."
            );
        }

        if (password.length < 12) {
            throw new Error(
                "Admin password must contain at least 12 characters."
            );
        }

        const existingAdmin = await User.findOne({ role: "admin" });

        if (existingAdmin) {
            throw new Error(
                "An admin account already exists. Seed operation stopped."
            );
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            throw new Error(
                "This email already belongs to another account."
            );
        }

        const admin = await User.create({
            name,
            email,
            password,
            role: "admin",
            isActive: true
        });

        console.log("--------------------------------");
        console.log("FIRST ADMIN CREATED SUCCESSFULLY");
        console.log("--------------------------------");
        console.log("Name:", admin.name);
        console.log("Email:", admin.email);
        console.log("Role:", admin.role);
        console.log("Password: Not displayed");
        console.log("--------------------------------");

    } catch (error) {
        console.error("Admin creation failed:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

seedAdmin();
