
const mongoose = require("mongoose");
const { User, Class } = require("../models");

const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET ALL STUDENTS + SEARCH + FILTER + PAGINATION
exports.getStudents = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const filter = { role: "student" };

        if (req.query.search?.trim()) {
            const search = escapeRegex(req.query.search.trim());

            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { admissionNumber: { $regex: search, $options: "i" } },
                { rollNumber: { $regex: search, $options: "i" } }
            ];
        }

        if (req.query.class && mongoose.isValidObjectId(req.query.class)) {
            filter.class = req.query.class;
        }

        if (req.query.isActive === "true") filter.isActive = true;
        if (req.query.isActive === "false") filter.isActive = false;

        const [students, total] = await Promise.all([
            User.find(filter)
                .select("-password")
                .populate("class", "name section academicYear")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            User.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            results: students.length,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            data: students
        });

    } catch (error) {
        console.error("Get Students Error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to retrieve students."
        });
    }
};

// GET SINGLE STUDENT
exports.getStudent = async (req, res) => {
    try {
        const student = await User.findOne({
            _id: req.params.id,
            role: "student"
        })
            .select("-password")
            .populate("class", "name section academicYear classTeacher");

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        res.status(200).json({
            success: true,
            data: student
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Invalid student ID."
        });
    }
};

// CREATE STUDENT
exports.createStudent = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            phone,
            admissionNumber,
            rollNumber,
            class: classId,
            dateOfBirth,
            guardianName,
            guardianPhone
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters."
            });
        }

        let classDoc = null;

        if (classId) {
            if (!mongoose.isValidObjectId(classId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid class ID."
                });
            }

            classDoc = await Class.findOne({
                _id: classId,
                isActive: true
            });

            if (!classDoc) {
                return res.status(404).json({
                    success: false,
                    message: "Active class not found."
                });
            }

            if (classDoc.students.length >= classDoc.capacity) {
                return res.status(400).json({
                    success: false,
                    message: "Class capacity has been reached."
                });
            }
        }

        const student = await User.create({
            name,
            email,
            password,
            phone,
            admissionNumber,
            rollNumber,
            class: classDoc?._id || null,
            dateOfBirth: dateOfBirth || null,
            guardianName,
            guardianPhone,
            role: "student"
        });

        if (classDoc) {
            classDoc.students.addToSet(student._id);
            await classDoc.save();
        }

        const result = await User.findById(student._id)
            .select("-password")
            .populate("class", "name section academicYear");

        res.status(201).json({
            success: true,
            message: "Student created successfully.",
            data: result
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email, admission number or roll number already exists."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Create Student Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to create student."
        });
    }
};

// UPDATE STUDENT
exports.updateStudent = async (req, res) => {
    try {
        const student = await User.findOne({
            _id: req.params.id,
            role: "student"
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        const allowedFields = [
            "name",
            "email",
            "phone",
            "admissionNumber",
            "rollNumber",
            "dateOfBirth",
            "guardianName",
            "guardianPhone"
        ];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                student[field] = req.body[field];
            }
        }

        let newClass = null;
        const classWasProvided = Object.prototype.hasOwnProperty.call(
            req.body,
            "class"
        );

        if (classWasProvided) {
            const classId = req.body.class;

            if (classId) {
                if (!mongoose.isValidObjectId(classId)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid class ID."
                    });
                }

                newClass = await Class.findOne({
                    _id: classId,
                    isActive: true
                });

                if (!newClass) {
                    return res.status(404).json({
                        success: false,
                        message: "Active class not found."
                    });
                }

                const alreadyAssigned = newClass.students.some(
                    id => id.toString() === student._id.toString()
                );

                if (
                    !alreadyAssigned &&
                    newClass.students.length >= newClass.capacity
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "Class capacity has been reached."
                    });
                }
            }

            student.class = newClass?._id || null;
        }

        await student.save();

        if (classWasProvided) {
            const previousClassId = student.class;

            // Remove from every other class to keep membership consistent.
            await Class.updateMany(
                { students: student._id },
                { $pull: { students: student._id } }
            );

            if (newClass) {
                await Class.updateOne(
                    { _id: newClass._id },
                    { $addToSet: { students: student._id } }
                );
            }
        }

        const updatedStudent = await User.findById(student._id)
            .select("-password")
            .populate("class", "name section academicYear");

        res.status(200).json({
            success: true,
            message: "Student updated successfully.",
            data: updatedStudent
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email, admission number or roll number already exists."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Update Student Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to update student."
        });
    }
};

// DELETE STUDENT
exports.deleteStudent = async (req, res) => {
    try {
        const student = await User.findOneAndDelete({
            _id: req.params.id,
            role: "student"
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        await Class.updateMany(
            { students: student._id },
            { $pull: { students: student._id } }
        );

        res.status(200).json({
            success: true,
            message: "Student deleted successfully."
        });

    } catch (error) {
        console.error("Delete Student Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to delete student."
        });
    }
};

// ACTIVATE / DEACTIVATE STUDENT
exports.toggleStudentStatus = async (req, res) => {
    try {
        const student = await User.findOne({
            _id: req.params.id,
            role: "student"
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        student.isActive = !student.isActive;
        await student.save();

        res.status(200).json({
            success: true,
            message: `Student ${student.isActive ? "activated" : "deactivated"} successfully.`,
            data: {
                id: student._id,
                isActive: student.isActive
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to update student status."
        });
    }
};
