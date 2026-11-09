
const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class",
            required: true
        },

        markedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        date: {
            type: Date,
            required: true
        },

        status: {
            type: String,
            enum: ["present", "absent", "late", "excused"],
            required: true
        },

        remarks: {
            type: String,
            default: "",
            maxlength: 1000
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// One attendance record per student per day
attendanceSchema.index(
    { student: 1, date: 1 },
    { unique: true }
);

attendanceSchema.index({ class: 1, date: 1 });
attendanceSchema.index({ markedBy: 1, date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
