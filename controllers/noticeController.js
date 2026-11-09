
const mongoose = require("mongoose");
const { Notice, Class } = require("../models");

const isValidId = (id) => mongoose.isValidObjectId(id);

const getIds = (items = []) =>
    items.map((item) => String(item?._id || item));

const sendError = (res, status, message) =>
    res.status(status).json({ success: false, message });

const getNoticeAccessFilter = (user) => {
    if (user.role === "admin") return {};

    const now = new Date();
    const commonConditions = [
        { audience: "all" },
        { audience: user.role === "student" ? "students" : "teachers" }
    ];

    const classIds = user.role === "student"
        ? (user.class ? [String(user.class)] : [])
        : getIds(user.assignedClasses);

    if (classIds.length) {
        commonConditions.push({
            audience: "specific_class",
            targetClasses: { $in: classIds }
        });
    }

    return {
        isPublished: true,
        $and: [
            {
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: now } }
                ]
            },
            { $or: commonConditions }
        ]
    };
};

const canViewNotice = (user, notice) => {
    if (user.role === "admin") return true;
    if (!notice.isPublished) return false;

    if (notice.expiresAt && new Date(notice.expiresAt) <= new Date()) {
        return false;
    }

    if (notice.audience === "all") return true;
    if (notice.audience === "students" && user.role === "student") return true;
    if (notice.audience === "teachers" && user.role === "teacher") return true;

    if (notice.audience === "specific_class") {
        const userClasses = user.role === "student"
            ? (user.class ? [String(user.class)] : [])
            : getIds(user.assignedClasses);

        const targetClasses = getIds(notice.targetClasses);

        return userClasses.some((id) => targetClasses.includes(id));
    }

    return false;
};

// GET /api/notices
const getNotices = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            audience
        } = req.query;

        const filter = getNoticeAccessFilter(req.user);

        if (audience && req.user.role === "admin") {
            filter.audience = audience;
        }

        if (search) {
            filter.title = { $regex: search, $options: "i" };
        }

        const currentPage = Math.max(1, Number(page) || 1);
        const pageLimit = Math.min(100, Math.max(1, Number(limit) || 20));

        const [notices, total] = await Promise.all([
            Notice.find(filter)
                .populate("createdBy", "name email role")
                .populate("targetClasses", "name section academicYear")
                .sort({ createdAt: -1 })
                .skip((currentPage - 1) * pageLimit)
                .limit(pageLimit),
            Notice.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: notices,
            pagination: {
                total,
                page: currentPage,
                limit: pageLimit,
                pages: Math.ceil(total / pageLimit)
            }
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/notices/:id
const getNotice = async (req, res, next) => {
    try {
        if (!isValidId(req.params.id)) {
            return sendError(res, 400, "Invalid notice ID.");
        }

        const notice = await Notice.findById(req.params.id)
            .populate("createdBy", "name email role")
            .populate("targetClasses", "name section academicYear");

        if (!notice) {
            return sendError(res, 404, "Notice not found.");
        }

        if (!canViewNotice(req.user, notice)) {
            return sendError(res, 403, "You are not allowed to view this notice.");
        }

        res.json({ success: true, data: notice });
    } catch (error) {
        next(error);
    }
};

// POST /api/notices
const createNotice = async (req, res, next) => {
    try {
        const {
            title,
            content,
            audience = "all",
            targetClasses = [],
            expiresAt,
            isPublished = false
        } = req.body;

        if (!title || !content) {
            return sendError(res, 400, "Title and content are required.");
        }

        if (!["all", "students", "teachers", "specific_class"].includes(audience)) {
            return sendError(res, 400, "Invalid notice audience.");
        }

        if (audience === "specific_class") {
            if (!Array.isArray(targetClasses) || !targetClasses.length) {
                return sendError(res, 400, "Select at least one target class.");
            }

            if (!targetClasses.every(isValidId)) {
                return sendError(res, 400, "One or more class IDs are invalid.");
            }

            const validClasses = await Class.countDocuments({
                _id: { $in: targetClasses },
                isActive: true
            });

            if (validClasses !== new Set(targetClasses.map(String)).size) {
                return sendError(res, 400, "One or more selected classes are invalid or inactive.");
            }
        }

        if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) ||
            new Date(expiresAt) <= new Date())) {
            return sendError(res, 400, "Expiry date must be a valid future date.");
        }

        const published = isPublished === true || isPublished === "true";

        const notice = await Notice.create({
            title: title.trim(),
            content,
            audience,
            targetClasses: audience === "specific_class" ? targetClasses : [],
            createdBy: req.user._id,
            isPublished: published,
            publishedAt: published ? new Date() : null,
            expiresAt: expiresAt || null
        });

        const populatedNotice = await Notice.findById(notice._id)
            .populate("createdBy", "name email role")
            .populate("targetClasses", "name section academicYear");

        res.status(201).json({
            success: true,
            message: published
                ? "Notice created and published successfully."
                : "Notice saved as draft successfully.",
            data: populatedNotice
        });
    } catch (error) {
        next(error);
    }
};

// PUT /api/notices/:id
const updateNotice = async (req, res, next) => {
    try {
        if (!isValidId(req.params.id)) {
            return sendError(res, 400, "Invalid notice ID.");
        }

        const notice = await Notice.findById(req.params.id);

        if (!notice) {
            return sendError(res, 404, "Notice not found.");
        }

        const { title, content, audience, targetClasses, expiresAt } = req.body;

        if (title !== undefined) {
            if (!String(title).trim()) {
                return sendError(res, 400, "Notice title cannot be empty.");
            }
            notice.title = String(title).trim();
        }

        if (content !== undefined) {
            if (!String(content).trim()) {
                return sendError(res, 400, "Notice content cannot be empty.");
            }
            notice.content = content;
        }

        if (audience !== undefined) {
            if (!["all", "students", "teachers", "specific_class"].includes(audience)) {
                return sendError(res, 400, "Invalid notice audience.");
            }
            notice.audience = audience;
        }

        if (targetClasses !== undefined) {
            if (!Array.isArray(targetClasses) ||
                !targetClasses.every(isValidId)) {
                return sendError(res, 400, "Invalid target classes.");
            }
            notice.targetClasses = targetClasses;
        }

        if (notice.audience === "specific_class") {
            if (!notice.targetClasses.length) {
                return sendError(res, 400, "Select at least one target class.");
            }

            const validClasses = await Class.countDocuments({
                _id: { $in: notice.targetClasses },
                isActive: true
            });

            if (validClasses !== new Set(notice.targetClasses.map(String)).size) {
                return sendError(res, 400, "One or more selected classes are invalid or inactive.");
            }
        } else {
            notice.targetClasses = [];
        }

        if (expiresAt !== undefined) {
            if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) ||
                new Date(expiresAt) <= new Date())) {
                return sendError(res, 400, "Expiry date must be a valid future date.");
            }
            notice.expiresAt = expiresAt || null;
        }

        await notice.save();

        const updatedNotice = await Notice.findById(notice._id)
            .populate("createdBy", "name email role")
            .populate("targetClasses", "name section academicYear");

        res.json({
            success: true,
            message: "Notice updated successfully.",
            data: updatedNotice
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/notices/:id/publish
const toggleNoticePublish = async (req, res, next) => {
    try {
        if (!isValidId(req.params.id)) {
            return sendError(res, 400, "Invalid notice ID.");
        }

        const notice = await Notice.findById(req.params.id);

        if (!notice) {
            return sendError(res, 404, "Notice not found.");
        }

        if (!notice.isPublished && notice.expiresAt &&
            new Date(notice.expiresAt) <= new Date()) {
            return sendError(res, 400, "Cannot publish a notice with an expired expiry date.");
        }

        notice.isPublished = !notice.isPublished;
        notice.publishedAt = notice.isPublished ? new Date() : null;

        await notice.save();

        res.json({
            success: true,
            message: notice.isPublished
                ? "Notice published successfully."
                : "Notice unpublished successfully.",
            data: notice
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/notices/:id
const deleteNotice = async (req, res, next) => {
    try {
        if (!isValidId(req.params.id)) {
            return sendError(res, 400, "Invalid notice ID.");
        }

        const notice = await Notice.findByIdAndDelete(req.params.id);

        if (!notice) {
            return sendError(res, 404, "Notice not found.");
        }

        res.json({
            success: true,
            message: "Notice deleted successfully."
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getNotices,
    getNotice,
    createNotice,
    updateNotice,
    toggleNoticePublish,
    deleteNotice
};
