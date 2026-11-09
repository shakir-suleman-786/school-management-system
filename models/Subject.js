
const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },

        description: {
            type: String,
            default: "",
            trim: true
        },

        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        classes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class"
        }],

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

subjectSchema.index({ teacher: 1 });
subjectSchema.index({ classes: 1 });

module.exports = mongoose.model("Subject", subjectSchema);
