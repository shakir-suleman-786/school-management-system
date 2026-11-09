
const fs = require("fs");
const path = require("path");
const { Settings } = require("../models");

const uploadDirectory = path.join(__dirname, "..", "uploads", "settings");

const getOrCreateSettings = async () => {
    let settings = await Settings.findOne({ key: "school" });

    if (!settings) {
        settings = await Settings.create({ key: "school" });
    }

    return settings;
};

const getSettings = async (req, res, next) => {
    try {
        const settings = await getOrCreateSettings();

        const data = settings.toObject();

        if (data.logo && data.logo.filename) {
            data.logo.url = `/school-assets/${data.logo.filename}`;
        }

        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const updateSettings = async (req, res, next) => {
    try {
        const settings = await getOrCreateSettings();

        const allowedFields = [
            "schoolName",
            "schoolAddress",
            "schoolPhone",
            "schoolEmail"
        ];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                settings[field] = String(req.body[field]).trim();
            }
        }

        if (settings.schoolEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.schoolEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid school email."
            });
        }

        settings.updatedBy = req.user._id;
        await settings.save();

        res.json({
            success: true,
            message: "School settings updated successfully.",
            data: settings
        });
    } catch (error) {
        next(error);
    }
};

const uploadSchoolLogo = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please select a logo image."
            });
        }

        const settings = await getOrCreateSettings();
        const oldFilename = settings.logo?.filename;

        settings.logo = {
            path: `/school-assets/${req.file.filename}`,
            filename: req.file.filename,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadedAt: new Date()
        };

        settings.updatedBy = req.user._id;
        await settings.save();

        if (oldFilename && oldFilename !== req.file.filename) {
            const oldPath = path.join(uploadDirectory, path.basename(oldFilename));

            if (fs.existsSync(oldPath)) {
                fs.unlink(oldPath, () => {});
            }
        }

        res.json({
            success: true,
            message: "School logo uploaded successfully.",
            data: {
                filename: req.file.filename,
                url: `/school-assets/${req.file.filename}`
            }
        });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => {});
        }
        next(error);
    }
};

const deleteSchoolLogo = async (req, res, next) => {
    try {
        const settings = await getOrCreateSettings();
        const filename = settings.logo?.filename;

        settings.logo = {
            path: "",
            filename: "",
            mimeType: "",
            size: 0,
            uploadedAt: null
        };

        settings.updatedBy = req.user._id;
        await settings.save();

        if (filename) {
            const logoPath = path.join(uploadDirectory, path.basename(filename));

            if (fs.existsSync(logoPath)) {
                fs.unlink(logoPath, () => {});
            }
        }

        res.json({
            success: true,
            message: "School logo removed successfully."
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSettings,
    updateSettings,
    uploadSchoolLogo,
    deleteSchoolLogo
};
