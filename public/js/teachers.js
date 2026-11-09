
const API = "/api";

const state = {
    teachers: [],
    currentPage: 1,
    totalPages: 1,
    limit: 10,
    editingId: null,
    searchTimer: null
};

const $ = id => document.getElementById(id);

const elements = {
    sidebar: $("sidebar"),
    menuButton: $("menuButton"),
    logoutButton: $("logoutButton"),

    sidebarName: $("sidebarName"),
    topName: $("topName"),

    teacherModal: $("teacherModal"),
    teacherForm: $("teacherForm"),
    modalTitle: $("modalTitle"),

    addTeacherButton: $("addTeacherButton"),
    closeModalButton: $("closeModalButton"),
    cancelButton: $("cancelButton"),
    saveButton: $("saveButton"),

    teacherName: $("teacherName"),
    teacherEmail: $("teacherEmail"),
    teacherPhone: $("teacherPhone"),
    teacherPassword: $("teacherPassword"),
    passwordGroup: $("passwordGroup"),

    classesContainer: $("classesContainer"),
    subjectsContainer: $("subjectsContainer"),

    selectedClassesCount: $("selectedClassesCount"),
    selectedSubjectsCount: $("selectedSubjectsCount"),

    teachersTable: $("teachersTable"),
    searchInput: $("searchInput"),
    statusFilter: $("statusFilter"),
    refreshButton: $("refreshButton"),

    totalTeachers: $("totalTeachers"),
    activeTeachers: $("activeTeachers"),
    inactiveTeachers: $("inactiveTeachers"),

    paginationInfo: $("paginationInfo"),
    pageInfo: $("pageInfo"),
    previousButton: $("previousButton"),
    nextButton: $("nextButton"),

    toast: $("toast")
};


// ==========================================
// API REQUEST
// ==========================================

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API}${endpoint}`, {
        credentials: "same-origin",
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
        throw new Error("Server returned an invalid response.");
    }

    if (!response.ok || result.success === false) {
        throw new Error(
            result.message ||
            result.error ||
            `Request failed (${response.status}).`
        );
    }

    return result;
}


// ==========================================
// RESPONSE HELPERS
// ==========================================

function getArray(result, type = "") {
    if (Array.isArray(result)) {
        return result;
    }

    if (Array.isArray(result?.data)) {
        return result.data;
    }

    if (Array.isArray(result?.data?.[type])) {
        return result.data[type];
    }

    if (Array.isArray(result?.[type])) {
        return result[type];
    }

    if (Array.isArray(result?.results)) {
        return result.results;
    }

    return [];
}


function getTeacherObject(result) {
    return (
        result?.teacher ||
        result?.data?.teacher ||
        result?.data
    );
}


function getId(item) {
    if (typeof item === "string") {
        return item;
    }

    return item?._id || item?.id || "";
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


function showToast(message, type = "success") {
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type}`;

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        elements.toast.className = "toast";
    }, 3500);
}


// ==========================================
// AUTHENTICATION
// ==========================================

async function checkAdmin() {
    try {
        const result = await apiRequest("/auth/me");

        const user =
            result.user ||
            result.data?.user ||
            result.data;

        if (!user || user.role !== "admin") {
            window.location.href = "/login.html";
            return false;
        }

        elements.sidebarName.textContent = user.name || "Administrator";
        elements.topName.textContent = user.name || "Administrator";

        return true;

    } catch (error) {
        console.error("Admin authentication:", error);
        window.location.href = "/login.html";
        return false;
    }
}


// ==========================================
// LOAD CLASSES AND SUBJECTS
// ==========================================

async function loadAssignmentOptions() {
    elements.classesContainer.innerHTML =
        '<p class="loading-text">Loading classes...</p>';

    elements.subjectsContainer.innerHTML =
        '<p class="loading-text">Loading subjects...</p>';

    const [classResult, subjectResult] = await Promise.allSettled([
        apiRequest("/classes?page=1&limit=100&isActive=true"),
        apiRequest("/subjects?page=1&limit=100")
    ]);

    if (classResult.status === "fulfilled") {
        const classes = getArray(classResult.value, "classes");
        renderAssignmentOptions(
            elements.classesContainer,
            classes,
            "class"
        );
    } else {
        elements.classesContainer.innerHTML =
            '<p class="no-options">Unable to load classes.</p>';
        console.error("Classes API:", classResult.reason);
    }

    if (subjectResult.status === "fulfilled") {
        const subjects = getArray(subjectResult.value, "subjects");
        renderAssignmentOptions(
            elements.subjectsContainer,
            subjects,
            "subject"
        );
    } else {
        elements.subjectsContainer.innerHTML =
            '<p class="no-options">Unable to load subjects.</p>';
        console.error("Subjects API:", subjectResult.reason);
    }

    updateAssignmentCounts();
}


// ==========================================
// RENDER ASSIGNMENT CHECKBOXES
// ==========================================

function renderAssignmentOptions(container, items, type) {
    if (!items.length) {
        container.innerHTML = `
            <p class="no-options">
                No ${type === "class" ? "active classes" : "subjects"} found.
                Please create ${type === "class" ? "a class" : "a subject"} first.
            </p>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const id = getId(item);

        const name = item.name ||
            item.className ||
            item.subjectName ||
            "Unnamed";

        if (!id) return "";

        return `
            <label class="assignment-option">
                <input
                    type="checkbox"
                    class="${type}-checkbox"
                    value="${escapeHTML(id)}"
                >
                <span>${escapeHTML(name)}</span>
            </label>
        `;
    }).join("");
}


// ==========================================
// SELECTED ASSIGNMENT IDS
// ==========================================

function getSelectedIds(selector) {
    return Array.from(
        document.querySelectorAll(`${selector}:checked`)
    ).map(input => input.value);
}


function updateAssignmentCounts() {
    const classes = getSelectedIds(".class-checkbox");
    const subjects = getSelectedIds(".subject-checkbox");

    elements.selectedClassesCount.textContent =
        `${classes.length} selected`;

    elements.selectedSubjectsCount.textContent =
        `${subjects.length} selected`;
}


function setSelectedIds(selector, assignedItems = []) {
    const ids = assignedItems.map(getId);

    document.querySelectorAll(selector).forEach(input => {
        input.checked = ids.includes(input.value);
    });

    updateAssignmentCounts();
}


// ==========================================
// LOAD TEACHERS
// ==========================================

async function loadTeachers() {
    elements.teachersTable.innerHTML = `
        <tr>
            <td colspan="6" class="empty-cell">Loading teachers...</td>
        </tr>
    `;

    try {
        const search = elements.searchInput.value.trim();
        const status = elements.statusFilter.value;

        let endpoint =
            `/teachers?page=${state.currentPage}&limit=${state.limit}`;

        if (search) {
            endpoint += `&search=${encodeURIComponent(search)}`;
        }

        if (status !== "") {
            endpoint += `&isActive=${status}`;
        }

        const result = await apiRequest(endpoint);

        state.teachers = getArray(result);

        const pagination =
            result.pagination ||
            result.data?.pagination ||
            {};

        state.totalPages = Math.max(
            1,
            pagination.totalPages || 1
        );

        renderTeachers();
        updatePagination(pagination);

        await loadStatistics();

    } catch (error) {
        console.error("Teachers loading error:", error);

        elements.teachersTable.innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    Unable to load teachers. ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showToast(error.message, "error");
    }
}


// ==========================================
// RENDER TEACHERS
// ==========================================

function getAssignedNames(items) {
    if (!Array.isArray(items) || !items.length) {
        return "—";
    }

    return items.map(item => {
        if (typeof item === "string") {
            return escapeHTML(item);
        }

        return escapeHTML(
            item.name ||
            item.className ||
            item.subjectName ||
            "Unnamed"
        );
    }).join(", ");
}


function renderTeachers() {
    if (!state.teachers.length) {
        elements.teachersTable.innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    No teachers found.
                </td>
            </tr>
        `;
        return;
    }

    elements.teachersTable.innerHTML = state.teachers.map(teacher => {
        const id = getId(teacher);

        const status = teacher.isActive
            ? '<span class="status-badge active">Active</span>'
            : '<span class="status-badge inactive">Inactive</span>';

        return `
            <tr>
                <td>
                    <strong>${escapeHTML(teacher.name)}</strong>
                    <br>
                    <small>${escapeHTML(teacher.email)}</small>
                </td>

                <td>${escapeHTML(teacher.phone || "—")}</td>

                <td>${getAssignedNames(teacher.assignedClasses)}</td>

                <td>${getAssignedNames(teacher.assignedSubjects)}</td>

                <td>${status}</td>

                <td>
                    <div class="action-buttons">
                        <button
                            class="btn-edit"
                            data-action="edit"
                            data-id="${escapeHTML(id)}">
                            Edit
                        </button>

                        <button
                            class="btn-status"
                            data-action="status"
                            data-id="${escapeHTML(id)}">
                            ${teacher.isActive ? "Deactivate" : "Activate"}
                        </button>

                        <button
                            class="btn-delete"
                            data-action="delete"
                            data-id="${escapeHTML(id)}">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}


// ==========================================
// STATISTICS
// ==========================================

async function loadStatistics() {
    try {
        const [all, active, inactive] = await Promise.all([
            apiRequest("/teachers?page=1&limit=1"),
            apiRequest("/teachers?page=1&limit=1&isActive=true"),
            apiRequest("/teachers?page=1&limit=1&isActive=false")
        ]);

        const total = responseTotal(all);
        const activeTotal = responseTotal(active);
        const inactiveTotal = responseTotal(inactive);

        elements.totalTeachers.textContent = total;
        elements.activeTeachers.textContent = activeTotal;
        elements.inactiveTeachers.textContent = inactiveTotal;

    } catch (error) {
        console.error("Statistics error:", error);
    }
}


function responseTotal(result) {
    return (
        result?.pagination?.total ??
        result?.data?.pagination?.total ??
        result?.results ??
        0
    );
}


// ==========================================
// PAGINATION
// ==========================================

function updatePagination(pagination = {}) {
    const total = pagination.total ?? state.teachers.length;

    elements.paginationInfo.textContent =
        `Showing ${state.teachers.length} of ${total} teachers`;

    elements.pageInfo.textContent =
        `Page ${state.currentPage} of ${state.totalPages}`;

    elements.previousButton.disabled =
        state.currentPage <= 1;

    elements.nextButton.disabled =
        state.currentPage >= state.totalPages;
}


// ==========================================
// OPEN ADD MODAL
// ==========================================

function openAddModal() {
    state.editingId = null;

    elements.teacherForm.reset();

    elements.modalTitle.textContent = "Add New Teacher";
    elements.saveButton.textContent = "Save Teacher";

    elements.passwordGroup.style.display = "";
    elements.teacherPassword.required = true;

    setSelectedIds(".class-checkbox", []);
    setSelectedIds(".subject-checkbox", []);

    elements.teacherModal.classList.add("active");
}


// ==========================================
// OPEN EDIT MODAL
// ==========================================

async function openEditModal(id) {
    try {
        const result = await apiRequest(`/teachers/${id}`);
        const teacher = getTeacherObject(result);

        if (!teacher || !getId(teacher)) {
            throw new Error("Teacher details could not be loaded.");
        }

        state.editingId = id;

        elements.teacherName.value = teacher.name || "";
        elements.teacherEmail.value = teacher.email || "";
        elements.teacherPhone.value = teacher.phone || "";

        elements.teacherPassword.value = "";
        elements.teacherPassword.required = false;

        elements.passwordGroup.style.display = "none";

        elements.modalTitle.textContent = "Edit Teacher";
        elements.saveButton.textContent = "Update Teacher";

        setSelectedIds(
            ".class-checkbox",
            teacher.assignedClasses || []
        );

        setSelectedIds(
            ".subject-checkbox",
            teacher.assignedSubjects || []
        );

        elements.teacherModal.classList.add("active");

    } catch (error) {
        console.error("Edit teacher error:", error);
        showToast(error.message, "error");
    }
}


// ==========================================
// CLOSE MODAL
// ==========================================

function closeModal() {
    elements.teacherModal.classList.remove("active");
    elements.teacherForm.reset();

    state.editingId = null;

    elements.passwordGroup.style.display = "";
    elements.teacherPassword.required = true;

    updateAssignmentCounts();
}


// ==========================================
// SAVE TEACHER
// ==========================================

async function saveTeacher(event) {
    event.preventDefault();

    const isEditing = Boolean(state.editingId);

    const assignedClasses = getSelectedIds(".class-checkbox");
    const assignedSubjects = getSelectedIds(".subject-checkbox");

    const payload = {
        name: elements.teacherName.value.trim(),
        email: elements.teacherEmail.value.trim(),
        phone: elements.teacherPhone.value.trim(),
        assignedClasses,
        assignedSubjects
    };

    if (!isEditing) {
        payload.password = elements.teacherPassword.value;
    }

    if (!payload.name || !payload.email) {
        showToast("Please enter teacher name and email.", "error");
        return;
    }

    if (!isEditing && (!payload.password || payload.password.length < 8)) {
        showToast("Password must contain at least 8 characters.", "error");
        return;
    }

    if (!assignedClasses.length) {
        showToast("Please select at least one class.", "error");
        return;
    }

    if (!assignedSubjects.length) {
        showToast("Please select at least one subject.", "error");
        return;
    }

    const endpoint = isEditing
        ? `/teachers/${state.editingId}`
        : "/teachers";

    const method = isEditing ? "PUT" : "POST";

    try {
        elements.saveButton.disabled = true;
        elements.saveButton.textContent = "Saving...";

        await apiRequest(endpoint, {
            method,
            body: JSON.stringify(payload)
        });

        showToast(
            isEditing
                ? "Teacher updated successfully."
                : "Teacher created successfully."
        );

        closeModal();

        await loadTeachers();

    } catch (error) {
        console.error("Save teacher error:", error);
        showToast(error.message, "error");

    } finally {
        elements.saveButton.disabled = false;
        elements.saveButton.textContent = "Save Teacher";
    }
}


// ==========================================
// ACTIVATE / DEACTIVATE
// ==========================================

async function toggleTeacherStatus(id) {
    try {
        await apiRequest(`/teachers/${id}/status`, {
            method: "PATCH"
        });

        showToast("Teacher status updated successfully.");

        await loadTeachers();

    } catch (error) {
        console.error("Status update error:", error);
        showToast(error.message, "error");
    }
}


// ==========================================
// DELETE TEACHER
// ==========================================

async function deleteTeacher(id) {
    if (!confirm("Are you sure you want to delete this teacher?")) {
        return;
    }

    try {
        await apiRequest(`/teachers/${id}`, {
            method: "DELETE"
        });

        showToast("Teacher deleted successfully.");

        await loadTeachers();

    } catch (error) {
        console.error("Delete teacher error:", error);
        showToast(error.message, "error");
    }
}


// ==========================================
// TABLE ACTIONS
// ==========================================

function handleTableActions(event) {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const { action, id } = button.dataset;

    if (!id) return;

    if (action === "edit") {
        openEditModal(id);
    }

    if (action === "status") {
        toggleTeacherStatus(id);
    }

    if (action === "delete") {
        deleteTeacher(id);
    }
}


// ==========================================
// LOGOUT
// ==========================================

async function logout() {
    try {
        await apiRequest("/auth/logout", {
            method: "POST"
        });
    } catch (error) {
        console.error("Logout:", error);
    }

    window.location.href = "/login.html";
}


// ==========================================
// EVENT LISTENERS
// ==========================================

function attachEventListeners() {
    elements.addTeacherButton.addEventListener(
        "click",
        openAddModal
    );

    elements.closeModalButton.addEventListener(
        "click",
        closeModal
    );

    elements.cancelButton.addEventListener(
        "click",
        closeModal
    );

    elements.teacherForm.addEventListener(
        "submit",
        saveTeacher
    );

    elements.teachersTable.addEventListener(
        "click",
        handleTableActions
    );

    elements.refreshButton.addEventListener(
        "click",
        loadTeachers
    );

    elements.previousButton.addEventListener("click", async () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            await loadTeachers();
        }
    });

    elements.nextButton.addEventListener("click", async () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            await loadTeachers();
        }
    });

    elements.searchInput.addEventListener("input", () => {
        clearTimeout(state.searchTimer);

        state.searchTimer = setTimeout(() => {
            state.currentPage = 1;
            loadTeachers();
        }, 350);
    });

    elements.statusFilter.addEventListener("change", () => {
        state.currentPage = 1;
        loadTeachers();
    });

    elements.classesContainer.addEventListener(
        "change",
        updateAssignmentCounts
    );

    elements.subjectsContainer.addEventListener(
        "change",
        updateAssignmentCounts
    );

    elements.logoutButton.addEventListener("click", logout);

    elements.menuButton.addEventListener("click", () => {
        elements.sidebar.classList.toggle("active");
    });

    elements.teacherModal.addEventListener("click", event => {
        if (event.target === elements.teacherModal) {
            closeModal();
        }
    });
}


// ==========================================
// INITIALIZE
// ==========================================

async function initializeTeachersPage() {
    attachEventListeners();

    const authenticated = await checkAdmin();

    if (!authenticated) return;

    try {
        await loadAssignmentOptions();
        await loadTeachers();
    } catch (error) {
        console.error("Teachers page initialization:", error);
        showToast(error.message, "error");
    }
}

document.addEventListener(
    "DOMContentLoaded",
    initializeTeachersPage
);
