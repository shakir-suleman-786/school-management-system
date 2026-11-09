
const fs = require("fs");
const path = require("path");

const mongoose = require("mongoose");
const {
    Assignment,
    Submission
} = require("../models");

const canManageAssignment = (user, assignment) => {
    if (user.role === "admin") return true;

    return user.role === "teacher" &&
        user.assignedClasses.some(
            id => id.toString() === assignment.class.toString()
        ) &&
        user.assignedSubjects.some(
            id => id.toString() === assignment.subject.toString()
        );
};

// POST /api/submissions/:assignmentId
// Student submits or resubmits an assignment.
const submitAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { textContent = "" } = req.body;

        if (!mongoose.isValidObjectId(assignmentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assignment ID."
            });
        }

        if (typeof textContent !== "string" ||
            textContent.length > 50000 ||
            !textContent.trim()) {
            return res.status(400).json({
                success: false,
                message: "A valid text submission is required."
            });
        }

        const assignment = await Assignment.findById(assignmentId);

        if (!assignment || assignment.status !== "published") {
            return res.status(404).json({
                success: false,
                message: "Published assignment not found."
            });
        }

        if (assignment.class.toString() !== req.user.class?.toString()) {
            return res.status(403).json({
                success: false,
                message: "This assignment is not assigned to your class."
            });
        }

        if (!assignment.allowTextSubmission) {
            return res.status(400).json({
                success: false,
                message: "Text submissions are not allowed for this assignment."
            });
        }

        const now = new Date();

        if (assignment.status === "closed") {
            return res.status(400).json({
                success: false,
                message: "This assignment is closed."
            });
        }

        let submission = await Submission.findOne({
            assignment: assignmentId,
            student: req.user._id
        });

        if (submission && submission.status === "graded") {
            return res.status(409).json({
                success: false,
                message: "This submission has already been graded."
            });
        }

        const isLate = now > assignment.dueDate;

        if (!submission) {
            submission = new Submission({
                assignment: assignmentId,
                student: req.user._id,
                textContent: textContent.trim(),
                submissionType: "text",
                submittedAt: now,
                isLate
            });
        } else {
            submission.textContent = textContent.trim();
            submission.submissionType = "text";
            submission.submittedAt = now;
            submission.isLate = isLate;
        }

        await submission.save();

        res.status(201).json({
            success: true,
            message: isLate
                ? "Assignment submitted successfully (late submission)."
                : "Assignment submitted successfully.",
            data: { submission }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to submit assignment.",
            error: error.message
        });
    }
};

// GET /api/submissions/my
const getMySubmissions = async (req, res) => {
    try {
        const submissions = await Submission.find({
            student: req.user._id
        })
            .populate({
                path: "assignment",
                select: "title dueDate maxMarks status class subject",
                populate: [
                    { path: "class", select: "name section" },
                    { path: "subject", select: "name code" }
                ]
            })
            .sort({ submittedAt: -1 });

        res.status(200).json({
            success: true,
            data: { submissions }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve your submissions."
        });
    }
};

// GET /api/submissions/assignment/:assignmentId
// Admin/teacher reviews submissions for an assignment.
const getAssignmentSubmissions = async (req, res) => {
    try {
        const { assignmentId } = req.params;

        if (!mongoose.isValidObjectId(assignmentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assignment ID."
            });
        }

        const assignment = await Assignment.findById(assignmentId);

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: "Assignment not found."
            });
        }

        if (!canManageAssignment(req.user, assignment)) {
            return res.status(403).json({
                success: false,
                message: "You cannot review this assignment."
            });
        }

        const submissions = await Submission.find({
            assignment: assignmentId
        })
            .populate("student", "name email admissionNumber rollNumber")
            .populate("gradedBy", "name")
            .sort({ submittedAt: -1 });

        res.status(200).json({
            success: true,
            data: {
                assignment,
                totalSubmissions: submissions.length,
                submissions
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve assignment submissions."
        });
    }
};

// PATCH /api/submissions/:id/grade
const gradeSubmission = async (req, res) => {
    try {
        const { id } = req.params;
        const { marksObtained, feedback = "" } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid submission ID."
            });
        }

        if (!Number.isFinite(Number(marksObtained)) ||
            Number(marksObtained) < 0) {
            return res.status(400).json({
                success: false,
                message: "Valid marks are required."
            });
        }

        if (typeof feedback !== "string" || feedback.length > 5000) {
            return res.status(400).json({
                success: false,
                message: "Feedback cannot exceed 5000 characters."
            });
        }

        const submission = await Submission.findById(id);

        if (!submission) {
            return res.status(404).json({
                success: false,
                message: "Submission not found."
            });
        }

        const assignment = await Assignment.findById(
            submission.assignment
        );

        if (!assignment || !canManageAssignment(req.user, assignment)) {
            return res.status(403).json({
                success: false,
                message: "You cannot grade this submission."
            });
        }

        if (Number(marksObtained) > assignment.maxMarks) {
            return res.status(400).json({
                success: false,
                message: `Marks cannot exceed ${assignment.maxMarks}.`
            });
        }

        submission.marksObtained = Number(marksObtained);
        submission.feedback = feedback.trim();
        submission.status = "graded";
        submission.gradedBy = req.user._id;
        submission.gradedAt = new Date();

        await submission.save();

        res.status(200).json({
            success: true,
            message: "Submission graded successfully.",
            data: { submission }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to grade submission.",
            error: error.message
        });
    }
};




const uploadFileSubmission = async (req, res) => {
    try {
        const { assignmentId } = req.params;

        if (!mongoose.isValidObjectId(assignmentId)) {
            if (req.file) fs.unlinkSync(req.file.path);

            return res.status(400).json({
                success: false,
                message: "Invalid assignment ID."
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please select a file to upload."
            });
        }

        const assignment = await Assignment.findById(assignmentId);

        if (
            !assignment ||
            assignment.status !== "published" ||
            assignment.class.toString() !== req.user.class?.toString()
        ) {
            fs.unlinkSync(req.file.path);

            return res.status(404).json({
                success: false,
                message: "Published assignment not found for your class."
            });
        }

        if (!assignment.allowFileSubmission) {
            fs.unlinkSync(req.file.path);

            return res.status(400).json({
                success: false,
                message: "File submissions are not allowed."
            });
        }

        const extension = path.extname(req.file.originalname)
            .replace(".", "")
            .toLowerCase();

        if (
            assignment.allowedFileTypes.length &&
            !assignment.allowedFileTypes.includes(extension)
        ) {
            fs.unlinkSync(req.file.path);

            return res.status(400).json({
                success: false,
                message: "This file type is not allowed for this assignment."
            });
        }

        const now = new Date();

        let submission = await Submission.findOne({
            assignment: assignmentId,
            student: req.user._id
        });

        if (submission?.status === "graded") {
            fs.unlinkSync(req.file.path);

            return res.status(409).json({
                success: false,
                message: "This submission has already been graded."
            });
        }

        if (submission?.file?.path) {
            const oldPath = path.resolve(submission.file.path);
            const uploadRoot = path.resolve(
                __dirname,
                "..",
                "uploads",
                "assignments"
            );

            if (oldPath.startsWith(uploadRoot + path.sep) &&
                fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        if (!submission) {
            submission = new Submission({
                assignment: assignmentId,
                student: req.user._id,
                submissionType: "file"
            });
        }

        submission.file = {
            originalName: req.file.originalname,
            storedName: req.file.filename,
            path: req.file.path,
            mimeType: req.file.mimetype,
            size: req.file.size
        };

        submission.submissionType = submission.textContent?.trim()
            ? "both"
            : "file";

        submission.submittedAt = now;
        submission.isLate = now > assignment.dueDate;

        await submission.save();

        res.status(201).json({
            success: true,
            message: "File submitted successfully.",
            data: { submission }
        });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: "Failed to upload submission file.",
            error: error.message
        });
    }
};

const downloadSubmissionFile = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid submission ID."
            });
        }

        const submission = await Submission.findById(id);

        if (!submission || !submission.file?.path) {
            return res.status(404).json({
                success: false,
                message: "Submission file not found."
            });
        }

        if (req.user.role === "student") {
            if (submission.student.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot access this file."
                });
            }
        } else {
            const assignment = await Assignment.findById(
                submission.assignment
            );

            if (!assignment || !canManageAssignment(req.user, assignment)) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot access this file."
                });
            }
        }

        const filePath = path.resolve(submission.file.path);
        const uploadRoot = path.resolve(
            __dirname,
            "..",
            "uploads",
            "assignments"
        );

        if (
            !filePath.startsWith(uploadRoot + path.sep) ||
            !fs.existsSync(filePath)
        ) {
            return res.status(404).json({
                success: false,
                message: "Stored file is unavailable."
            });
        }

        res.download(filePath, submission.file.originalName);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to download submission file."
        });
    }
};



module.exports = {
    submitAssignment,
    getMySubmissions,
    getAssignmentSubmissions,
    gradeSubmission,
    uploadFileSubmission,
    downloadSubmissionFile
};
