
const mongoose = require("mongoose");
const { Class, User, Subject } = require("../models");

const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validIds = (ids) =>
    Array.isArray(ids) &&
    ids.every(id => mongoose.isValidObjectId(id));

const validateReferences = async ({
    teacherId,
    studentIds,
    subjectIds
}) => {
    if (teacherId && !mongoose.isValidObjectId(teacherId)) {
        return "Invalid teacher ID.";
    }

    if (!validIds(studentIds) || !validIds(subjectIds)) {
        return "Invalid student or subject ID.";
    }

    if (teacherId) {
        const teacher = await User.findOne({
            _id: teacherId,
            role: "teacher",
            isActive: true
        });

        if (!teacher) return "Active teacher not found.";
    }

    const [students, subjects] = await Promise.all([
        User.find({
            _id: { $in: studentIds },
            role: "student",
            isActive: true
        }).select("_id"),

        Subject.find({
            _id: { $in: subjectIds }
        }).select("_id")
    ]);

    if (students.length !== new Set(studentIds.map(String)).size) {
        return "One or more students are invalid or inactive.";
    }

    if (subjects.length !== new Set(subjectIds.map(String)).size) {
        return "One or more subjects do not exist.";
    }

    return null;
};

// GET ALL CLASSES
exports.getClasses = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

        const filter = {};

        if (req.query.search?.trim()) {
            const search = escapeRegex(req.query.search.trim());

            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { section: { $regex: search, $options: "i" } },
                { academicYear: { $regex: search, $options: "i" } }
            ];
        }

        if (req.query.isActive === "true") filter.isActive = true;
        if (req.query.isActive === "false") filter.isActive = false;

        const [classes, total] = await Promise.all([
            Class.find(filter)
                .populate("classTeacher", "name email")
                .populate("students", "name email admissionNumber rollNumber")
                .populate("subjects")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Class.countDocuments(filter)
        ]);

        res.json({
            success: true,
            results: classes.length,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            data: classes
        });

    } catch (error) {
        console.error("Get Classes Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to retrieve classes."
        });
    }
};

// GET SINGLE CLASS
exports.getClass = async (req, res) => {
    try {
        const classData = await Class.findById(req.params.id)
            .populate("classTeacher", "name email phone")
            .populate("students", "name email admissionNumber rollNumber")
            .populate("subjects");

        if (!classData) {
            return res.status(404).json({
                success: false,
                message: "Class not found."
            });
        }

        res.json({ success: true, data: classData });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Invalid class ID."
        });
    }
};

// CREATE CLASS
exports.createClass = async (req, res) => {
    try {
        const {
            name,
            section,
            academicYear,
            classTeacher = null,
            students = [],
            subjects = [],
            roomNumber = "",
            capacity = 40
        } = req.body;

        if (!name || !section || !academicYear) {
            return res.status(400).json({
                success: false,
                message: "Name, section and academic year are required."
            });
        }

        if (!Array.isArray(students) || !Array.isArray(subjects)) {
            return res.status(400).json({
                success: false,
                message: "Students and subjects must be arrays."
            });
        }

        if (!Number.isInteger(capacity) || capacity < 1) {
            return res.status(400).json({
                success: false,
                message: "Capacity must be a positive integer."
            });
        }

        if (students.length > capacity) {
            return res.status(400).json({
                success: false,
                message: "Students exceed the class capacity."
            });
        }

        const referenceError = await validateReferences({
            teacherId: classTeacher,
            studentIds: students,
            subjectIds: subjects
        });

        if (referenceError) {
            return res.status(400).json({
                success: false,
                message: referenceError
            });
        }

        const classData = await Class.create({
            name,
            section,
            academicYear,
            classTeacher,
            students,
            subjects,
            roomNumber,
            capacity
        });

        const result = await Class.findById(classData._id)
            .populate("classTeacher", "name email")
            .populate("students", "name email admissionNumber rollNumber")
            .populate("subjects");

        res.status(201).json({
            success: true,
            message: "Class created successfully.",
            data: result
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This class section already exists for the academic year."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Create Class Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to create class."
        });
    }
};

// UPDATE CLASS
exports.updateClass = async (req, res) => {
    try {
        const classData = await Class.findById(req.params.id);

        if (!classData) {
            return res.status(404).json({
                success: false,
                message: "Class not found."
            });
        }

        const allowedFields = [
            "name",
            "section",
            "academicYear",
            "roomNumber",
            "capacity",
            "isActive"
        ];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                classData[field] = req.body[field];
            }
        }

        const hasTeacher = Object.hasOwn(req.body, "classTeacher");
        const hasStudents = Object.hasOwn(req.body, "students");
        const hasSubjects = Object.hasOwn(req.body, "subjects");

        const teacherId = hasTeacher
            ? req.body.classTeacher
            : classData.classTeacher?.toString() || null;

        const students = hasStudents
            ? req.body.students
            : classData.students.map(id => id.toString());

        const subjects = hasSubjects
            ? req.body.subjects
            : classData.subjects.map(id => id.toString());

        if (!Array.isArray(students) || !Array.isArray(subjects)) {
            return res.status(400).json({
                success: false,
                message: "Students and subjects must be arrays."
            });
        }

        if (!Number.isInteger(classData.capacity) || classData.capacity < 1) {
            return res.status(400).json({
                success: false,
                message: "Capacity must be a positive integer."
            });
        }

        if (students.length > classData.capacity) {
            return res.status(400).json({
                success: false,
                message: "Students exceed the class capacity."
            });
        }

        const referenceError = await validateReferences({
            teacherId,
            studentIds: students,
            subjectIds: subjects
        });

        if (referenceError) {
            return res.status(400).json({
                success: false,
                message: referenceError
            });
        }

        classData.classTeacher = teacherId;
        classData.students = students;
        classData.subjects = subjects;

        await classData.save();

        // Keep student.class references synchronized.
        await User.updateMany(
            {
                role: "student",
                class: classData._id,
                _id: { $nin: students }
            },
            { $set: { class: null } }
        );

        if (students.length) {
            await User.updateMany(
                { _id: { $in: students }, role: "student" },
                { $set: { class: classData._id } }
            );
        }

        const result = await Class.findById(classData._id)
            .populate("classTeacher", "name email")
            .populate("students", "name email admissionNumber rollNumber")
            .populate("subjects");

        res.json({
            success: true,
            message: "Class updated successfully.",
            data: result
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This class section already exists for the academic year."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Update Class Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to update class."
        });
    }
};

// DELETE CLASS
exports.deleteClass = async (req, res) => {
    try {
        const classData = await Class.findById(req.params.id);

        if (!classData) {
            return res.status(404).json({
                success: false,
                message: "Class not found."
            });
        }

        // Unassign students before deleting the class.
        await User.updateMany(
            { class: classData._id, role: "student" },
            { $set: { class: null } }
        );

        await Class.findByIdAndDelete(classData._id);

        res.json({
            success: true,
            message: "Class deleted successfully."
        });

    } catch (error) {
        console.error("Delete Class Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to delete class."
        });
    }
};

// ADD STUDENT TO CLASS
exports.addStudent = async (req, res) => {
    try {
        const { studentId } = req.body;

        if (!mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID."
            });
        }

        const [classData, student] = await Promise.all([
            Class.findById(req.params.id),
            User.findOne({
                _id: studentId,
                role: "student",
                isActive: true
            })
        ]);

        if (!classData || !student) {
            return res.status(404).json({
                success: false,
                message: "Class or active student not found."
            });
        }

        if (student.class?.toString() === classData._id.toString()) {
            return res.status(409).json({
                success: false,
                message: "Student is already assigned to this class."
            });
        }

        if (classData.students.length >= classData.capacity) {
            return res.status(400).json({
                success: false,
                message: "Class capacity has been reached."
            });
        }

        // Remove student from any previous class.
        await Class.updateMany(
            { students: student._id },
            { $pull: { students: student._id } }
        );

        classData.students.addToSet(student._id);
        student.class = classData._id;

        await Promise.all([classData.save(), student.save()]);

        res.json({
            success: true,
            message: "Student assigned to class successfully."
        });

    } catch (error) {
        console.error("Add Student Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to assign student."
        });
    }
};

// REMOVE STUDENT FROM CLASS
exports.removeStudent = async (req, res) => {
    try {
        const { studentId } = req.body;

        if (!mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID."
            });
        }

        const classData = await Class.findById(req.params.id);

        if (!classData) {
            return res.status(404).json({
                success: false,
                message: "Class not found."
            });
        }

        await Class.updateOne(
            { _id: classData._id },
            { $pull: { students: studentId } }
        );

        await User.updateOne(
            {
                _id: studentId,
                role: "student",
                class: classData._id
            },
            { $set: { class: null } }
        );

        res.json({
            success: true,
            message: "Student removed from class successfully."
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to remove student."
        });
    }
};

// ACTIVATE / DEACTIVATE CLASS
exports.toggleClassStatus = async (req, res) => {
    try {
        const classData = await Class.findById(req.params.id);

        if (!classData) {
            return res.status(404).json({
                success: false,
                message: "Class not found."
            });
        }

        classData.isActive = !classData.isActive;
        await classData.save();

        res.json({
            success: true,
            message: `Class ${classData.isActive ? "activated" : "deactivated"} successfully.`,
            data: {
                id: classData._id,
                isActive: classData.isActive
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to update class status."
        });
    }
};
