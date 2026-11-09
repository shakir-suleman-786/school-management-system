
const express = require("express");
const { protect, authorize } = require("../middleware/auth");

const {
    getNotices,
    getNotice,
    createNotice,
    updateNotice,
    toggleNoticePublish,
    deleteNotice
} = require("../controllers/noticeController");

const router = express.Router();

router.use(protect);

router.route("/")
    .get(getNotices)
    .post(authorize("admin"), createNotice);

router.patch(
    "/:id/publish",
    authorize("admin"),
    toggleNoticePublish
);

router.route("/:id")
    .get(getNotice)
    .put(authorize("admin"), updateNotice)
    .delete(authorize("admin"), deleteNotice);

module.exports = router;
