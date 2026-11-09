
const mongoose = require("mongoose");
const { Subject, User, Class } = require("../models");

const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validateReferences = async (teacherId, classIds) => {
    if (teacherId) {
        if (!mongoose.isValidObjectId(teacherId)) {
            return "Invalid teacher ID.";
        }

        const teacher = await User.findOne({
            _id: teacherId,
            role: "teacher",
            isActive: true
        });

        if (!teacher) return "Active teacher not found.";
    }

    if (classIds.length) {
        const validClasses = await Class.countDocuments({
            _id: { $in: classIds }
        });

        if (validClasses !== classIds.length) {
            return "One or more classes were not found.";
        }
    }

    return null;
};

const getSubjects = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const filter = {};

        if (req.query.search) {
            const search = escapeRegex(req.query.search.trim());

            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { code: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } }
            ];
        }

        if (req.query.isActive !== undefined) {
            filter.isActive = req.query.isActive === "true";
        }

        if (req.query.teacher) filter.teacher = req.query.teacher;
        if (req.query.class) filter.classes = req.query.class;

        const [subjects, total] = await Promise.all([
            Subject.find(filter)
                .populate("teacher", "name email")
                .populate("classes", "name section academicYear")
                .sort({ name: 1 })
                .skip(skip)
                .limit(limit),

            Subject.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: {
                subjects,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve subjects."
        });
    }
};

const getSubject = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID."
            });
        }

        const subject = await Subject.findById(req.params.id)
            .populate("teacher", "name email phone")
            .populate("classes", "name section academicYear");

        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found."
            });
        }

        res.status(200).json({
            success: true,
            data: { subject }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve subject."
        });
    }
};

const createSubject = async (req, res) => {
    try {
        const { name, code, description = "", teacher = null } = req.body;
        const classes = req.body.classes || [];

        if (!name?.trim() || !code?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Subject name and code are required."
            });
        }

        if (!Array.isArray(classes) ||
            classes.some(id => !mongoose.isValidObjectId(id)) ||
            new Set(classes.map(String)).size !== classes.length) {
            return res.status(400).json({
                success: false,
                message: "Invalid or duplicate class IDs."
            });
        }

        const referenceError = await validateReferences(teacher, classes);

        if (referenceError) {
            return res.status(400).json({
                success: false,
                message: referenceError
            });
        }

        const subject = await Subject.create({
            name: name.trim(),
            code: code.trim().toUpperCase(),
            description,
            teacher,
            classes
        });

        if (teacher) {
            await User.updateOne(
                { _id: teacher },
                { $addToSet: { assignedSubjects: subject._id } }
            );
        }

        if (classes.length) {
            await Class.updateMany(
                { _id: { $in: classes } },
                { $addToSet: { subjects: subject._id } }
            );
        }

        const populatedSubject = await Subject.findById(subject._id)
            .populate("teacher", "name email")
            .populate("classes", "name section academicYear");

        res.status(201).json({
            success: true,
            message: "Subject created successfully.",
            data: { subject: populatedSubject }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Subject code already exists."
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to create subject.",
            error: error.message
        });
    }
};

const updateSubject = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID."
            });
        }

        const subject = await Subject.findById(id);

        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found."
            });
        }

        const allowedFields = ["name", "code", "description", "isActive"];

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                subject[field] = field === "code"
                    ? String(req.body[field]).trim().toUpperCase()
                    : req.body[field];
            }
        });

        let newTeacher = subject.teacher?.toString() || null;
        let newClasses = subject.classes.map(item => item.toString());

        if (req.body.teacher !== undefined) {
            newTeacher = req.body.teacher || null;
        }

        if (req.body.classes !== undefined) {
            if (!Array.isArray(req.body.classes) ||
                req.body.classes.some(item => !mongoose.isValidObjectId(item)) ||
                new Set(req.body.classes.map(String)).size !== req.body.classes.length) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or duplicate class IDs."
                });
            }

            newClasses = req.body.classes;
        }

        const referenceError = await validateReferences(
            newTeacher,
            newClasses
        );

        if (referenceError) {
            return res.status(400).json({
                success: false,
                message: referenceError
            });
        }

        const oldTeacher = subject.teacher?.toString();
        const oldClasses = subject.classes.map(item => item.toString());

        subject.teacher = newTeacher;
        subject.classes = newClasses;

        await subject.save();

        if (oldTeacher && oldTeacher !== newTeacher) {
            await User.updateOne(
                { _id: oldTeacher },
                { $pull: { assignedSubjects: subject._id } }
            );
        }

        if (newTeacher) {
            await User.updateOne(
                { _id: newTeacher },
                { $addToSet: { assignedSubjects: subject._id } }
            );
        }

        const removedClasses = oldClasses.filter(
            classId => !newClasses.includes(classId)
        );

        if (removedClasses.length) {
            await Class.updateMany(
                { _id: { $in: removedClasses } },
                { $pull: { subjects: subject._id } }
            );
        }

        if (newClasses.length) {
            await Class.updateMany(
                { _id: { $in: newClasses } },
                { $addToSet: { subjects: subject._id } }
            );
        }

        const updatedSubject = await Subject.findById(id)
            .populate("teacher", "name email")
            .populate("classes", "name section academicYear");

        res.status(200).json({
            success: true,
            message: "Subject updated successfully.",
            data: { subject: updatedSubject }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Subject code already exists."
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to update subject.",
            error: error.message
        });
    }
};

const deleteSubject = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID."
            });
        }

        const subject = await Subject.findById(id);

        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found."
            });
        }

        // Prevent deletion if academic records still reference this subject.
        const { Assignment, Assessment } = require("../models");

        const [assignments, assessments] = await Promise.all([
            Assignment.exists({ subject: id }),
            Assessment.exists({ subject: id })
        ]);

        if (assignments || assessments) {
            return res.status(409).json({
                success: false,
                message: "This subject has academic records and cannot be deleted. Deactivate it instead."
            });
        }

        await Promise.all([
            subject.teacher
                ? User.updateOne(
                    { _id: subject.teacher },
                    { $pull: { assignedSubjects: subject._id } }
                )
                : Promise.resolve(),

            Class.updateMany(
                { subjects: subject._id },
                { $pull: { subjects: subject._id } }
            )
        ]);

        await Subject.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Subject deleted successfully."
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to delete subject."
        });
    }
};

const toggleSubjectStatus = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID."
            });
        }

        const subject = await Subject.findById(req.params.id);

        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found."
            });
        }

        subject.isActive = !subject.isActive;
        await subject.save();

        res.status(200).json({
            success: true,
            message: `Subject ${subject.isActive ? "activated" : "deactivated"} successfully.`,
            data: { isActive: subject.isActive }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to update subject status."
        });
    }
};

module.exports = {
    getSubjects,
    getSubject,
    createSubject,
    updateSubject,
    deleteSubject,
    toggleSubjectStatus
};
