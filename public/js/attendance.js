"use strict";

const API = {
    classes: "/api/classes",
    attendance: "/api/attendance",
    auth: "/api/auth"
};

const $ = (id) => document.getElementById(id);

let classes = [];
let classStudents = [];
let attendanceRecords = [];
let currentPage = 1;
let totalPages = 1;
let toastTimer = null;

const today = new Date();
const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
].join("-");

$("attendanceDate").value = localToday;

function showToast(message, type = "success") {
    const toast = $("toast");

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.className = "toast";
    }, 3500);
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("The server returned an invalid response.");
    }

    if (response.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Your session has expired. Please login again.");
    }

    if (!response.ok || result.success === false) {
        throw new Error(result.message || "Something went wrong.");
    }

    return result;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];
    });
}

function getId(value) {
    if (!value) return "";
    return String(value._id || value.id || value);
}

function getClassName(classItem) {
    if (!classItem) return "—";

    return [
        classItem.name || "",
        classItem.section ? `(${classItem.section})` : ""
    ].filter(Boolean).join(" ");
}

function getDateString(date) {
    if (!date) return "—";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return "—";
    }

    return parsed.toLocaleDateString();
}

function statusLabel(status) {
    return String(status || "").charAt(0).toUpperCase()
        + String(status || "").slice(1);
}

function getStatusBadge(status) {
    return `<span class="status-badge status-${escapeHTML(status)}">
        ${escapeHTML(statusLabel(status))}
    </span>`;
}

function getStudentName(student) {
    return student?.name || "Unknown Student";
}

function getStudentId(student) {
    return getId(student);
}

function getStudentClass(record) {
    return getClassName(record.class);
}

/* Load classes */

async function loadClasses() {
    const result = await apiRequest(
        `${API.classes}?page=1&limit=100&isActive=true`
    );

    classes = Array.isArray(result.data)
        ? result.data
        : result.data?.classes || [];

    const classOptions = classes.map((item) => `
        <option value="${escapeHTML(getId(item))}">
            ${escapeHTML(getClassName(item))}
        </option>
    `).join("");

    $("classSelect").innerHTML =
        `<option value="">Select a class</option>${classOptions}`;

    $("recordClassFilter").innerHTML =
        `<option value="">All Classes</option>${classOptions}`;
}

/* Load students for selected class */

async function loadClassStudents() {
    const classId = $("classSelect").value;

    classStudents = [];

    $("markAttendanceTable").innerHTML = `
        <tr><td colspan="6" class="empty-state">Loading students...</td></tr>
    `;

    if (!classId) {
        $("selectedClassName").textContent = "No class selected";
        $("studentCountLabel").textContent = "0 students";
        $("saveInfo").textContent = "Select a class to begin.";
        $("saveAttendanceButton").disabled = true;
        $("totalStudents").textContent = "0";
        renderMarkTable();
        return;
    }

    try {
        const result = await apiRequest(`${API.classes}/${classId}`);

        const classData = result.data?.classData || result.data?.class || result.data;

        if (!classData) {
            throw new Error("Class information could not be loaded.");
        }

        classStudents = Array.isArray(classData.students)
            ? classData.students
            : [];

        $("selectedClassName").textContent = getClassName(classData);
        $("studentCountLabel").textContent =
            `${classStudents.length} students`;

        $("totalStudents").textContent = classStudents.length;

        $("saveAttendanceButton").disabled = classStudents.length === 0;

        if (!classStudents.length) {
            $("saveInfo").textContent =
                "No students are assigned to this class.";
            renderMarkTable();
            updateStats([]);
            return;
        }

        await loadExistingAttendance();
    } catch (error) {
        $("markAttendanceTable").innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        $("saveAttendanceButton").disabled = true;
        showToast(error.message, "error");
    }
}

/* Load already marked attendance for the selected class and date */

async function loadExistingAttendance() {
    const classId = $("classSelect").value;
    const date = $("attendanceDate").value;

    if (!classId || !date) return;

    try {
        const params = new URLSearchParams({
            class: classId,
            date,
            page: "1",
            limit: "100"
        });

        const result = await apiRequest(
            `${API.attendance}?${params.toString()}`
        );

        const records = result.data?.attendance || [];

        const recordMap = new Map();

        records.forEach((record) => {
            recordMap.set(getStudentId(record.student), record);
        });

        classStudents = classStudents.map((student) => {
            const existing = recordMap.get(getStudentId(student));

            return {
                ...student,
                attendanceStatus: existing?.status || "present",
                attendanceRemarks: existing?.remarks || ""
            };
        });

        updateStats(records);
        renderMarkTable();

        $("saveInfo").textContent =
            `Attendance for ${date}. Save to create or update records.`;

    } catch (error) {
        showToast(error.message, "error");
    }
}

/* Render mark attendance table */

function renderMarkTable() {
    const search = $("studentSearch").value.trim().toLowerCase();

    const filteredStudents = classStudents.filter((student) => {
        const searchable = [
            student.name,
            student.admissionNumber,
            student.rollNumber
        ].join(" ").toLowerCase();

        return searchable.includes(search);
    });

    if (!filteredStudents.length) {
        $("markAttendanceTable").innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    No students found.
                </td>
            </tr>
        `;
        return;
    }

    $("markAttendanceTable").innerHTML = filteredStudents.map(
        (student, index) => `
            <tr data-student-id="${escapeHTML(getStudentId(student))}">
                <td>${index + 1}</td>

                <td>
                    <div class="student-cell">
                        <strong>${escapeHTML(getStudentName(student))}</strong>
                        <span>${escapeHTML(student.email || "")}</span>
                    </div>
                </td>

                <td>${escapeHTML(student.admissionNumber || "—")}</td>

                <td>${escapeHTML(student.rollNumber || "—")}</td>

                <td>
                    <select class="status-select student-status">
                        <option value="present"
                            ${student.attendanceStatus === "present" ? "selected" : ""}>
                            Present
                        </option>
                        <option value="absent"
                            ${student.attendanceStatus === "absent" ? "selected" : ""}>
                            Absent
                        </option>
                        <option value="late"
                            ${student.attendanceStatus === "late" ? "selected" : ""}>
                            Late
                        </option>
                        <option value="excused"
                            ${student.attendanceStatus === "excused" ? "selected" : ""}>
                            Excused
                        </option>
                    </select>
                </td>

                <td>
                    <input
                        class="remarks-input student-remarks"
                        type="text"
                        maxlength="1000"
                        placeholder="Optional remarks"
                        value="${escapeHTML(student.attendanceRemarks || "")}"
                    >
                </td>
            </tr>
        `
    ).join("");
}

/* Read current attendance values */

function getMarkingRecords() {
    return classStudents.map((student) => {
        const row = document.querySelector(
            `tr[data-student-id="${CSS.escape(getStudentId(student))}"]`
        );

        if (row) {
            student.attendanceStatus =
                row.querySelector(".student-status").value;

            student.attendanceRemarks =
                row.querySelector(".student-remarks").value;
        }

        return {
            studentId: getStudentId(student),
            status: student.attendanceStatus || "present",
            remarks: student.attendanceRemarks || ""
        };
    });
}

/* Save bulk attendance */

async function saveAttendance() {
    const classId = $("classSelect").value;
    const date = $("attendanceDate").value;

    if (!classId) {
        showToast("Please select a class.", "error");
        return;
    }

    if (!date) {
        showToast("Please select an attendance date.", "error");
        return;
    }

    if (!classStudents.length) {
        showToast("No students available in this class.", "error");
        return;
    }

    const records = getMarkingRecords();

    const button = $("saveAttendanceButton");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        const result = await apiRequest(`${API.attendance}/bulk`, {
            method: "POST",
            body: JSON.stringify({
                classId,
                date,
                records
            })
        });

        const data = result.data || {};

        showToast(
            result.message ||
            `Attendance saved. ${data.totalProcessed || records.length} records processed.`
        );

        await loadExistingAttendance();
        await loadAttendanceRecords();
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = "Save Attendance";
    }
}

/* Statistics */

function updateStats(records) {
    const counts = {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0
    };

    records.forEach((record) => {
        if (Object.prototype.hasOwnProperty.call(counts, record.status)) {
            counts[record.status]++;
        }
    });

    $("presentCount").textContent = counts.present;
    $("absentCount").textContent = counts.absent;
    $("lateCount").textContent = counts.late;
    $("excusedCount").textContent = counts.excused;

    $("totalStudents").textContent = classStudents.length || records.length;
}

/* Load attendance history */

async function loadAttendanceRecords() {
    const params = new URLSearchParams({
        page: String(currentPage),
        limit: "20"
    });

    const classId = $("recordClassFilter").value;
    const date = $("recordDateFilter").value;
    const status = $("recordStatusFilter").value;

    if (classId) params.set("class", classId);
    if (date) params.set("date", date);
    if (status) params.set("status", status);

    $("recordsTable").innerHTML = `
        <tr><td colspan="7" class="empty-state">Loading records...</td></tr>
    `;

    try {
        const result = await apiRequest(
            `${API.attendance}?${params.toString()}`
        );

        attendanceRecords = result.data?.attendance || [];

        const pagination = result.data?.pagination || {};

        totalPages = Math.max(1, pagination.totalPages || 1);

        renderRecords();

        $("paginationInfo").textContent =
            `Showing ${attendanceRecords.length} of ${pagination.total || 0} records`;

        $("pageInfo").textContent =
            `Page ${pagination.page || currentPage} of ${totalPages}`;

        $("previousButton").disabled = currentPage <= 1;
        $("nextButton").disabled = currentPage >= totalPages;

        if (!classId && !date && !status) {
            updateStats(attendanceRecords);
        }

    } catch (error) {
        $("recordsTable").innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showToast(error.message, "error");
    }
}

/* Render history table */

function renderRecords() {
    if (!attendanceRecords.length) {
        $("recordsTable").innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    No attendance records found.
                </td>
            </tr>
        `;
        return;
    }

    $("recordsTable").innerHTML = attendanceRecords.map((record) => `
        <tr>
            <td>
                <div class="student-cell">
                    <strong>${escapeHTML(getStudentName(record.student))}</strong>
                    <span>${escapeHTML(record.student?.email || "")}</span>
                </div>
            </td>

            <td>${escapeHTML(record.student?.admissionNumber || "—")}</td>

            <td>${escapeHTML(getStudentClass(record))}</td>

            <td>${escapeHTML(getDateString(record.date))}</td>

            <td>${getStatusBadge(record.status)}</td>

            <td>${escapeHTML(record.remarks || "—")}</td>

            <td>
                <div class="action-buttons">
                    <button
                        class="action-button edit-button"
                        data-action="edit"
                        data-id="${escapeHTML(record._id)}">
                        Edit
                    </button>

                    <button
                        class="action-button delete-button"
                        data-action="delete"
                        data-id="${escapeHTML(record._id)}">
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join("");
}

/* Edit modal */

function openEditModal(record) {
    $("editAttendanceId").value = record._id;
    $("editStudentName").value = getStudentName(record.student);
    $("editStatus").value = record.status;
    $("editRemarks").value = record.remarks || "";

    $("editModal").classList.add("show");
}

function closeEditModal() {
    $("editModal").classList.remove("show");
}

async function updateAttendance(event) {
    event.preventDefault();

    const id = $("editAttendanceId").value;

    try {
        await apiRequest(`${API.attendance}/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
                status: $("editStatus").value,
                remarks: $("editRemarks").value
            })
        });

        closeEditModal();
        showToast("Attendance record updated successfully.");

        await loadAttendanceRecords();

        if ($("classSelect").value) {
            await loadExistingAttendance();
        }

    } catch (error) {
        showToast(error.message, "error");
    }
}

/* Delete record */

async function deleteAttendance(id) {
    const confirmed = confirm(
        "Are you sure you want to delete this attendance record?"
    );

    if (!confirmed) return;

    try {
        await apiRequest(`${API.attendance}/${id}`, {
            method: "DELETE"
        });

        showToast("Attendance record deleted successfully.");

        await loadAttendanceRecords();

        if ($("classSelect").value) {
            await loadExistingAttendance();
        }

    } catch (error) {
        showToast(error.message, "error");
    }
}

/* Bulk quick actions */

function setAllStatuses(status) {
    if (!classStudents.length) {
        showToast("Please select a class first.", "error");
        return;
    }

    classStudents.forEach((student) => {
        student.attendanceStatus = status;
    });

    renderMarkTable();
}

/* Authentication / profile */

async function loadCurrentUser() {
    try {
        const result = await apiRequest(`${API.auth}/me`);

        const user = result.data?.user || result.data;

        if (user?.name) {
            $("sidebarName").textContent = user.name;
            $("topName").textContent = user.name;
        }

    } catch (error) {
        // Profile display is optional; page data remains usable.
    }
}

async function logout() {
    try {
        await apiRequest(`${API.auth}/logout`, {
            method: "POST"
        });
    } catch (error) {
        // Continue to login even if the logout request fails.
    }

    window.location.href = "/login.html";
}

/* Event listeners */

$("classSelect").addEventListener("change", loadClassStudents);

$("attendanceDate").addEventListener("change", loadExistingAttendance);

$("studentSearch").addEventListener("input", renderMarkTable);

$("saveAttendanceButton").addEventListener("click", saveAttendance);

$("allPresentButton").addEventListener("click", () => {
    setAllStatuses("present");
});

$("allAbsentButton").addEventListener("click", () => {
    setAllStatuses("absent");
});

$("applyFiltersButton").addEventListener("click", () => {
    currentPage = 1;
    loadAttendanceRecords();
});

$("refreshButton").addEventListener("click", async () => {
    try {
        await loadClasses();

        if ($("classSelect").value) {
            await loadClassStudents();
        }

        currentPage = 1;
        await loadAttendanceRecords();

        showToast("Attendance data refreshed.");
    } catch (error) {
        showToast(error.message, "error");
    }
});

$("previousButton").addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        loadAttendanceRecords();
    }
});

$("nextButton").addEventListener("click", () => {
    if (currentPage < totalPages) {
        currentPage++;
        loadAttendanceRecords();
    }
});

$("recordsTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const record = attendanceRecords.find(
        (item) => item._id === button.dataset.id
    );

    if (!record) return;

    if (button.dataset.action === "edit") {
        openEditModal(record);
    }

    if (button.dataset.action === "delete") {
        deleteAttendance(record._id);
    }
});

$("editAttendanceForm").addEventListener("submit", updateAttendance);

$("closeEditModal").addEventListener("click", closeEditModal);
$("cancelEditButton").addEventListener("click", closeEditModal);

$("editModal").addEventListener("click", (event) => {
    if (event.target === $("editModal")) {
        closeEditModal();
    }
});

$("logoutButton").addEventListener("click", logout);

$("menuButton").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
});

/* Initialize */

async function initializeAttendance() {
    try {
        await loadCurrentUser();
        await loadClasses();
        await loadAttendanceRecords();
    } catch (error) {
        showToast(error.message, "error");
    }
}

initializeAttendance();