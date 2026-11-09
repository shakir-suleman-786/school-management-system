
const mongoose = require("mongoose");
const { Attendance, Class, User } = require("../models");

const validStatuses = ["present", "absent", "late", "excused"];

const getDateRange = (value) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const start = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(start.getTime()) ||
        start.toISOString().slice(0, 10) !== value) {
        return null;
    }

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return { start, end };
};

const canAccessClass = async (user, classId) => {
    if (user.role === "admin") return true;

    if (user.role !== "teacher") return false;

    return user.assignedClasses.some(
        id => id.toString() === classId.toString()
    );
};

// GET /api/attendance
const getAttendance = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

        const filter = {};

        if (req.user.role === "student") {
            filter.student = req.user._id;
        }

        if (req.query.date) {
            const range = getDateRange(req.query.date);

            if (!range) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date. Use YYYY-MM-DD."
                });
            }

            filter.date = { $gte: range.start, $lt: range.end };
        }

        if (req.query.class) {
            if (!mongoose.isValidObjectId(req.query.class)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid class ID."
                });
            }

            if (!(await canAccessClass(req.user, req.query.class))) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot access this class."
                });
            }

            filter.class = req.query.class;
        } else if (req.user.role === "teacher") {
            filter.class = { $in: req.user.assignedClasses };
        }

        if (req.query.student) {
            if (!mongoose.isValidObjectId(req.query.student)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid student ID."
                });
            }

            if (req.user.role === "student" &&
                req.query.student !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "You can only view your own attendance."
                });
            }

            filter.student = req.query.student;
        }

        if (req.query.status) {
            if (!validStatuses.includes(req.query.status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid attendance status."
                });
            }

            filter.status = req.query.status;
        }

        const [records, total] = await Promise.all([
            Attendance.find(filter)
                .populate("student", "name email admissionNumber rollNumber")
                .populate("class", "name section academicYear")
                .populate("markedBy", "name role")
                .sort({ date: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),

            Attendance.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: {
                attendance: records,
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
            message: "Failed to retrieve attendance."
        });
    }
};

// POST /api/attendance/bulk
const markAttendance = async (req, res) => {
    try {
        const { classId, date, records } = req.body;

        if (!mongoose.isValidObjectId(classId)) {
            return res.status(400).json({
                success: false,
                message: "Valid class ID is required."
            });
        }

        const range = getDateRange(date);

        if (!range) {
            return res.status(400).json({
                success: false,
                message: "Valid date is required in YYYY-MM-DD format."
            });
        }

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Attendance records are required."
            });
        }

        if (records.length > 200) {
            return res.status(400).json({
                success: false,
                message: "Maximum 200 students can be processed at once."
            });
        }

        if (!(await canAccessClass(req.user, classId))) {
            return res.status(403).json({
                success: false,
                message: "You are not assigned to this class."
            });
        }

        const classData = await Class.findById(classId);

        if (!classData || !classData.isActive) {
            return res.status(404).json({
                success: false,
                message: "Active class not found."
            });
        }

        const studentIds = records.map(record => record.studentId);

        if (
            studentIds.some(id => !mongoose.isValidObjectId(id)) ||
            new Set(studentIds.map(String)).size !== studentIds.length
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid or duplicate student IDs."
            });
        }

        for (const record of records) {
            if (!validStatuses.includes(record.status)) {
                return res.status(400).json({
                    success: false,
                    message: "Every record must have a valid attendance status."
                });
            }

            if (typeof (record.remarks || "") !== "string" ||
                (record.remarks || "").length > 1000) {
                return res.status(400).json({
                    success: false,
                    message: "Remarks must be text and cannot exceed 1000 characters."
                });
            }
        }

        const validStudents = await User.find({
            _id: { $in: studentIds },
            role: "student",
            class: classId,
            isActive: true
        }).select("_id");

        if (validStudents.length !== studentIds.length) {
            return res.status(400).json({
                success: false,
                message: "One or more students are not active members of this class."
            });
        }

        const operations = records.map(record => ({
            updateOne: {
                filter: {
                    student: record.studentId,
                    date: range.start
                },
                update: {
                    $set: {
                        class: classId,
                        markedBy: req.user._id,
                        date: range.start,
                        status: record.status,
                        remarks: record.remarks || ""
                    },
                    $setOnInsert: {
                        student: record.studentId
                    }
                },
                upsert: true
            }
        }));

        const result = await Attendance.bulkWrite(operations);

        res.status(200).json({
            success: true,
            message: "Attendance saved successfully.",
            data: {
                totalProcessed: records.length,
                created: result.upsertedCount,
                updated: result.modifiedCount
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to save attendance.",
            error: error.message
        });
    }
};

// GET /api/attendance/student/:studentId
const getStudentAttendance = async (req, res) => {
    try {
        const { studentId } = req.params;

        if (!mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID."
            });
        }

        if (req.user.role === "student" &&
            studentId !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only view your own attendance."
            });
        }

        const student = await User.findOne({
            _id: studentId,
            role: "student"
        }).select("name email admissionNumber rollNumber class");

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        if (req.user.role === "teacher") {
            if (!student.class ||
                !(await canAccessClass(req.user, student.class))) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot access this student's attendance."
                });
            }
        }

        const filter = { student: studentId };

        if (req.query.date) {
            const range = getDateRange(req.query.date);

            if (!range) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date. Use YYYY-MM-DD."
                });
            }

            filter.date = { $gte: range.start, $lt: range.end };
        }

        const attendance = await Attendance.find(filter)
            .populate("class", "name section academicYear")
            .populate("markedBy", "name role")
            .sort({ date: -1 });

        const summary = {
            total: attendance.length,
            present: attendance.filter(a => a.status === "present").length,
            absent: attendance.filter(a => a.status === "absent").length,
            late: attendance.filter(a => a.status === "late").length,
            excused: attendance.filter(a => a.status === "excused").length
        };

        res.status(200).json({
            success: true,
            data: { student, summary, attendance }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve student attendance."
        });
    }
};

// PATCH /api/attendance/:id
const updateAttendance = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid attendance ID."
            });
        }

        const attendance = await Attendance.findById(id);

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: "Attendance record not found."
            });
        }

        if (!(await canAccessClass(req.user, attendance.class))) {
            return res.status(403).json({
                success: false,
                message: "You cannot update this attendance."
            });
        }

        if (req.body.status !== undefined) {
            if (!validStatuses.includes(req.body.status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid attendance status."
                });
            }

            attendance.status = req.body.status;
        }

        if (req.body.remarks !== undefined) {
            if (typeof req.body.remarks !== "string" ||
                req.body.remarks.length > 1000) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid remarks."
                });
            }

            attendance.remarks = req.body.remarks;
        }

        attendance.markedBy = req.user._id;
        await attendance.save();

        res.status(200).json({
            success: true,
            message: "Attendance updated successfully.",
            data: { attendance }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to update attendance."
        });
    }
};

// DELETE /api/attendance/:id
const deleteAttendance = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid attendance ID."
            });
        }

        const attendance = await Attendance.findById(id);

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: "Attendance record not found."
            });
        }

        if (!(await canAccessClass(req.user, attendance.class))) {
            return res.status(403).json({
                success: false,
                message: "You cannot delete this attendance."
            });
        }

        await attendance.deleteOne();

        res.status(200).json({
            success: true,
            message: "Attendance deleted successfully."
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to delete attendance."
        });
    }
};

module.exports = {
    getAttendance,
    markAttendance,
    getStudentAttendance,
    updateAttendance,
    deleteAttendance
};
