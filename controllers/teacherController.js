
const mongoose = require("mongoose");
const { User, Class, Subject } = require("../models");

const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validateIds = (ids) =>
    Array.isArray(ids) &&
    ids.every(id => mongoose.isValidObjectId(id));

const validateAssignments = async (classIds, subjectIds) => {
    if (!validateIds(classIds) || !validateIds(subjectIds)) {
        return "Invalid class or subject ID.";
    }

    const [classes, subjects] = await Promise.all([
        Class.find({ _id: { $in: classIds }, isActive: true }).select("_id"),
        Subject.find({ _id: { $in: subjectIds } }).select("_id")
    ]);

    if (classes.length !== new Set(classIds.map(String)).size) {
        return "One or more classes are invalid or inactive.";
    }

    if (subjects.length !== new Set(subjectIds.map(String)).size) {
        return "One or more subjects do not exist.";
    }

    return null;
};

// GET ALL TEACHERS
exports.getTeachers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const filter = { role: "teacher" };

        if (req.query.search?.trim()) {
            const search = escapeRegex(req.query.search.trim());

            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }

        if (req.query.isActive === "true") filter.isActive = true;
        if (req.query.isActive === "false") filter.isActive = false;

        const [teachers, total] = await Promise.all([
            User.find(filter)
                .select("-password")
                .populate("assignedClasses", "name section academicYear")
                .populate("assignedSubjects")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            User.countDocuments(filter)
        ]);

        res.json({
            success: true,
            results: teachers.length,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            data: teachers
        });
    } catch (error) {
        console.error("Get Teachers Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to retrieve teachers."
        });
    }
};

// GET SINGLE TEACHER
exports.getTeacher = async (req, res) => {
    try {
        const teacher = await User.findOne({
            _id: req.params.id,
            role: "teacher"
        })
            .select("-password")
            .populate("assignedClasses", "name section academicYear")
            .populate("assignedSubjects");

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: "Teacher not found."
            });
        }

        res.json({ success: true, data: teacher });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Invalid teacher ID."
        });
    }
};

// CREATE TEACHER
exports.createTeacher = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            phone,
            assignedClasses = [],
            assignedSubjects = []
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });
        }

        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters."
            });
        }

        if (!Array.isArray(assignedClasses) ||
            !Array.isArray(assignedSubjects)) {
            return res.status(400).json({
                success: false,
                message: "Assignments must be arrays of IDs."
            });
        }

        const assignmentError = await validateAssignments(
            assignedClasses,
            assignedSubjects
        );

        if (assignmentError) {
            return res.status(400).json({
                success: false,
                message: assignmentError
            });
        }

        const teacher = await User.create({
            name,
            email,
            password,
            phone,
            role: "teacher",
            assignedClasses,
            assignedSubjects
        });

        // Keep each class's classTeacher reference synchronized.
        if (assignedClasses.length) {
            await Class.updateMany(
                { _id: { $in: assignedClasses } },
                { $set: { classTeacher: teacher._id } }
            );
        }

        const result = await User.findById(teacher._id)
            .select("-password")
            .populate("assignedClasses", "name section academicYear")
            .populate("assignedSubjects");

        res.status(201).json({
            success: true,
            message: "Teacher created successfully.",
            data: result
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email already exists."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Create Teacher Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to create teacher."
        });
    }
};

// UPDATE TEACHER
exports.updateTeacher = async (req, res) => {
    try {
        const teacher = await User.findOne({
            _id: req.params.id,
            role: "teacher"
        });

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: "Teacher not found."
            });
        }

        const allowedFields = ["name", "email", "phone"];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                teacher[field] = req.body[field];
            }
        }

        const hasClasses = Object.prototype.hasOwnProperty.call(
            req.body, "assignedClasses"
        );

        const hasSubjects = Object.prototype.hasOwnProperty.call(
            req.body, "assignedSubjects"
        );

        if (hasClasses || hasSubjects) {
            const classIds = hasClasses
                ? req.body.assignedClasses
                : teacher.assignedClasses.map(id => id.toString());

            const subjectIds = hasSubjects
                ? req.body.assignedSubjects
                : teacher.assignedSubjects.map(id => id.toString());

            if (!Array.isArray(classIds) || !Array.isArray(subjectIds)) {
                return res.status(400).json({
                    success: false,
                    message: "Assignments must be arrays of IDs."
                });
            }

            const assignmentError = await validateAssignments(
                classIds,
                subjectIds
            );

            if (assignmentError) {
                return res.status(400).json({
                    success: false,
                    message: assignmentError
                });
            }

            teacher.assignedClasses = classIds;
            teacher.assignedSubjects = subjectIds;
        }

        await teacher.save();

        if (hasClasses) {
            // Remove this teacher from classes no longer assigned.
            await Class.updateMany(
                { classTeacher: teacher._id },
                { $set: { classTeacher: null } }
            );

            // Assign teacher to the newly selected classes.
            if (teacher.assignedClasses.length) {
                await Class.updateMany(
                    { _id: { $in: teacher.assignedClasses } },
                    { $set: { classTeacher: teacher._id } }
                );
            }
        }

        const updated = await User.findById(teacher._id)
            .select("-password")
            .populate("assignedClasses", "name section academicYear")
            .populate("assignedSubjects");

        res.json({
            success: true,
            message: "Teacher updated successfully.",
            data: updated
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email already exists."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Update Teacher Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to update teacher."
        });
    }
};

// DELETE TEACHER
exports.deleteTeacher = async (req, res) => {
    try {
        const teacher = await User.findOneAndDelete({
            _id: req.params.id,
            role: "teacher"
        });

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: "Teacher not found."
            });
        }

        await Class.updateMany(
            { classTeacher: teacher._id },
            { $set: { classTeacher: null } }
        );

        res.json({
            success: true,
            message: "Teacher deleted successfully."
        });
    } catch (error) {
        console.error("Delete Teacher Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to delete teacher."
        });
    }
};

// ACTIVATE / DEACTIVATE TEACHER
exports.toggleTeacherStatus = async (req, res) => {
    try {
        const teacher = await User.findOne({
            _id: req.params.id,
            role: "teacher"
        });

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: "Teacher not found."
            });
        }

        teacher.isActive = !teacher.isActive;
        await teacher.save();

        res.json({
            success: true,
            message: `Teacher ${teacher.isActive ? "activated" : "deactivated"} successfully.`,
            data: {
                id: teacher._id,
                isActive: teacher.isActive
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to update teacher status."
        });
    }
};
