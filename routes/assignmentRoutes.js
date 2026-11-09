
const express = require("express");
const { protect, authorize } = require("../middleware/auth");

const {
    getAssignments,
    getAssignment,
    createAssignment,
    updateAssignment,
    deleteAssignment
} = require("../controllers/assignmentController");

const router = express.Router();

router.use(protect);

router.get("/", authorize("admin", "teacher", "student"), getAssignments);
router.post("/", authorize("admin", "teacher"), createAssignment);

router.route("/:id")
    .get(authorize("admin", "teacher", "student"), getAssignment)
    .put(authorize("admin", "teacher"), updateAssignment)
    .delete(authorize("admin", "teacher"), deleteAssignment);

module.exports = router;
