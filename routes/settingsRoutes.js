
const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const uploadLogo = require("../middleware/uploadLogo");

const {
    getSettings,
    updateSettings,
    uploadSchoolLogo,
    deleteSchoolLogo
} = require("../controllers/settingsController");

const router = express.Router();

router.use(protect);

router.get("/", getSettings);

router.put("/", authorize("admin"), updateSettings);

router.post(
    "/logo",
    authorize("admin"),
    (req, res, next) => {
        uploadLogo.single("logo")(req, res, (error) => {
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.code === "LIMIT_FILE_SIZE"
                        ? "Logo size cannot exceed 2 MB."
                        : error.message
                });
            }
            next();
        });
    },
    uploadSchoolLogo
);

router.delete("/logo", authorize("admin"), deleteSchoolLogo);

module.exports = router;
