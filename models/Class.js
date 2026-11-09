
const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        section: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        academicYear: {
            type: String,
            required: true,
            trim: true
        },

        classTeacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        students: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }],

        subjects: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject"
        }],

        roomNumber: {
            type: String,
            trim: true,
            default: ""
        },

        capacity: {
            type: Number,
            min: 1,
            default: 40
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Prevent duplicate class sections in the same academic year
classSchema.index(
    { name: 1, section: 1, academicYear: 1 },
    { unique: true }
);

classSchema.index({ classTeacher: 1 });
classSchema.index({ students: 1 });

module.exports = mongoose.model("Class", classSchema);
