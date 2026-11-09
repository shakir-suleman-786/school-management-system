
const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            default: "school",
            unique: true,
            immutable: true
        },

        schoolName: {
            type: String,
            default: "My School",
            trim: true
        },

        schoolAddress: {
            type: String,
            default: ""
        },

        schoolPhone: {
            type: String,
            default: ""
        },

        schoolEmail: {
            type: String,
            default: ""
        },

        logo: {
            path: {
                type: String,
                default: ""
            },

            filename: {
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
            },

            uploadedAt: {
                type: Date,
                default: null
            }
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

module.exports = mongoose.model("Settings", settingsSchema);
