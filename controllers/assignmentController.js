
const mongoose = require("mongoose");
const {
    Assignment,
    Submission,
    Class,
    Subject
} = require("../models");

const isTeacherAssigned = (user, classId, subjectId) => {
    const hasClass = user.assignedClasses.some(
        id => id.toString() === classId.toString()
    );

    const hasSubject = user.assignedSubjects.some(
        id => id.toString() === subjectId.toString()
    );

    return hasClass && hasSubject;
};

const canManageAssignment = (user, assignment) => {
    if (user.role === "admin") return true;

    return user.role === "teacher" &&
        isTeacherAssigned(user, assignment.class, assignment.subject);
};

// GET /api/assignments
const getAssignments = async (req, res) => {
    try {
        const filter = {};

        if (req.user.role === "student") {
            if (!req.user.class) {
                return res.status(200).json({
                    success: true,
                    data: { assignments: [] }
                });
            }

            filter.class = req.user.class;
            filter.status = "published";
        } else if (req.user.role === "teacher") {
            filter.class = { $in: req.user.assignedClasses };
        }

        if (req.query.class) {
            if (!mongoose.isValidObjectId(req.query.class)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid class ID."
                });
            }

            if (req.user.role === "student" &&
                req.query.class !== req.user.class?.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot access assignments for this class."
                });
            }

            if (req.user.role === "teacher" &&
                !req.user.assignedClasses.some(
                    id => id.toString() === req.query.class
                )) {
                return res.status(403).json({
                    success: false,
                    message: "You are not assigned to this class."
                });
            }

            filter.class = req.query.class;
        }

        if (req.query.subject) {
            if (!mongoose.isValidObjectId(req.query.subject)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid subject ID."
                });
            }

            filter.subject = req.query.subject;
        }

        if (req.query.status && req.user.role !== "student") {
            filter.status = req.query.status;
        }

        if (req.query.search) {
            filter.title = {
                $regex: req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                $options: "i"
            };
        }

        const assignments = await Assignment.find(filter)
            .populate("teacher", "name email")
            .populate("class", "name section academicYear")
            .populate("subject", "name code")
            .sort({ dueDate: 1 });

        res.status(200).json({
            success: true,
            data: { assignments }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve assignments."
        });
    }
};

// GET /api/assignments/:id
const getAssignment = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assignment ID."
            });
        }

        const assignment = await Assignment.findById(id)
            .populate("teacher", "name email")
            .populate("class", "name section academicYear")
            .populate("subject", "name code");

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: "Assignment not found."
            });
        }

        if (req.user.role === "student") {
            if (
                assignment.status !== "published" ||
                assignment.class._id.toString() !== req.user.class?.toString()
            ) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot access this assignment."
                });
            }
        } else if (!canManageAssignment(req.user, assignment)) {
            return res.status(403).json({
                success: false,
                message: "You cannot access this assignment."
            });
        }

        res.status(200).json({
            success: true,
            data: { assignment }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve assignment."
        });
    }
};

// POST /api/assignments
const createAssignment = async (req, res) => {
    try {
        const {
            title,
            description,
            instructions = "",
            class: classId,
            subject: subjectId,
            dueDate,
            maxMarks = 100,
            status = "draft",
            allowTextSubmission = true,
            allowFileSubmission = true,
            allowedFileTypes = []
        } = req.body;

        if (!title?.trim() || !description?.trim() ||
            !classId || !subjectId || !dueDate) {
            return res.status(400).json({
                success: false,
                message: "Title, description, class, subject and due date are required."
            });
        }

        if (!mongoose.isValidObjectId(classId) ||
            !mongoose.isValidObjectId(subjectId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid class or subject ID."
            });
        }

        if (!["draft", "published", "closed"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assignment status."
            });
        }

        if (!Array.isArray(allowedFileTypes) ||
            allowedFileTypes.some(type =>
                !["pdf", "doc", "docx", "jpg", "jpeg", "png"].includes(type)
            )) {
            return res.status(400).json({
                success: false,
                message: "Invalid allowed file types."
            });
        }

        const parsedDueDate = new Date(dueDate);

        if (Number.isNaN(parsedDueDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid due date."
            });
        }

        if (!Number.isFinite(Number(maxMarks)) || Number(maxMarks) < 0) {
            return res.status(400).json({
                success: false,
                message: "Maximum marks must be zero or greater."
            });
        }

        const [classData, subjectData] = await Promise.all([
            Class.findOne({ _id: classId, isActive: true }),
            Subject.findOne({ _id: subjectId, isActive: true })
        ]);

        if (!classData || !subjectData) {
            return res.status(400).json({
                success: false,
                message: "Active class and subject are required."
            });
        }

        if (!subjectData.classes.some(
            id => id.toString() === classId.toString()
        )) {
            return res.status(400).json({
                success: false,
                message: "This subject is not assigned to the selected class."
            });
        }

        if (req.user.role === "teacher") {
            if (!isTeacherAssigned(req.user, classId, subjectId)) {
                return res.status(403).json({
                    success: false,
                    message: "You are not assigned to this class and subject."
                });
            }
        }

        const assignment = await Assignment.create({
            title,
            description,
            instructions,
            teacher: req.user._id,
            class: classId,
            subject: subjectId,
            dueDate: parsedDueDate,
            maxMarks: Number(maxMarks),
            status,
            allowTextSubmission,
            allowFileSubmission,
            allowedFileTypes,
            publishedAt: status === "published" ? new Date() : null
        });

        res.status(201).json({
            success: true,
            message: "Assignment created successfully.",
            data: { assignment }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to create assignment.",
            error: error.message
        });
    }
};

// PUT /api/assignments/:id
const updateAssignment = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assignment ID."
            });
        }

        const assignment = await Assignment.findById(id);

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: "Assignment not found."
            });
        }

        if (!canManageAssignment(req.user, assignment)) {
            return res.status(403).json({
                success: false,
                message: "You cannot update this assignment."
            });
        }

        const allowedFields = [
            "title",
            "description",
            "instructions",
            "dueDate",
            "maxMarks",
            "allowTextSubmission",
            "allowFileSubmission",
            "allowedFileTypes"
        ];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                assignment[field] = req.body[field];
            }
        }

        if (req.body.dueDate !== undefined) {
            const date = new Date(req.body.dueDate);

            if (Number.isNaN(date.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid due date."
                });
            }

            assignment.dueDate = date;
        }

        if (req.body.maxMarks !== undefined) {
            if (!Number.isFinite(Number(req.body.maxMarks)) ||
                Number(req.body.maxMarks) < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid maximum marks."
                });
            }

            assignment.maxMarks = Number(req.body.maxMarks);
        }

        if (req.body.status !== undefined) {
            if (!["draft", "published", "closed"].includes(req.body.status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid assignment status."
                });
            }

            assignment.status = req.body.status;

            if (req.body.status === "published" && !assignment.publishedAt) {
                assignment.publishedAt = new Date();
            }
        }

        await assignment.save();

        res.status(200).json({
            success: true,
            message: "Assignment updated successfully.",
            data: { assignment }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to update assignment.",
            error: error.message
        });
    }
};

// DELETE /api/assignments/:id
const deleteAssignment = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assignment ID."
            });
        }

        const assignment = await Assignment.findById(id);

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: "Assignment not found."
            });
        }

        if (!canManageAssignment(req.user, assignment)) {
            return res.status(403).json({
                success: false,
                message: "You cannot delete this assignment."
            });
        }

        const hasSubmissions = await Submission.exists({
            assignment: id
        });

        if (hasSubmissions) {
            return res.status(409).json({
                success: false,
                message: "This assignment has submissions. Close it instead of deleting."
            });
        }

        await assignment.deleteOne();

        res.status(200).json({
            success: true,
            message: "Assignment deleted successfully."
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to delete assignment."
        });
    }
};

module.exports = {
    getAssignments,
    getAssignment,
    createAssignment,
    updateAssignment,
    deleteAssignment
};
