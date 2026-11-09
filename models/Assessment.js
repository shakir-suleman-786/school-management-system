
const mongoose = require("mongoose");

const assessmentSchema = new mongoose.Schema(
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

        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            required: true
        },

        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        month: {
            type: Number,
            required: true,
            min: 1,
            max: 12
        },

        year: {
            type: Number,
            required: true,
            min: 2000,
            max: 2100
        },

        marksObtained: {
            type: Number,
            required: true,
            min: 0
        },

        totalMarks: {
            type: Number,
            required: true,
            min: 1
        },
       
        remarks: {
            type: String,
            default: "",
            maxlength: 2000
        },

        assessmentDate: {
            type: Date,
            default: Date.now
        }
    },
    
{
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
}
    
);

// Validate marks before saving
assessmentSchema.pre("validate", function () {
    if (
        this.marksObtained != null &&
        this.totalMarks != null &&
        this.marksObtained > this.totalMarks
    ) {
        this.invalidate(
            "marksObtained",
            "Obtained marks cannot exceed total marks."
        );
    }
});

// Calculate percentage
assessmentSchema.virtual("percentage").get(function () {
    if (!this.totalMarks) return 0;

    return Number(
        ((this.marksObtained / this.totalMarks) * 100).toFixed(2)
    );
});

// Prevent duplicate monthly subject assessments
assessmentSchema.index(
    { student: 1, subject: 1, month: 1, year: 1 },
    { unique: true }
);

assessmentSchema.index({ class: 1, month: 1, year: 1 });
assessmentSchema.index({ teacher: 1, month: 1, year: 1 });

module.exports = mongoose.model("Assessment", assessmentSchema);
