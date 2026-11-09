
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDirectory = path.join(
    __dirname,
    "..",
    "uploads",
    "assignments"
);

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedTypes = {
    ".pdf": ["application/pdf"],
    ".doc": ["application/msword"],
    ".docx": [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".png": ["image/png"]
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDirectory);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = `${crypto.randomUUID()}${extension}`;

        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const acceptedMimes = allowedTypes[extension];

    if (!acceptedMimes || !acceptedMimes.includes(file.mimetype)) {
        return cb(new Error("Unsupported file type."));
    }

    cb(null, true);
};

const uploadAssignmentFile = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    }
});

module.exports = uploadAssignmentFile;
