
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const cookieOptions = () => ({
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true" ||
        process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAME_SITE || "lax",
    path: "/",
    maxAge: Number(process.env.JWT_COOKIE_EXPIRES_DAYS || 1) *
        24 * 60 * 60 * 1000
});

const createToken = (userId) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured.");
    }

    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );
};

const safeUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    profileImage: user.profileImage,
    isActive: user.isActive,
    class: user.class
});

exports.login = async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = req.body.password;

        if (!email || typeof password !== "string" || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const user = await User.findOne({ email })
            .select("+password +passwordChangedAt");

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive."
            });
        }

            if (user.role !== "admin") {
               return res.status(403).json({
               success: false,
               message: "Access denied. Administrator account required."
              });
        }
        user.lastLoginAt = new Date();
        await user.save();

        const token = createToken(user._id);

        res.cookie("school_token", token, cookieOptions());

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            user: safeUser(user)
        });
    } catch (error) {
        console.error("Login error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to log in."
        });
    }
};

exports.logout = (req, res) => {
    res.clearCookie("school_token", {
        ...cookieOptions(),
        maxAge: undefined
    });

    return res.status(200).json({
        success: true,
        message: "Logged out successfully."
    });
};

exports.getMe = (req, res) => {
    return res.status(200).json({
        success: true,
        user: safeUser(req.user)
    });
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || typeof newPassword !== "string" ||
            newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Provide your current password and a new password of at least 8 characters."
            });
        }

        const user = await User.findById(req.user._id)
            .select("+password +passwordChangedAt");

        if (!(await user.comparePassword(currentPassword))) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect."
            });
        }

        user.password = newPassword;
        user.passwordChangedAt = new Date();
        await user.save();

        res.clearCookie("school_token", {
            ...cookieOptions(),
            maxAge: undefined
        });

        return res.status(200).json({
            success: true,
            message: "Password changed. Please log in again."
        });
    } catch (error) {
        console.error("Change password error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to change password."
        });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        const user = await User.findOne({ email });

        // Do not disclose whether an email exists.
        if (!user) {
            return res.status(200).json({
                success: true,
                message: "If the account exists, reset instructions will be sent."
            });
        }

        const rawToken = crypto.randomBytes(32).toString("hex");

        user.passwordResetToken = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        const expiryMinutes = Number(
            process.env.RESET_TOKEN_EXPIRES_MINUTES || 15
        );

        user.passwordResetExpires = Date.now() +
            expiryMinutes * 60 * 1000;

        await user.save({ validateBeforeSave: false });

        if (!process.env.SMTP_HOST || !process.env.SMTP_USER ||
            !process.env.SMTP_PASS) {
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save({ validateBeforeSave: false });

            return res.status(503).json({
                success: false,
                message: "Password reset email service is not configured."
            });
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const resetUrl = `${process.env.APP_URL}/reset-password?token=${rawToken}`;

        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER,
            to: user.email,
            subject: "School Management - Password Reset",
            text: `Use this link to reset your password: ${resetUrl}\nThis link expires in ${expiryMinutes} minutes.`
        });

        return res.status(200).json({
            success: true,
            message: "If the account exists, reset instructions will be sent."
        });
    } catch (error) {
        console.error("Forgot password error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to process password reset."
        });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || typeof newPassword !== "string" ||
            newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "A valid reset token and password of at least 8 characters are required."
            });
        }

        const hashedToken = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        }).select("+passwordResetToken +passwordResetExpires +passwordChangedAt");

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Reset token is invalid or expired."
            });
        }

        user.password = newPassword;
        user.passwordChangedAt = new Date();
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successful. Please log in."
        });
    } catch (error) {
        console.error("Reset password error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to reset password."
        });
    }
};
