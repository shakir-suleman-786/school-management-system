
const express = require("express");
const rateLimit = require("express-rate-limit");

const {
    login,
    logout,
    getMe,
    changePassword,
    forgotPassword,
    resetPassword
} = require("../controllers/authController");

const { protect } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many login attempts. Try again later."
    }
});

router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.patch("/change-password", protect, changePassword);
router.post("/forgot-password", loginLimiter, forgotPassword);
router.post("/reset-password", loginLimiter, resetPassword);

module.exports = router;
