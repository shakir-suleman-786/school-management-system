
const express = require("express");
const { protect } = require("../middleware/auth");
const {
    getDashboardOverview
} = require("../controllers/dashboardController");

const router = express.Router();

const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrator access required."
        });
    }

    next();
};

router.get("/overview", protect, adminOnly, getDashboardOverview);

module.exports = router;
