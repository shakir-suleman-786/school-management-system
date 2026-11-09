
const express = require("express");
const { protect, authorize } = require("../middleware/auth");

const {
    getSubjects,
    getSubject,
    createSubject,
    updateSubject,
    deleteSubject,
    toggleSubjectStatus
} = require("../controllers/subjectController");

const router = express.Router();

router.use(protect, authorize("admin"));

router.route("/")
    .get(getSubjects)
    .post(createSubject);

router.patch("/:id/status", toggleSubjectStatus);

router.route("/:id")
    .get(getSubject)
    .put(updateSubject)
    .delete(deleteSubject);

module.exports = router;
