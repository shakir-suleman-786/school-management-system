const API = "/api";

const state = {
    assignments: [],
    classes: [],
    subjects: [],
    role: "admin"
};

const $ = id => document.getElementById(id);

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
})[char]);

function getUserRole() {
    const possibleKeys = ["user", "currentUser", "schoolUser"];
    for (const key of possibleKeys) {
        try {
            const user = JSON.parse(localStorage.getItem(key));
            if (user?.role) return user.role;
        } catch (_) {}
    }
    return "admin";
}

async function apiRequest(url, options = {}) {
    const response = await fetch(`${API}${url}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    let result;
    try {
        result = await response.json();
    } catch (_) {
        result = {};
    }

    if (!response.ok || result.success === false) {
        throw new Error(result.message || "Something went wrong.");
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

function getId(item) {
    return item?._id || item?.id || "";
}

function getClassName(item) {
    if (!item) return "—";
    return `${item.name || "Class"}${item.section ? ` - ${item.section}` : ""}`;
}

function getSubjectName(item) {
    if (!item) return "—";
    return item.code ? `${item.name} (${item.code})` : item.name || "—";
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatDateTimeInput(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function closeModal() {
    $("assignmentModal").classList.remove("show");
}

function openModal() {
    $("assignmentModal").classList.add("show");
}

function updateStats() {
    $("totalCount").textContent = state.assignments.length;
    $("publishedCount").textContent =
        state.assignments.filter(item => item.status === "published").length;
    $("draftCount").textContent =
        state.assignments.filter(item => item.status === "draft").length;
    $("closedCount").textContent =
        state.assignments.filter(item => item.status === "closed").length;
}

function renderAssignments() {
    const search = $("searchInput").value.trim().toLowerCase();
    const classId = $("classFilter").value;
    const subjectId = $("subjectFilter").value;
    const status = $("statusFilter").value;

    const filtered = state.assignments.filter(item => {
        const matchesSearch = (item.title || "").toLowerCase().includes(search);
        const matchesClass = !classId || getId(item.class) === classId;
        const matchesSubject = !subjectId || getId(item.subject) === subjectId;
        const matchesStatus = !status || item.status === status;

        return matchesSearch && matchesClass && matchesSubject && matchesStatus;
    });

    const tbody = $("assignmentsTableBody");

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="table-message">No assignments found.</td>
            </tr>`;
        $("paginationInfo").textContent = "Showing 0 assignments";
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        const statusClass = ["draft", "published", "closed"].includes(item.status)
            ? item.status
            : "draft";

        const actions = state.role === "student"
            ? `<button class="action-button view-action" data-action="view" data-id="${escapeHTML(item._id)}">View</button>`
            : `
                <button class="action-button view-action" data-action="view" data-id="${escapeHTML(item._id)}">View</button>
                <button class="action-button edit-action" data-action="edit" data-id="${escapeHTML(item._id)}">Edit</button>
                <button class="action-button delete-action" data-action="delete" data-id="${escapeHTML(item._id)}">Delete</button>
            `;

        return `
            <tr>
                <td>
                    <div class="assignment-title">${escapeHTML(item.title)}</div>
                    <div class="assignment-subtitle">
                        ${escapeHTML(item.teacher?.name || "Teacher")}
                    </div>
                </td>
                <td>${escapeHTML(getClassName(item.class))}</td>
                <td>${escapeHTML(getSubjectName(item.subject))}</td>
                <td>${escapeHTML(formatDate(item.dueDate))}</td>
                <td>${escapeHTML(item.maxMarks ?? 100)}</td>
                <td><span class="status-badge status-${statusClass}">${escapeHTML(item.status)}</span></td>
                <td><div class="action-buttons">${actions}</div></td>
            </tr>`;
    }).join("");

    $("paginationInfo").textContent =
        `Showing ${filtered.length} of ${state.assignments.length} assignments`;
}

async function loadAssignments() {
    $("assignmentsTableBody").innerHTML =
        `<tr><td colspan="7" class="table-message">Loading assignments...</td></tr>`;

    try {
        const result = await apiRequest("/assignments");
        state.assignments = result.data?.assignments || [];

        updateStats();
        renderAssignments();
    } catch (error) {
        $("assignmentsTableBody").innerHTML =
            `<tr><td colspan="7" class="table-message">${escapeHTML(error.message)}</td></tr>`;
        showToast(error.message, true);
    }
}

function fillClassOptions() {
    const options = state.classes.map(item =>
        `<option value="${escapeHTML(getId(item))}">${escapeHTML(getClassName(item))}</option>`
    ).join("");

    $("classId").innerHTML = `<option value="">Select Class</option>${options}`;
    $("classFilter").innerHTML = `<option value="">All Classes</option>${options}`;
}

function subjectBelongsToClass(subject, classId) {
    if (!classId) return true;

    const assignedClasses = subject.classes || [];
    return assignedClasses.some(item => {
        const id = typeof item === "object" ? getId(item) : item;
        return String(id) === String(classId);
    });
}

function fillSubjectOptions(classId = "") {
    const subjects = state.subjects.filter(subject =>
        subjectBelongsToClass(subject, classId)
    );

    const options = subjects.map(item =>
        `<option value="${escapeHTML(getId(item))}">${escapeHTML(getSubjectName(item))}</option>`
    ).join("");

    $("subjectId").innerHTML = `<option value="">Select Subject</option>${options}`;

    const filterOptions = state.subjects.map(item =>
        `<option value="${escapeHTML(getId(item))}">${escapeHTML(getSubjectName(item))}</option>`
    ).join("");

    $("subjectFilter").innerHTML =
        `<option value="">All Subjects</option>${filterOptions}`;
}

async function loadDropdownData() {
    const [classResult, subjectResult] = await Promise.all([
        apiRequest("/classes"),
        apiRequest("/subjects")
    ]);

    state.classes = classResult.data?.classes || [];
    state.subjects = subjectResult.data?.subjects || [];

    fillClassOptions();
    fillSubjectOptions();
}

function resetForm() {
    $("assignmentForm").reset();
    $("assignmentId").value = "";
    $("maxMarks").value = 100;
    $("status").value = "draft";
    $("allowTextSubmission").checked = true;
    $("allowFileSubmission").checked = true;
    $("modalTitle").textContent = "Create Assignment";
    $("saveButton").textContent = "Save Assignment";
    fillSubjectOptions($("classId").value);
}

function openCreateModal() {
    resetForm();
    openModal();
}

async function editAssignment(id) {
    try {
        const result = await apiRequest(`/assignments/${id}`);
        const item = result.data?.assignment;

        if (!item) throw new Error("Assignment not found.");

        resetForm();

        $("assignmentId").value = item._id;
        $("title").value = item.title || "";
        $("description").value = item.description || "";
        $("instructions").value = item.instructions || "";
        $("classId").value = getId(item.class);

        fillSubjectOptions($("classId").value);
        $("subjectId").value = getId(item.subject);

        $("dueDate").value = formatDateTimeInput(item.dueDate);
        $("maxMarks").value = item.maxMarks ?? 100;
        $("status").value = item.status || "draft";

        $("allowTextSubmission").checked = item.allowTextSubmission !== false;
        $("allowFileSubmission").checked = item.allowFileSubmission !== false;

        document.querySelectorAll('input[name="fileType"]').forEach(input => {
            input.checked = (item.allowedFileTypes || []).includes(input.value);
        });

        $("modalTitle").textContent = "Edit Assignment";
        $("saveButton").textContent = "Update Assignment";

        openModal();
    } catch (error) {
        showToast(error.message, true);
    }
}

async function saveAssignment(event) {
    event.preventDefault();

    const id = $("assignmentId").value;

    const allowedFileTypes = Array.from(
        document.querySelectorAll('input[name="fileType"]:checked')
    ).map(input => input.value);

    const payload = {
        title: $("title").value.trim(),
        description: $("description").value.trim(),
        instructions: $("instructions").value.trim(),
        class: $("classId").value,
        subject: $("subjectId").value,
        dueDate: new Date($("dueDate").value).toISOString(),
        maxMarks: Number($("maxMarks").value),
        status: $("status").value,
        allowTextSubmission: $("allowTextSubmission").checked,
        allowFileSubmission: $("allowFileSubmission").checked,
        allowedFileTypes
    };

    if (!payload.class || !payload.subject) {
        showToast("Please select both class and subject.", true);
        return;
    }

    if (!payload.dueDate || Number.isNaN(new Date(payload.dueDate).getTime())) {
        showToast("Please select a valid due date.", true);
        return;
    }

    const saveButton = $("saveButton");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
        if (id) {
            // Update endpoint accepts PUT.
            delete payload.class;
            delete payload.subject;

            await apiRequest(`/assignments/${id}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });

            showToast("Assignment updated successfully.");
        } else {
            await apiRequest("/assignments", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showToast("Assignment created successfully.");
        }

        closeModal();
        await loadAssignments();
    } catch (error) {
        showToast(error.message, true);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = id ? "Update Assignment" : "Save Assignment";
    }
}

async function viewAssignment(id) {
    try {
        const result = await apiRequest(`/assignments/${id}`);
        const item = result.data?.assignment;

        if (!item) throw new Error("Assignment not found.");

        const details = [
            ["Title", item.title],
            ["Class", getClassName(item.class)],
            ["Subject", getSubjectName(item.subject)],
            ["Teacher", item.teacher?.name || "—"],
            ["Due Date", formatDate(item.dueDate)],
            ["Maximum Marks", item.maxMarks ?? 100],
            ["Status", item.status],
            ["Description", item.description, true],
            ["Instructions", item.instructions || "No additional instructions", true],
            ["Text Submission", item.allowTextSubmission ? "Allowed" : "Not allowed"],
            ["File Submission", item.allowFileSubmission ? "Allowed" : "Not allowed"],
            ["Allowed File Types", (item.allowedFileTypes || []).join(", ").toUpperCase() || "Not specified"]
        ];

        $("assignmentDetails").innerHTML = details.map(([label, value, full]) => `
            <div class="detail-item ${full ? "full" : ""}">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(value ?? "—")}</strong>
            </div>
        `).join("");

        $("viewModal").classList.add("show");
    } catch (error) {
        showToast(error.message, true);
    }
}

async function deleteAssignment(id) {
    const confirmed = confirm(
        "Are you sure you want to delete this assignment? Assignments with submissions cannot be deleted."
    );

    if (!confirmed) return;

    try {
        await apiRequest(`/assignments/${id}`, {
            method: "DELETE"
        });

        showToast("Assignment deleted successfully.");
        await loadAssignments();
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
    $("addAssignmentButton").addEventListener("click", openCreateModal);
    $("closeModalButton").addEventListener("click", closeModal);
    $("cancelButton").addEventListener("click", closeModal);
    $("closeViewButton").addEventListener("click", () =>
        $("viewModal").classList.remove("show")
    );

    $("assignmentForm").addEventListener("submit", saveAssignment);

    $("classId").addEventListener("change", () => {
        fillSubjectOptions($("classId").value);
    });

    $("searchInput").addEventListener("input", renderAssignments);
    $("classFilter").addEventListener("change", renderAssignments);
    $("subjectFilter").addEventListener("change", renderAssignments);
    $("statusFilter").addEventListener("change", renderAssignments);

    $("refreshButton").addEventListener("click", async () => {
        await loadDropdownData();
        await loadAssignments();
        showToast("Assignments refreshed.");
    });

    $("assignmentsTableBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const { action, id } = button.dataset;

        if (action === "view") viewAssignment(id);
        if (action === "edit") editAssignment(id);
        if (action === "delete") deleteAssignment(id);
    });

    $("logoutButton").addEventListener("click", logout);

    $("menuButton").addEventListener("click", () => {
        $("sidebar").classList.toggle("active");
    });

    $("assignmentModal").addEventListener("click", event => {
        if (event.target === $("assignmentModal")) closeModal();
    });

    $("viewModal").addEventListener("click", event => {
        if (event.target === $("viewModal")) {
            $("viewModal").classList.remove("show");
        }
    });
}

async function initializeAssignments() {
    state.role = getUserRole();

    if (state.role === "student") {
        $("addAssignmentButton").style.display = "none";
    }

    setupEvents();

    try {
        await loadDropdownData();
        await loadAssignments();
    } catch (error) {
        showToast(error.message, true);
        $("assignmentsTableBody").innerHTML =
            `<tr><td colspan="7" class="table-message">${escapeHTML(error.message)}</td></tr>`;
    }
}

document.addEventListener("DOMContentLoaded", initializeAssignments);