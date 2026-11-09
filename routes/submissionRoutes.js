
const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");

const {
    submitAssignment,
    getMySubmissions,
    getAssignmentSubmissions,
    gradeSubmission,
    uploadFileSubmission,
    downloadSubmissionFile
} = require("../controllers/submissionController");

const router = express.Router();

router.use(protect);

router.get("/my", authorize("student"), getMySubmissions);

router.post(
    "/:assignmentId",
    authorize("student"),
    submitAssignment
);

router.post(
    "/:assignmentId/file",
    authorize("student"),
    (req, res, next) => {
        upload.single("file")(req, res, (error) => {
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.code === "LIMIT_FILE_SIZE"
                        ? "File size cannot exceed 5 MB."
                        : error.message
                });
            }

            next();
        });
    },
    uploadFileSubmission
);

router.get(
    "/assignment/:assignmentId",
    authorize("admin", "teacher"),
    getAssignmentSubmissions
);

router.get(
    "/:id/file",
    authorize("admin", "teacher", "student"),
    downloadSubmissionFile
);

router.patch(
    "/:id/grade",
    authorize("admin", "teacher"),
    gradeSubmission
);

module.exports = router;
