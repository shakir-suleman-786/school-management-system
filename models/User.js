
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        // Basic user information
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: 2,
            maxlength: 100
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Invalid email address"]
        },

        password: {
            type: String,
            required: true,
            minlength: 8,
            select: false
        },

        // User roles
        role: {
            type: String,
            enum: ["admin", "teacher", "student"],
            required: true
        },

        phone: {
            type: String,
            trim: true,
            default: ""
        },

        profileImage: {
            type: String,
            default: ""
        },

        // Student-specific information
        admissionNumber: {
            type: String,
            trim: true
        },

        rollNumber: {
            type: String,
            trim: true
        },

        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class",
            default: null
        },

        dateOfBirth: {
            type: Date,
            default: null
        },

        guardianName: {
            type: String,
            trim: true,
            default: ""
        },

        guardianPhone: {
            type: String,
            trim: true,
            default: ""
        },

        // Teacher-specific information
        assignedClasses: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class"
        }],

        assignedSubjects: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject"
        }],

        // Account status
        isActive: {
            type: Boolean,
            default: true
        },

        lastLoginAt: {
            type: Date,
            default: null
        },

        // Password reset information
        passwordResetToken: {
            type: String,
            select: false
        },

        passwordResetExpires: {
            type: Date,
            select: false
        },

        passwordChangedAt: {
            type: Date,
            default: null,
            select: false
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Hash password before saving
userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 12);
});

// Compare entered password with hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};

// Check whether password was changed after JWT issuance
userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
    if (!this.passwordChangedAt) {
        return false;
    }

    const changedTimestamp = Math.floor(
        this.passwordChangedAt.getTime() / 1000
    );

    return changedTimestamp > jwtTimestamp;
};

// Unique admission number index
userSchema.index(
    { admissionNumber: 1 },
    {
        unique: true,
        partialFilterExpression: {
            admissionNumber: { $type: "string" }
        }
    }
);

// Unique roll number within a class
userSchema.index(
    { rollNumber: 1, class: 1 },
    {
        unique: true,
        partialFilterExpression: {
            rollNumber: { $type: "string" },
            class: { $type: "objectId" }
        }
    }
);

// Role and account status index
userSchema.index({ role: 1, isActive: 1 });

// Student class index
userSchema.index({ class: 1 });

module.exports = mongoose.model("User", userSchema);
