
const express = require("express");
const { protect, authorize } = require("../middleware/auth");

const {
    getAssessments,
    getAssessment,
    createAssessment,
    updateAssessment,
    deleteAssessment,
    getStudentResults
} = require("../controllers/assessmentController");

const router = express.Router();

router.use(protect);

// Admin, teacher and student can view permitted assessments.
router.get("/", authorize("admin", "teacher", "student"), getAssessments);

// Keep this route before /:id.
router.get(
    "/student/:studentId",
    authorize("admin", "teacher", "student"),
    getStudentResults
);

router.post(
    "/",
    authorize("admin", "teacher"),
    createAssessment
);

router.get(
    "/:id",
    authorize("admin", "teacher", "student"),
    getAssessment
);

router.put(
    "/:id",
    authorize("admin", "teacher"),
    updateAssessment
);

router.delete(
    "/:id",
    authorize("admin", "teacher"),
    deleteAssessment
);

module.exports = router;
