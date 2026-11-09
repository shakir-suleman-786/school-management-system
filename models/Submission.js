
const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
    {
        assignment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Assignment",
            required: true
        },

        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // Direct text submission
        textContent: {
            type: String,
            default: "",
            maxlength: 50000
        },

        // Uploaded file information
        file: {
            originalName: {
                type: String,
                default: ""
            },

            storedName: {
                type: String,
                default: ""
            },

            path: {
                type: String,
                default: ""
            },

            mimeType: {
                type: String,
                default: ""
            },

            size: {
                type: Number,
                default: 0
            }
        },

        submissionType: {
            type: String,
            enum: ["text", "file", "both"],
            required: true
        },

        status: {
            type: String,
            enum: ["submitted", "graded"],
            default: "submitted"
        },

        submittedAt: {
            type: Date,
            default: Date.now
        },

        isLate: {
            type: Boolean,
            default: false
        },

        // Grading information
        marksObtained: {
            type: Number,
            min: 0,
            default: null
        },

        feedback: {
            type: String,
            default: "",
            maxlength: 5000
        },

        gradedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        gradedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// A student can submit only once per assignment.
// Resubmission will update the existing record.
submissionSchema.index(
    { assignment: 1, student: 1 },
    { unique: true }
);

submissionSchema.index({ student: 1, status: 1 });
submissionSchema.index({ assignment: 1, status: 1 });

module.exports = mongoose.model("Submission", submissionSchema);
