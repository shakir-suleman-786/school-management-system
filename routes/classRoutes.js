
const express = require("express");
const { protect, authorize } = require("../middleware/auth");

const {
    getClasses,
    getClass,
    createClass,
    updateClass,
    deleteClass,
    addStudent,
    removeStudent,
    toggleClassStatus
} = require("../controllers/classController");

const router = express.Router();

router.use(protect, authorize("admin"));

router.route("/")
    .get(getClasses)
    .post(createClass);

router.post("/:id/students", addStudent);
router.delete("/:id/students", removeStudent);
router.patch("/:id/status", toggleClassStatus);

router.route("/:id")
    .get(getClass)
    .put(updateClass)
    .delete(deleteClass);

module.exports = router;
