
const express = require("express");
const { protect, authorize } = require("../middleware/auth");

const {
    getTeachers,
    getTeacher,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    toggleTeacherStatus
} = require("../controllers/teacherController");

const router = express.Router();

router.use(protect, authorize("admin"));

router.route("/")
    .get(getTeachers)
    .post(createTeacher);

router.route("/:id")
    .get(getTeacher)
    .put(updateTeacher)
    .delete(deleteTeacher);

router.patch("/:id/status", toggleTeacherStatus);

module.exports = router;
