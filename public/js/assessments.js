const API = "/api";

const state = {
    user: null,
    role: "",
    assessments: [],
    students: [],
    classes: [],
    subjects: [],
    teachers: [],
    currentPage: 1,
    totalPages: 1,
    editingId: null
};

const $ = (id) => document.getElementById(id);

const MONTHS = [
    "",
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
];

function getStoredUser() {
    const possibleKeys = [
        "user",
        "currentUser",
        "schoolUser",
        "loggedInUser"
    ];

    for (const key of possibleKeys) {
        try {
            const value = JSON.parse(localStorage.getItem(key));

            if (value && typeof value === "object") {
                return value.user || value.data?.user || value;
            }
        } catch (error) {
            // Continue checking other storage keys.
        }
    }

    return null;
}

function getId(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value._id || value.id || "";
}

function getRole() {
    return String(state.user?.role || "").toLowerCase();
}

function extractList(response) {
    const candidates = [
        response?.data,
        response?.data?.data,
        response?.data?.students,
        response?.data?.classes,
        response?.data?.subjects,
        response?.data?.teachers,
        response?.students,
        response?.classes,
        response?.subjects,
        response?.teachers
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;

        if (candidate && typeof candidate === "object") {
            for (const key of [
                "students", "classes", "subjects", "teachers",
                "assessments", "results"
            ]) {
                if (Array.isArray(candidate[key])) return candidate[key];
            }
        }
    }

    return [];
}

async function apiRequest(url, options = {}) {
    const config = {
        credentials: "include",
        ...options,
        headers: {
            ...(options.headers || {})
        }
    };

    if (
        config.body &&
        !(config.body instanceof FormData) &&
        typeof config.body !== "string"
    ) {
        config.body = JSON.stringify(config.body);
        config.headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API}${url}`, config);

    let result;

    try {
        result = await response.json();
    } catch {
        result = {};
    }

    if (!response.ok || result.success === false) {
        throw new Error(
            result.message || `Request failed (${response.status})`
        );
    }

    return result;
}

function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    $("toastContainer").appendChild(toast);

    setTimeout(() => toast.remove(), 3500);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function displayName(person) {
    if (!person) return "—";
    if (typeof person === "string") return person;
    return person.name || person.fullName || "—";
}

function dateValue(value) {
    if (!value) return "";
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
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

function setUserDetails() {
    const user = state.user || {};

    $("userName").textContent = user.name || "User";
    $("userRole").textContent = state.role || "User";
    $("userAvatar").textContent =
        (user.name || "U").trim().charAt(0).toUpperCase();
}

function setSelectOptions(element, items, placeholder, selectedValue = "") {
    element.innerHTML = "";

    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    element.appendChild(first);

    items.forEach(item => {
        const option = document.createElement("option");
        option.value = getId(item);
        option.textContent = item.name || item.title || "Unnamed";
        element.appendChild(option);
    });

    if (selectedValue) element.value = selectedValue;
}

async function loadSupportingData() {
    const requests = [
        apiRequest("/students?limit=100"),
        apiRequest("/classes?limit=100"),
        apiRequest("/subjects?limit=100"),
        apiRequest("/teachers?limit=100")
    ];

    const results = await Promise.allSettled(requests);

    state.students = results[0].status === "fulfilled"
        ? extractList(results[0].value) : [];

    state.classes = results[1].status === "fulfilled"
        ? extractList(results[1].value) : [];

    state.subjects = results[2].status === "fulfilled"
        ? extractList(results[2].value) : [];

    state.teachers = results[3].status === "fulfilled"
        ? extractList(results[3].value) : [];

    if (getRole() === "teacher") {
        const user = state.user || {};

        const assignedClassIds = (user.assignedClasses || []).map(getId);
        const assignedSubjectIds = (user.assignedSubjects || []).map(getId);

        state.classes = state.classes.filter(item =>
            assignedClassIds.includes(getId(item))
        );

        state.subjects = state.subjects.filter(item =>
            assignedSubjectIds.includes(getId(item))
        );
    }

    setSelectOptions($("assessmentClass"), state.classes, "Select Class");
    setSelectOptions($("filterClass"), state.classes, "All Classes");
    setSelectOptions($("assessmentSubject"), state.subjects, "Select Subject");
    setSelectOptions($("filterSubject"), state.subjects, "All Subjects");
    setSelectOptions($("assessmentTeacher"), state.teachers, "Select Teacher");

    updateStudentOptions();
}

function updateStudentOptions(selectedValue = "") {
    const classId = $("assessmentClass").value;

    let students = [...state.students];

    if (classId) {
        students = students.filter(student =>
            getId(student.class) === classId
        );
    }

    setSelectOptions(
        $("assessmentStudent"),
        students,
        "Select Student",
        selectedValue
    );
}

function configureRoleUI() {
    const role = getRole();
    const isStudent = role === "student";
    const isTeacher = role === "teacher";

    if (isStudent) {
        $("addAssessmentBtn").hidden = true;
        $("studentField").hidden = true;
        $("classField").hidden = true;
        $("teacherField").hidden = true;
        $("assessmentModal").remove();

        $("filterClassGroup").hidden = true;
        $("actionsHeader").hidden = true;
        $("studentResultsPanel").hidden = false;
    }

    if (isTeacher) {
        $("teacherField").hidden = true;
        $("assessmentTeacher").required = false;
    }
}

function updateStats(assessments) {
    const totalObtained = assessments.reduce(
        (sum, item) => sum + Number(item.marksObtained || 0), 0
    );

    const percentages = assessments.map(item =>
        Number(item.percentage ??
            (item.totalMarks
                ? (item.marksObtained / item.totalMarks) * 100
                : 0))
    );

    const average = percentages.length
        ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
        : 0;

    $("totalAssessments").textContent = assessments.length;
    $("totalObtained").textContent = totalObtained.toFixed(2).replace(/\.00$/, "");
    $("averagePercentage").textContent = `${average.toFixed(2)}%`;
}

function renderAssessments(assessments) {
    const body = $("assessmentsTableBody");
    const isStudent = getRole() === "student";

    body.innerHTML = "";

    if (!assessments.length) {
        body.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    No assessment records found.
                </td>
            </tr>
        `;
        return;
    }

    assessments.forEach(item => {
        const percentage = Number(
            item.percentage ??
            (item.totalMarks
                ? (item.marksObtained / item.totalMarks) * 100
                : 0)
        );

        const student = displayName(item.student);
        const className = displayName(item.class);
        const subjectName = displayName(item.subject);
        const teacherName = displayName(item.teacher);

        const row = document.createElement("tr");

        row.innerHTML = `
            <td><span class="student-name">${escapeHTML(student)}</span></td>
            <td>${escapeHTML(className)}</td>
            <td>${escapeHTML(subjectName)}</td>
            <td>${escapeHTML(MONTHS[item.month] || "—")} ${escapeHTML(item.year || "")}</td>
            <td>${escapeHTML(item.marksObtained)} / ${escapeHTML(item.totalMarks)}</td>
            <td><span class="percentage-badge">${percentage.toFixed(2)}%</span></td>
            <td>${escapeHTML(teacherName)}</td>
            <td>${escapeHTML(formatDate(item.assessmentDate))}</td>
            <td class="actions-cell" ${isStudent ? "hidden" : ""}>
                <div class="action-buttons">
                    <button class="action-btn edit-btn" data-action="edit"
                        data-id="${escapeHTML(item._id)}">Edit</button>
                    <button class="action-btn delete-btn" data-action="delete"
                        data-id="${escapeHTML(item._id)}">Delete</button>
                </div>
            </td>
        `;

        body.appendChild(row);
    });
}

function getFilteredAssessments() {
    const classId = $("filterClass").value;
    const subjectId = $("filterSubject").value;
    const month = $("filterMonth").value;
    const year = $("filterYear").value;
    const search = $("searchAssessment").value.trim().toLowerCase();

    return state.assessments.filter(item => {
        if (classId && getId(item.class) !== classId) return false;
        if (subjectId && getId(item.subject) !== subjectId) return false;
        if (month && String(item.month) !== month) return false;
        if (year && String(item.year) !== year) return false;

        if (search) {
            const searchable = [
                displayName(item.student),
                displayName(item.class),
                displayName(item.subject),
                displayName(item.teacher)
            ].join(" ").toLowerCase();

            if (!searchable.includes(search)) return false;
        }

        return true;
    });
}

async function loadAssessments() {
    const body = $("assessmentsTableBody");

    body.innerHTML = `
        <tr><td colspan="9" class="empty-state">Loading assessments...</td></tr>
    `;

    try {
        const params = new URLSearchParams({
            page: state.currentPage,
            limit: 100
        });

        const result = await apiRequest(`/assessments?${params.toString()}`);

        state.assessments = extractList(result);

        const pagination = result.pagination || result.data?.pagination;

        state.totalPages = pagination?.totalPages || 1;

        const filtered = getFilteredAssessments();

        updateStats(filtered);
        renderAssessments(filtered);

        $("recordCount").textContent = `${filtered.length} records found`;
        $("pageInfo").textContent =
            `Page ${state.currentPage} of ${state.totalPages}`;

        $("previousPageBtn").disabled = state.currentPage <= 1;
        $("nextPageBtn").disabled = state.currentPage >= state.totalPages;

    } catch (error) {
        body.innerHTML = `
            <tr><td colspan="9" class="empty-state">
                ${escapeHTML(error.message)}
            </td></tr>
        `;

        showToast(error.message, "error");
    }
}

async function loadStudentResults() {
    const studentId = getId(state.user);

    if (!studentId) {
        showToast("Student account information was not found.", "error");
        return;
    }

    try {
        const result = await apiRequest(`/assessments/student/${studentId}`);
        const data = result.data || {};

        state.assessments = data.assessments || [];

        const summary = data.summary || {};

        $("resultTotalAssessments").textContent =
            summary.totalAssessments ?? 0;

        $("resultTotalObtained").textContent =
            summary.totalObtained ?? 0;

        $("resultTotalPossible").textContent =
            summary.totalPossible ?? 0;

        $("resultOverallPercentage").textContent =
            `${summary.overallPercentage ?? 0}%`;

        updateStats(state.assessments);
        renderAssessments(state.assessments);

        $("recordCount").textContent =
            `${state.assessments.length} records found`;

    } catch (error) {
        showToast(error.message, "error");
    }
}

function openModal() {
    $("assessmentModal").classList.add("show");
}

function closeModal() {
    $("assessmentModal").classList.remove("show");
    $("assessmentForm").reset();
    state.editingId = null;

    $("modalTitle").textContent = "Add Assessment";
    $("saveAssessmentBtn").textContent = "Save Assessment";
    $("percentagePreview").textContent = "0%";

    updateStudentOptions();
}

function updatePercentagePreview() {
    const obtained = Number($("marksObtained").value);
    const total = Number($("totalMarks").value);

    const percentage = total > 0 && obtained >= 0
        ? (obtained / total) * 100
        : 0;

    $("percentagePreview").textContent = `${percentage.toFixed(2)}%`;
}

function openCreateModal() {
    state.editingId = null;

    $("assessmentForm").reset();

    $("modalTitle").textContent = "Add Assessment";
    $("saveAssessmentBtn").textContent = "Save Assessment";

    const now = new Date();

    $("assessmentMonth").value = String(now.getMonth() + 1);
    $("assessmentYear").value = now.getFullYear();
    $("assessmentDate").value = dateValue(now);

    if (getRole() === "teacher") {
        $("assessmentTeacher").value = "";
    }

    updateStudentOptions();
    updatePercentagePreview();
    openModal();
}

function openEditModal(id) {
    const item = state.assessments.find(
        assessment => assessment._id === id
    );

    if (!item) return;

    state.editingId = id;

    $("modalTitle").textContent = "Edit Assessment";
    $("saveAssessmentBtn").textContent = "Update Assessment";

    $("assessmentClass").value = getId(item.class);
    updateStudentOptions(getId(item.student));

    $("assessmentSubject").value = getId(item.subject);
    $("assessmentTeacher").value = getId(item.teacher);

    $("assessmentMonth").value = item.month;
    $("assessmentYear").value = item.year;
    $("marksObtained").value = item.marksObtained;
    $("totalMarks").value = item.totalMarks;
    $("assessmentRemarks").value = item.remarks || "";
    $("assessmentDate").value = dateValue(item.assessmentDate);

    updatePercentagePreview();
    openModal();
}

async function saveAssessment(event) {
    event.preventDefault();

    const marksObtained = Number($("marksObtained").value);
    const totalMarks = Number($("totalMarks").value);

    if (
        !Number.isFinite(marksObtained) ||
        !Number.isFinite(totalMarks) ||
        totalMarks < 1 ||
        marksObtained < 0 ||
        marksObtained > totalMarks
    ) {
        showToast("Obtained marks cannot exceed total marks.", "error");
        return;
    }

    const payload = {
        marksObtained,
        totalMarks,
        remarks: $("assessmentRemarks").value.trim(),
        assessmentDate: $("assessmentDate").value || undefined
    };

    if (!state.editingId) {
        payload.student = $("assessmentStudent").value;
        payload.class = $("assessmentClass").value;
        payload.subject = $("assessmentSubject").value;
        payload.month = Number($("assessmentMonth").value);
        payload.year = Number($("assessmentYear").value);

        if (getRole() === "admin") {
            payload.teacher = $("assessmentTeacher").value;
        }

        if (
            !payload.student ||
            !payload.class ||
            !payload.subject ||
            !payload.month ||
            !payload.year
        ) {
            showToast("Please complete all required fields.", "error");
            return;
        }
    }

    const button = $("saveAssessmentBtn");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        if (state.editingId) {
            await apiRequest(`/assessments/${state.editingId}`, {
                method: "PUT",
                body: payload
            });

            showToast("Assessment updated successfully.");
        } else {
            await apiRequest("/assessments", {
                method: "POST",
                body: payload
            });

            showToast("Assessment created successfully.");
        }

        closeModal();
        await loadAssessments();

    } catch (error) {
        showToast(error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = state.editingId
            ? "Update Assessment"
            : "Save Assessment";
    }
}

async function deleteAssessment(id) {
    const confirmed = confirm(
        "Are you sure you want to delete this assessment?"
    );

    if (!confirmed) return;

    try {
        await apiRequest(`/assessments/${id}`, {
            method: "DELETE"
        });

        showToast("Assessment deleted successfully.");
        await loadAssessments();

    } catch (error) {
        showToast(error.message, "error");
    }
}

function applyFilters() {
    const filtered = getFilteredAssessments();

    updateStats(filtered);
    renderAssessments(filtered);

    $("recordCount").textContent = `${filtered.length} records found`;
}

function attachEvents() {
    $("addAssessmentBtn").addEventListener("click", openCreateModal);

    $("closeModalBtn").addEventListener("click", closeModal);
    $("cancelModalBtn").addEventListener("click", closeModal);

    $("assessmentForm").addEventListener("submit", saveAssessment);

    $("assessmentClass").addEventListener("change", () => {
        updateStudentOptions();
    });

    $("marksObtained").addEventListener("input", updatePercentagePreview);
    $("totalMarks").addEventListener("input", updatePercentagePreview);

    [
        "filterClass",
        "filterSubject",
        "filterMonth",
        "filterYear",
        "searchAssessment"
    ].forEach(id => {
        $(id).addEventListener("input", applyFilters);
        $(id).addEventListener("change", applyFilters);
    });

    $("resetFiltersBtn").addEventListener("click", () => {
        $("filterClass").value = "";
        $("filterSubject").value = "";
        $("filterMonth").value = "";
        $("filterYear").value = "";
        $("searchAssessment").value = "";

        applyFilters();
    });

    $("refreshBtn").addEventListener("click", async () => {
        if (getRole() === "student") {
            await loadStudentResults();
        } else {
            await loadAssessments();
        }
    });

    $("previousPageBtn").addEventListener("click", async () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            await loadAssessments();
        }
    });

    $("nextPageBtn").addEventListener("click", async () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            await loadAssessments();
        }
    });

    $("assessmentsTableBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        const id = button.dataset.id;

        if (button.dataset.action === "edit") {
            openEditModal(id);
        }

        if (button.dataset.action === "delete") {
            deleteAssessment(id);
        }
    });

    $("assessmentModal").addEventListener("click", event => {
        if (event.target === $("assessmentModal")) closeModal();
    });
}

async function initializeAssessments() {
    state.user = getStoredUser();
    state.role = getRole();

    setUserDetails();
    configureRoleUI();
    attachEvents();

    if (state.role === "student") {
        await loadStudentResults();
        return;
    }

    await loadSupportingData();
    await loadAssessments();
}

document.addEventListener("DOMContentLoaded", initializeAssessments);