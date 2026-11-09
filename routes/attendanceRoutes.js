
const express = require("express");
const { protect, authorize } = require("../middleware/auth");

const {
    getAttendance,
    markAttendance,
    getStudentAttendance,
    updateAttendance,
    deleteAttendance
} = require("../controllers/attendanceController");

const router = express.Router();

router.use(protect);

// Admin, teachers and students can view permitted attendance records.
router.get("/", authorize("admin", "teacher", "student"), getAttendance);

router.get(
    "/student/:studentId",
    authorize("admin", "teacher", "student"),
    getStudentAttendance
);

// Only admins and teachers can mark or modify attendance.
router.post(
    "/bulk",
    authorize("admin", "teacher"),
    markAttendance
);

router.patch(
    "/:id",
    authorize("admin", "teacher"),
    updateAttendance
);

router.delete(
    "/:id",
    authorize("admin", "teacher"),
    deleteAttendance
);

module.exports = router;
