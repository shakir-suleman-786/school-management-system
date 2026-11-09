
const express = require("express");
const {
    protect,
    authorize
} = require("../middleware/auth");

const {
    getStudents,
    getStudent,
    createStudent,
    updateStudent,
    deleteStudent,
    toggleStudentStatus
} = require("../controllers/studentController");

const router = express.Router();

router.use(protect, authorize("admin"));

router.route("/")
    .get(getStudents)
    .post(createStudent);

router.route("/:id")
    .get(getStudent)
    .put(updateStudent)
    .delete(deleteStudent);

router.patch("/:id/status", toggleStudentStatus);

module.exports = router;
