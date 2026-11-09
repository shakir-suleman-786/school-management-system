
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDirectory = path.join(__dirname, "..", "uploads", "settings");

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirectory),
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `${crypto.randomUUID()}${extension}`);
    }
});

const fileFilter = (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedTypes[extension] || allowedTypes[extension] !== file.mimetype) {
        return cb(new Error("Only PNG, JPG, JPEG and WEBP logo images are allowed."));
    }

    cb(null, true);
};

module.exports = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1
    }
});
