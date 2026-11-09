
const {
    User,
    Class,
    Subject,
    Attendance,
    Assignment,
    Submission,
    Assessment,
    Notice
} = require("../models");

exports.getDashboardOverview = async (req, res) => {
    try {
        const [
            totalStudents,
            totalTeachers,
            totalAdmins,
            totalClasses,
            totalSubjects,
            totalAttendance,
            totalAssignments,
            totalSubmissions,
            totalAssessments,
            totalNotices,
            recentStudents
        ] = await Promise.all([
            User.countDocuments({ role: "student" }),
            User.countDocuments({ role: "teacher" }),
            User.countDocuments({ role: "admin" }),
            Class.countDocuments(),
            Subject.countDocuments(),
            Attendance.countDocuments(),
            Assignment.countDocuments(),
            Submission.countDocuments(),
            Assessment.countDocuments(),
            Notice.countDocuments(),

            User.find({ role: "student" })
                .select("name email admissionNumber rollNumber isActive createdAt")
                .sort({ createdAt: -1 })
                .limit(5)
                .lean()
        ]);

        res.status(200).json({
            success: true,
            data: {
                statistics: {
                    totalStudents,
                    totalTeachers,
                    totalAdmins,
                    totalClasses,
                    totalSubjects,
                    totalAttendance,
                    totalAssignments,
                    totalSubmissions,
                    totalAssessments,
                    totalNotices
                },
                recentStudents
            }
        });

    } catch (error) {
        console.error("Dashboard Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load dashboard information."
        });
    }
};
