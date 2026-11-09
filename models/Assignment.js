
const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        instructions: {
            type: String,
            default: ""
        },

        teacher: {
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

        dueDate: {
            type: Date,
            required: true
        },

        maxMarks: {
            type: Number,
            default: 100,
            min: 0
        },

        status: {
            type: String,
            enum: ["draft", "published", "closed"],
            default: "draft"
        },

        allowTextSubmission: {
            type: Boolean,
            default: true
        },

        allowFileSubmission: {
            type: Boolean,
            default: true
        },

        allowedFileTypes: [{
            type: String,
            enum: ["pdf", "doc", "docx", "jpg", "jpeg", "png"]
        }],

        publishedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

assignmentSchema.index({ class: 1, subject: 1 });
assignmentSchema.index({ teacher: 1, createdAt: -1 });
assignmentSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);
