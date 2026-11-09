
const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },

        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 10000
        },

        audience: {
            type: String,
            enum: [
                "all",
                "students",
                "teachers",
                "specific_class"
            ],
            default: "all"
        },

        targetClasses: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class"
        }],

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        isPublished: {
            type: Boolean,
            default: false
        },

        publishedAt: {
            type: Date,
            default: null
        },

        expiresAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Notices by audience and publication status
noticeSchema.index({ audience: 1, isPublished: 1 });
noticeSchema.index({ targetClasses: 1 });
noticeSchema.index({ publishedAt: -1 });

module.exports = mongoose.model("Notice", noticeSchema);
