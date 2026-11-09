
const path = require("path");
require("dotenv").config({
    path: path.resolve(__dirname, "../../.env")
});

const readline = require("readline");
const mongoose = require("mongoose");
const connectDB = require("../../config/db");
const User = require("../models/User");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

function askHidden(question) {
    return new Promise((resolve) => {
        process.stdout.write(question);

        const stdin = process.stdin;
        let password = "";

        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");

        const onData = (key) => {
            if (key === "\u0003") {
                process.stdout.write("\nCancelled.\n");
                stdin.setRawMode(false);
                stdin.pause();
                process.exit(1);
            }

            if (key === "\r" || key === "\n") {
                stdin.removeListener("data", onData);
                stdin.setRawMode(false);
                stdin.pause();
                process.stdout.write("\n");
                resolve(password);
            } else if (key === "\u007f" || key === "\b") {
                password = password.slice(0, -1);
            } else if (key >= " ") {
                password += key;
            }
        };

        stdin.on("data", onData);
    });
}

async function resetAdminPassword() {
    try {
        await connectDB();

        console.log("\n===== ADMIN PASSWORD RESET =====\n");

        const email = (await ask("Enter admin email: "))
            .trim()
            .toLowerCase();

        if (!email) {
            throw new Error("Admin email is required.");
        }

        const admin = await User.findOne({
            email,
            role: "admin"
        });

        if (!admin) {
            throw new Error("No admin account found with this email.");
        }

        const newPassword = await askHidden(
            "Enter new password (minimum 8 characters): "
        );

        if (newPassword.length < 8) {
            throw new Error("Password must contain at least 8 characters.");
        }

        const confirmPassword = await askHidden(
            "Confirm new password: "
        );

        if (newPassword !== confirmPassword) {
            throw new Error("Passwords do not match.");
        }

        admin.password = newPassword;
        admin.passwordChangedAt = new Date();
        admin.passwordResetToken = undefined;
        admin.passwordResetExpires = undefined;

        await admin.save();

        console.log("\nSUCCESS: Admin password updated.");
        console.log("You can now log in using your new password.");

    } catch (error) {
        console.error("\nERROR:", error.message);
    } finally {
        rl.close();
        await mongoose.disconnect().catch(() => {});
    }
}

resetAdminPassword();

