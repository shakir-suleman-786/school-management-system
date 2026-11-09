
const mongoose = require("mongoose");
const {
    Assessment,
    User,
    Class,
    Subject
} = require("../models");

const validId = (id) => mongoose.isValidObjectId(id);

const sameId = (a, b) =>
    a && b && a.toString() === b.toString();

const teacherCanAccess = (teacher, classId, subjectId) => {
    const assignedClasses = (teacher.assignedClasses || []).map(String);
    const assignedSubjects = (teacher.assignedSubjects || []).map(String);

    return (
        assignedClasses.includes(classId.toString()) &&
        assignedSubjects.includes(subjectId.toString())
    );
};

const canManageAssessment = (user, assessment) => {
    if (user.role === "admin") return true;

    if (user.role !== "teacher") return false;

    return teacherCanAccess(
        user,
        assessment.class?._id || assessment.class,
        assessment.subject?._id || assessment.subject
    );
};

const populateAssessment = (query) =>
    query
        .populate("student", "name email admissionNumber rollNumber")
        .populate("class", "name section academicYear")
        .populate("subject", "name code")
        .populate("teacher", "name email");

// GET ALL ASSESSMENTS
exports.getAssessments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit) || 10)
        );

        const filter = {};

        if (req.user.role === "student") {
            filter.student = req.user._id;
        }

        if (req.user.role === "teacher") {
            filter.class = { $in: req.user.assignedClasses || [] };
            filter.subject = { $in: req.user.assignedSubjects || [] };
        }

        for (const field of ["student", "class", "subject"]) {
            if (req.query[field]) {
                if (!validId(req.query[field])) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid ${field} ID.`
                    });
                }

                filter[field] = req.query[field];
            }
        }

        if (req.query.month) {
            const month = Number(req.query.month);

            if (!Number.isInteger(month) || month < 1 || month > 12) {
                return res.status(400).json({
                    success: false,
                    message: "Month must be between 1 and 12."
                });
            }

            filter.month = month;
        }

        if (req.query.year) {
            const year = Number(req.query.year);

            if (!Number.isInteger(year) || year < 2000 || year > 2100) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid assessment year."
                });
            }

            filter.year = year;
        }

        const [assessments, total] = await Promise.all([
            populateAssessment(
                Assessment.find(filter)
                    .sort({ year: -1, month: -1, createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
            ),

            Assessment.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            results: assessments.length,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            data: assessments
        });

    } catch (error) {
        console.error("Get Assessments Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to retrieve assessments."
        });
    }
};

// GET SINGLE ASSESSMENT
exports.getAssessment = async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assessment ID."
            });
        }

        const assessment = await populateAssessment(
            Assessment.findById(req.params.id)
        );

        if (!assessment) {
            return res.status(404).json({
                success: false,
                message: "Assessment not found."
            });
        }

        if (req.user.role === "student") {
            if (!sameId(assessment.student._id, req.user._id)) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot access this assessment."
                });
            }
        } else if (!canManageAssessment(req.user, assessment)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to access this assessment."
            });
        }

        res.status(200).json({
            success: true,
            data: assessment
        });

    } catch (error) {
        console.error("Get Assessment Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to retrieve assessment."
        });
    }
};

// CREATE ASSESSMENT
exports.createAssessment = async (req, res) => {
    try {
        const {
            student: studentId,
            class: classId,
            subject: subjectId,
            month,
            year,
            marksObtained,
            totalMarks,
            remarks,
            assessmentDate,
            teacher: teacherId
        } = req.body;

        if (
            !studentId ||
            !classId ||
            !subjectId ||
            month === undefined ||
            year === undefined ||
            marksObtained === undefined ||
            totalMarks === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Student, class, subject, month, year and marks are required."
            });
        }

        if (
            !validId(studentId) ||
            !validId(classId) ||
            !validId(subjectId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid student, class or subject ID."
            });
        }

        const numericMonth = Number(month);
        const numericYear = Number(year);
        const obtained = Number(marksObtained);
        const total = Number(totalMarks);

        if (
            !Number.isInteger(numericMonth) ||
            numericMonth < 1 ||
            numericMonth > 12 ||
            !Number.isInteger(numericYear) ||
            numericYear < 2000 ||
            numericYear > 2100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid month or year."
            });
        }

        if (
            !Number.isFinite(obtained) ||
            !Number.isFinite(total) ||
            total < 1 ||
            obtained < 0 ||
            obtained > total
        ) {
            return res.status(400).json({
                success: false,
                message: "Marks must be valid and obtained marks cannot exceed total marks."
            });
        }

        const [student, classDoc, subject] = await Promise.all([
            User.findOne({
                _id: studentId,
                role: "student",
                isActive: true
            }),

            Class.findOne({
                _id: classId,
                isActive: true
            }),

            Subject.findOne({
                _id: subjectId,
                isActive: true
            })
        ]);

        if (!student || !classDoc || !subject) {
            return res.status(404).json({
                success: false,
                message: "Active student, class or subject not found."
            });
        }

        if (!sameId(student.class, classDoc._id)) {
            return res.status(400).json({
                success: false,
                message: "Student does not belong to the selected class."
            });
        }

        const subjectBelongsToClass = classDoc.subjects.some(
            id => sameId(id, subject._id)
        );

        if (!subjectBelongsToClass) {
            return res.status(400).json({
                success: false,
                message: "This subject is not assigned to the selected class."
            });
        }

        let assessmentTeacher;

        if (req.user.role === "teacher") {
            if (!teacherCanAccess(req.user, classId, subjectId)) {
                return res.status(403).json({
                    success: false,
                    message: "You are not assigned to this class or subject."
                });
            }

            assessmentTeacher = req.user._id;
        } else {
            const selectedTeacherId =
                teacherId || classDoc.classTeacher;

            if (!selectedTeacherId || !validId(selectedTeacherId)) {
                return res.status(400).json({
                    success: false,
                    message: "Select a valid teacher for this assessment."
                });
            }

            const teacher = await User.findOne({
                _id: selectedTeacherId,
                role: "teacher",
                isActive: true
            });

            if (!teacher) {
                return res.status(404).json({
                    success: false,
                    message: "Active teacher not found."
                });
            }

            if (!teacherCanAccess(teacher, classId, subjectId)) {
                return res.status(400).json({
                    success: false,
                    message: "Selected teacher is not assigned to this class and subject."
                });
            }

            assessmentTeacher = teacher._id;
        }

        const assessment = await Assessment.create({
            student: student._id,
            class: classDoc._id,
            subject: subject._id,
            teacher: assessmentTeacher,
            month: numericMonth,
            year: numericYear,
            marksObtained: obtained,
            totalMarks: total,
            remarks: remarks || "",
            assessmentDate: assessmentDate || Date.now()
        });

        const result = await populateAssessment(
            Assessment.findById(assessment._id)
        );

        res.status(201).json({
            success: true,
            message: "Assessment created successfully.",
            data: result
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An assessment already exists for this student, subject and month."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Create Assessment Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to create assessment."
        });
    }
};

// UPDATE ASSESSMENT
exports.updateAssessment = async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assessment ID."
            });
        }

        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) {
            return res.status(404).json({
                success: false,
                message: "Assessment not found."
            });
        }

        if (!canManageAssessment(req.user, assessment)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update this assessment."
            });
        }

        const allowedFields = [
            "marksObtained",
            "totalMarks",
            "remarks",
            "assessmentDate"
        ];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                assessment[field] = req.body[field];
            }
        }

        if (
            !Number.isFinite(assessment.marksObtained) ||
            !Number.isFinite(assessment.totalMarks) ||
            assessment.totalMarks < 1 ||
            assessment.marksObtained < 0 ||
            assessment.marksObtained > assessment.totalMarks
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid marks. Obtained marks cannot exceed total marks."
            });
        }

        await assessment.save();

        const result = await populateAssessment(
            Assessment.findById(assessment._id)
        );

        res.status(200).json({
            success: true,
            message: "Assessment updated successfully.",
            data: result
        });

    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Update Assessment Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to update assessment."
        });
    }
};

// DELETE ASSESSMENT
exports.deleteAssessment = async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid assessment ID."
            });
        }

        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) {
            return res.status(404).json({
                success: false,
                message: "Assessment not found."
            });
        }

        if (!canManageAssessment(req.user, assessment)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this assessment."
            });
        }

        await assessment.deleteOne();

        res.status(200).json({
            success: true,
            message: "Assessment deleted successfully."
        });

    } catch (error) {
        console.error("Delete Assessment Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to delete assessment."
        });
    }
};

// GET STUDENT RESULTS
exports.getStudentResults = async (req, res) => {
    try {
        const { studentId } = req.params;

        if (!validId(studentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID."
            });
        }

        if (
            req.user.role === "student" &&
            !sameId(req.user._id, studentId)
        ) {
            return res.status(403).json({
                success: false,
                message: "You can only view your own results."
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
            const assignedClasses = (req.user.assignedClasses || []).map(String);

            if (!student.class || !assignedClasses.includes(student.class.toString())) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot access this student's results."
                });
            }
        }

        const assessments = await populateAssessment(
            Assessment.find({ student: studentId })
                .sort({ year: -1, month: -1 })
        );

        const totalObtained = assessments.reduce(
            (sum, item) => sum + item.marksObtained,
            0
        );

        const totalPossible = assessments.reduce(
            (sum, item) => sum + item.totalMarks,
            0
        );

        const overallPercentage = totalPossible > 0
            ? Number(((totalObtained / totalPossible) * 100).toFixed(2))
            : 0;

        res.status(200).json({
            success: true,
            data: {
                student,
                summary: {
                    totalAssessments: assessments.length,
                    totalObtained,
                    totalPossible,
                    overallPercentage
                },
                assessments
            }
        });

    } catch (error) {
        console.error("Get Student Results Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to retrieve student results."
        });
    }
};
