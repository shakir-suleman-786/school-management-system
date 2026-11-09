const API = "/api";

const state = {
    role: "admin",
    assignments: [],
    submissions: [],
    selectedAssignment: null,
    maxMarks: 0
};

const $ = id => document.getElementById(id);

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
})[char]);

function getUser() {
    for (const key of ["user", "currentUser", "schoolUser"]) {
        try {
            const user = JSON.parse(localStorage.getItem(key));
            if (user?.role) return user;
        } catch (_) {}
    }
    return { role: "admin", name: "Administrator" };
}

async function apiRequest(url, options = {}) {
    const response = await fetch(`${API}${url}`, {
        credentials: "include",
        ...options,
        headers: {
            ...(options.body instanceof FormData ? {} : {
                "Content-Type": "application/json"
            }),
            ...(options.headers || {})
        }
    });

    let result = {};
    try {
        result = await response.json();
    } catch (_) {}

    if (!response.ok || result.success === false) {
        throw new Error(result.message || "Request failed.");
    }

    return result;
}

function showToast(message, error = false) {
    const toast = $("toast");
    toast.textContent = message;
    toast.className = `toast show${error ? " error" : ""}`;

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        toast.className = "toast";
    }, 3000);
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getId(value) {
    return value?._id || value?.id || "";
}

function getClassName(item) {
    if (!item) return "—";
    return `${item.name || "Class"}${item.section ? ` - ${item.section}` : ""}`;
}

function getSubjectName(item) {
    if (!item) return "—";
    return item.name || "—";
}

function statusBadge(status) {
    const safeStatus = status === "graded" ? "graded" : "submitted";
    return `<span class="status-badge status-${safeStatus}">${safeStatus}</span>`;
}

function updateStats(submissions) {
    $("totalCount").textContent = submissions.length;
    $("submittedCount").textContent =
        submissions.filter(item => item.status === "submitted").length;
    $("gradedCount").textContent =
        submissions.filter(item => item.status === "graded").length;
    $("lateCount").textContent =
        submissions.filter(item => item.isLate).length;
}

function showStudentView() {
    $("studentSection").hidden = false;
    $("reviewerSection").hidden = true;
    $("pageDescription").textContent = "Submit your assignments and track your grades.";
    $("addAssignmentButton")?.remove();
}

function showReviewerView() {
    $("studentSection").hidden = true;
    $("reviewerSection").hidden = false;
    $("pageDescription").textContent = "Review student submissions, download files and assign grades.";
}

async function loadAssignments() {
    const result = await apiRequest("/assignments");
    state.assignments = result.data?.assignments || [];

    if (state.role === "student") {
        renderStudentAssignments();
    } else {
        renderAssignmentDropdown();
    }
}

function renderStudentAssignments() {
    const tbody = $("studentAssignmentsBody");

    if (!state.assignments.length) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="table-message">No published assignments available.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.assignments.map(item => {
        const submission = state.submissions.find(
            entry => getId(entry.assignment) === item._id
        );

        const submitted = Boolean(submission);
        const graded = submission?.status === "graded";

        let action = "";

        if (graded) {
            action = `<button class="action-button view-action" disabled>Graded</button>`;
        } else {
            action = `
                <button class="action-button grade-action"
                    data-action="submit"
                    data-id="${escapeHTML(item._id)}">
                    ${submitted ? "Resubmit" : "Submit"}
                </button>`;
        }

        return `
            <tr>
                <td>
                    <div class="assignment-name">${escapeHTML(item.title)}</div>
                    <span class="small-muted">${escapeHTML(getClassName(item.class))}</span>
                </td>
                <td>${escapeHTML(getSubjectName(item.subject))}</td>
                <td>${escapeHTML(formatDate(item.dueDate))}</td>
                <td>${escapeHTML(item.maxMarks ?? 100)}</td>
                <td>${submitted ? statusBadge(submission.status) : "Not submitted"}</td>
                <td>${action}</td>
            </tr>`;
    }).join("");
}

async function loadMySubmissions() {
    const result = await apiRequest("/submissions/my");
    state.submissions = result.data?.submissions || [];

    updateStats(state.submissions);
    renderMySubmissions();
    renderStudentAssignments();
}

function renderMySubmissions() {
    const tbody = $("mySubmissionsBody");

    if (!state.submissions.length) {
        tbody.innerHTML = `
            <tr><td colspan="7" class="table-message">You have not submitted any assignments yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.submissions.map(item => {
        const assignment = item.assignment || {};

        return `
            <tr>
                <td>
                    <div class="assignment-name">${escapeHTML(assignment.title || "Assignment")}</div>
                    <span class="small-muted">${escapeHTML(getSubjectName(assignment.subject))}</span>
                </td>
                <td>${escapeHTML(formatDate(item.submittedAt))}</td>
                <td>${escapeHTML(item.submissionType || "—")}</td>
                <td>${statusBadge(item.status)}</td>
                <td>${item.status === "graded"
                    ? `${escapeHTML(item.marksObtained)} / ${escapeHTML(assignment.maxMarks ?? "—")}`
                    : "Pending"}</td>
                <td>${escapeHTML(item.feedback || "—")}</td>
                <td>
                    ${item.file?.path
                        ? `<button class="action-button download-action"
                            data-action="download" data-id="${escapeHTML(item._id)}">Download</button>`
                        : "—"}
                </td>
            </tr>`;
    }).join("");
}

function renderAssignmentDropdown() {
    const select = $("assignmentFilter");

    select.innerHTML = `<option value="">Select Assignment</option>` +
        state.assignments.map(item => `
            <option value="${escapeHTML(item._id)}">${escapeHTML(item.title)}</option>
        `).join("");
}

function openSubmitModal(assignmentId) {
    const assignment = state.assignments.find(item => item._id === assignmentId);

    if (!assignment) {
        showToast("Assignment not found.", true);
        return;
    }

    const previous = state.submissions.find(
        item => getId(item.assignment) === assignmentId
    );

    if (previous?.status === "graded") {
        showToast("This submission has already been graded.", true);
        return;
    }

    $("submitForm").reset();
    $("submitAssignmentId").value = assignmentId;
    $("submitModalTitle").textContent = previous ? "Resubmit Assignment" : "Submit Assignment";
    $("submitAssignmentInfo").textContent =
        `${assignment.title} | Due: ${formatDate(assignment.dueDate)}`;

    $("textSubmissionGroup").hidden = !assignment.allowTextSubmission;
    $("fileSubmissionGroup").hidden = !assignment.allowFileSubmission;

    $("textContent").required = Boolean(assignment.allowTextSubmission);
    $("submissionFile").required =
        Boolean(assignment.allowFileSubmission) && !previous;

    if (previous?.textContent) {
        $("textContent").value = previous.textContent;
    }

    const types = assignment.allowedFileTypes || [];
    $("allowedTypesText").textContent = types.length
        ? `Allowed types: ${types.join(", ").toUpperCase()}`
        : "Allowed file types: PDF, DOC, DOCX, JPG, JPEG, PNG. Maximum 5 MB.";

    $("submitModal").classList.add("show");
}

function closeSubmitModal() {
    $("submitModal").classList.remove("show");
}

async function submitWork(event) {
    event.preventDefault();

    const assignmentId = $("submitAssignmentId").value;
    const assignment = state.assignments.find(item => item._id === assignmentId);

    if (!assignment) {
        showToast("Assignment not found.", true);
        return;
    }

    const textContent = $("textContent").value.trim();
    const file = $("submissionFile").files[0];

    const hasText = assignment.allowTextSubmission && textContent.length > 0;
    const hasFile = assignment.allowFileSubmission && Boolean(file);

    if (!hasText && !hasFile) {
        showToast("Please enter your answer or select a file.", true);
        return;
    }

    if (file && file.size > 5 * 1024 * 1024) {
        showToast("File size cannot exceed 5 MB.", true);
        return;
    }

    const button = $("submitWorkButton");
    button.disabled = true;
    button.textContent = "Submitting...";

    try {
        if (hasText) {
            await apiRequest(`/submissions/${assignmentId}`, {
                method: "POST",
                body: JSON.stringify({ textContent })
            });
        }

        if (hasFile) {
            const formData = new FormData();
            formData.append("file", file);

            await apiRequest(`/submissions/${assignmentId}/file`, {
                method: "POST",
                body: formData
            });
        }

        showToast("Assignment submitted successfully.");
        closeSubmitModal();

        await loadMySubmissions();
    } catch (error) {
        showToast(error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "Submit Work";
    }
}

async function loadAssignmentSubmissions() {
    const assignmentId = $("assignmentFilter").value;

    if (!assignmentId) {
        showToast("Please select an assignment.", true);
        return;
    }

    $("reviewSubmissionsBody").innerHTML =
        `<tr><td colspan="8" class="table-message">Loading submissions...</td></tr>`;

    try {
        const result = await apiRequest(`/submissions/assignment/${assignmentId}`);

        state.selectedAssignment = result.data?.assignment || null;
        state.submissions = result.data?.submissions || [];

        const assignment = state.selectedAssignment;

        $("selectedAssignment").textContent = assignment
            ? `${assignment.title} | Maximum Marks: ${assignment.maxMarks} | Total Submissions: ${result.data.totalSubmissions}`
            : "";

        updateStats(state.submissions);
        renderReviewSubmissions();
    } catch (error) {
        $("reviewSubmissionsBody").innerHTML =
            `<tr><td colspan="8" class="table-message">${escapeHTML(error.message)}</td></tr>`;
        showToast(error.message, true);
    }
}

function renderReviewSubmissions() {
    const tbody = $("reviewSubmissionsBody");

    if (!state.submissions.length) {
        tbody.innerHTML = `
            <tr><td colspan="8" class="table-message">No submissions received for this assignment.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.submissions.map(item => `
        <tr>
            <td>
                <div class="assignment-name">${escapeHTML(item.student?.name || "Student")}</div>
                <span class="small-muted">${escapeHTML(item.student?.email || "")}</span>
            </td>
            <td>${escapeHTML(item.student?.rollNumber || item.student?.admissionNumber || "—")}</td>
            <td>${escapeHTML(formatDate(item.submittedAt))}</td>
            <td>${escapeHTML(item.submissionType)}</td>
            <td>
                <span class="${item.isLate ? "late-badge" : "ontime-badge"}">
                    ${item.isLate ? "Late" : "On time"}
                </span>
            </td>
            <td>${statusBadge(item.status)}</td>
            <td>${item.status === "graded"
                ? `${escapeHTML(item.marksObtained)} / ${escapeHTML(state.selectedAssignment?.maxMarks)}`
                : "Pending"}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-button view-action"
                        data-action="view" data-id="${escapeHTML(item._id)}">View</button>
                    ${item.file?.path ? `
                        <button class="action-button download-action"
                            data-action="download" data-id="${escapeHTML(item._id)}">File</button>
                    ` : ""}
                    ${item.status !== "graded" ? `
                        <button class="action-button grade-action"
                            data-action="grade" data-id="${escapeHTML(item._id)}">Grade</button>
                    ` : ""}
                </div>
            </td>
        </tr>
    `).join("");
}

function openGradeModal(submissionId) {
    const submission = state.submissions.find(item => item._id === submissionId);

    if (!submission || !state.selectedAssignment) {
        showToast("Submission information not found.", true);
        return;
    }

    state.maxMarks = Number(state.selectedAssignment.maxMarks || 0);

    $("gradeForm").reset();
    $("gradeSubmissionId").value = submissionId;
    $("gradeStudentName").textContent =
        `Student: ${submission.student?.name || "Student"}`;

    $("marksObtained").max = state.maxMarks;
    $("maximumMarksText").textContent = `Maximum marks: ${state.maxMarks}`;

    $("gradeModal").classList.add("show");
}

function closeGradeModal() {
    $("gradeModal").classList.remove("show");
}

async function saveGrade(event) {
    event.preventDefault();

    const submissionId = $("gradeSubmissionId").value;
    const marksObtained = Number($("marksObtained").value);
    const feedback = $("feedback").value.trim();

    if (!Number.isFinite(marksObtained) ||
        marksObtained < 0 ||
        marksObtained > state.maxMarks) {
        showToast(`Marks must be between 0 and ${state.maxMarks}.`, true);
        return;
    }

    const button = $("saveGradeButton");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        await apiRequest(`/submissions/${submissionId}/grade`, {
            method: "PATCH",
            body: JSON.stringify({ marksObtained, feedback })
        });

        showToast("Submission graded successfully.");
        closeGradeModal();
        await loadAssignmentSubmissions();
    } catch (error) {
        showToast(error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "Save Grade";
    }
}

function openSubmissionDetails(submissionId) {
    const submission = state.submissions.find(item => item._id === submissionId);

    if (!submission) {
        showToast("Submission not found.", true);
        return;
    }

    const details = [
        ["Student", submission.student?.name || "Student"],
        ["Email", submission.student?.email || "—"],
        ["Submission Type", submission.submissionType],
        ["Submitted At", formatDate(submission.submittedAt)],
        ["Submission Status", submission.status],
        ["Late Submission", submission.isLate ? "Yes" : "No"],
        ["Text Answer", submission.textContent || "No text answer submitted", true],
        ["File", submission.file?.originalName || "No file attached", true],
        ["Marks", submission.status === "graded"
            ? `${submission.marksObtained} / ${state.selectedAssignment?.maxMarks ?? "—"}`
            : "Not graded"],
        ["Feedback", submission.feedback || "No feedback available", true]
    ];

    $("submissionDetails").innerHTML = details.map(([label, value, full]) => `
        <div class="detail-item ${full ? "full" : ""}">
            <span>${escapeHTML(label)}</span>
            <strong>${escapeHTML(value ?? "—")}</strong>
        </div>
    `).join("");

    $("viewSubmissionModal").classList.add("show");
}

async function downloadFile(submissionId) {
    try {
        const response = await fetch(`${API}/submissions/${submissionId}/file`, {
            credentials: "include"
        });

        if (!response.ok) {
            let message = "Unable to download file.";
            try {
                const result = await response.json();
                message = result.message || message;
            } catch (_) {}
            throw new Error(message);
        }

        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="?([^"]+)"?/i);
        const filename = match?.[1] || "submission-file";

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        showToast(error.message, true);
    }
}

async function logout() {
    try {
        await apiRequest("/auth/logout", { method: "POST" });
    } catch (_) {}

    localStorage.removeItem("user");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("schoolUser");

    window.location.href = "/login.html";
}

function setupEvents() {
    $("refreshButton").addEventListener("click", refreshPage);

    $("loadSubmissionsButton").addEventListener("click", loadAssignmentSubmissions);

    $("submitForm").addEventListener("submit", submitWork);
    $("gradeForm").addEventListener("submit", saveGrade);

    $("closeSubmitModal").addEventListener("click", closeSubmitModal);
    $("cancelSubmitButton").addEventListener("click", closeSubmitModal);

    $("closeGradeModal").addEventListener("click", closeGradeModal);
    $("cancelGradeButton").addEventListener("click", closeGradeModal);

    $("closeViewSubmission").addEventListener("click", () => {
        $("viewSubmissionModal").classList.remove("show");
    });

    $("studentAssignmentsBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        if (button.dataset.action === "submit") {
            openSubmitModal(button.dataset.id);
        }
    });

    $("mySubmissionsBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        if (button.dataset.action === "download") {
            downloadFile(button.dataset.id);
        }
    });

    $("reviewSubmissionsBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const { action, id } = button.dataset;

        if (action === "view") openSubmissionDetails(id);
        if (action === "grade") openGradeModal(id);
        if (action === "download") downloadFile(id);
    });

    $("logoutButton").addEventListener("click", logout);

    $("menuButton").addEventListener("click", () => {
        $("sidebar").classList.toggle("active");
    });

    ["submitModal", "gradeModal", "viewSubmissionModal"].forEach(id => {
        $(id).addEventListener("click", event => {
            if (event.target === $(id)) {
                $(id).classList.remove("show");
            }
        });
    });
}

async function refreshPage() {
    try {
        await loadAssignments();

        if (state.role === "student") {
            await loadMySubmissions();
        } else if ($("assignmentFilter").value) {
            await loadAssignmentSubmissions();
        }

        showToast("Submissions refreshed.");
    } catch (error) {
        showToast(error.message, true);
    }
}

async function initializeSubmissions() {
    const user = getUser();

    state.role = user.role;
    const name = user.name || "User";

    $("sidebarName").textContent = name;
    $("topName").textContent = name;
    $("sidebarRole").textContent = state.role;

    setupEvents();

    try {
        if (state.role === "student") {
            showStudentView();
            await loadAssignments();
            await loadMySubmissions();
        } else if (["admin", "teacher"].includes(state.role)) {
            showReviewerView();
            await loadAssignments();
            updateStats([]);
        } else {
            showToast("Your account role is not authorized.", true);
        }
    } catch (error) {
        showToast(error.message, true);
    }
}

document.addEventListener("DOMContentLoaded", initializeSubmissions);