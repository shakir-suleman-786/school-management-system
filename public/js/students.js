
const API = "/api";

const sidebar = document.getElementById("sidebar");
const menuButton = document.getElementById("menuButton");
const logoutButton = document.getElementById("logoutButton");

const studentModal = document.getElementById("studentModal");
const studentForm = document.getElementById("studentForm");
const studentsTable = document.getElementById("studentsTable");

const searchInput = document.getElementById("searchInput");
const classFilter = document.getElementById("classFilter");
const statusFilter = document.getElementById("statusFilter");

let currentPage = 1;
const pageLimit = 10;
let totalPages = 1;
let editingStudentId = null;
let searchTimer = null;
let toastTimer = null;

let currentStudents = [];

function showToast(message, error = false) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.body instanceof FormData
                ? {}
                : { "Content-Type": "application/json" }),
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
        if (url === "/api/auth/me") {
            window.location.replace("/");
            throw new Error("Authentication required.");
        }
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

// AUTHENTICATION
async function checkAdmin() {
    try {
        const data = await apiRequest("/api/auth/me");

        if (!data.user || data.user.role !== "admin") {
            window.location.replace("/");
            return false;
        }

        const name = data.user.name || "Administrator";

        document.getElementById("sidebarName").textContent = name;
        document.getElementById("topName").textContent = name;

        return true;
    } catch (error) {
        window.location.replace("/");
        return false;
    }
}

// LOAD CLASS OPTIONS
async function loadClasses() {
    try {
        const response = await apiRequest(
            `${API}/classes?page=1&limit=100&isActive=true`
        );

        const classes = response.data || [];

        const filterOptions = ['<option value="">All Classes</option>'];
        const formOptions = ['<option value="">Not Assigned</option>'];

        classes.forEach(classItem => {
            const label = `${classItem.name} - ${classItem.section} (${classItem.academicYear})`;

            filterOptions.push(
                `<option value="${classItem._id}">${escapeHTML(label)}</option>`
            );

            formOptions.push(
                `<option value="${classItem._id}">${escapeHTML(label)}</option>`
            );
        });

        classFilter.innerHTML = filterOptions.join("");
        document.getElementById("studentClass").innerHTML =
            formOptions.join("");

    } catch (error) {
        showToast("Unable to load classes: " + error.message, true);
    }
}

// LOAD STUDENTS
async function loadStudents() {
    studentsTable.innerHTML = `
        <tr>
            <td colspan="7" class="loading-cell">Loading students...</td>
        </tr>
    `;

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: pageLimit
        });

        if (searchInput.value.trim()) {
            params.set("search", searchInput.value.trim());
        }

        if (classFilter.value) {
            params.set("class", classFilter.value);
        }

        if (statusFilter.value) {
            params.set("isActive", statusFilter.value);
        }

        const response = await apiRequest(
            `${API}/students?${params.toString()}`
        );

        currentStudents = response.data || [];

        totalPages = Math.max(
            1,
            response.pagination?.totalPages || 1
        );

        renderStudents(currentStudents);
        updatePagination(response.pagination || {});
        updateStatistics();

    } catch (error) {
        studentsTable.innerHTML = `
            <tr>
                <td colspan="7" class="empty-cell">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showToast(error.message, true);
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function renderStudents(students) {
    if (!students.length) {
        studentsTable.innerHTML = `
            <tr>
                <td colspan="7" class="empty-cell">
                    No students found. Add your first student.
                </td>
            </tr>
        `;
        return;
    }

    studentsTable.innerHTML = students.map(student => {
        const name = student.name || "Unknown Student";
        const initial = escapeHTML(name.charAt(0).toUpperCase());

        const className = student.class
            ? `${student.class.name} - ${student.class.section}`
            : "Not Assigned";

        const status = student.isActive ? "Active" : "Inactive";

        return `
            <tr>
                <td>
                    <div class="student-info">
                        <div class="student-avatar">${initial}</div>
                        <div>
                            <strong>${escapeHTML(name)}</strong>
                            <small>${escapeHTML(student.email)}</small>
                        </div>
                    </div>
                </td>

                <td>${escapeHTML(student.admissionNumber || "—")}</td>
                <td>${escapeHTML(student.rollNumber || "—")}</td>
                <td>${escapeHTML(className)}</td>
                <td>${escapeHTML(student.phone || "—")}</td>

                <td>
                    <span class="status ${student.isActive ? "active" : "inactive"}">
                        ${status}
                    </span>
                </td>

                <td>
                    <div class="action-group">
                        <button class="action-button"
                            data-action="edit"
                            data-id="${student._id}">Edit</button>

                        <button class="action-button"
                            data-action="status"
                            data-id="${student._id}">
                            ${student.isActive ? "Deactivate" : "Activate"}
                        </button>

                        <button class="action-button delete"
                            data-action="delete"
                            data-id="${student._id}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function updatePagination(pagination) {
    const total = pagination.total || 0;
    const page = pagination.page || currentPage;

    const start = total ? ((page - 1) * pageLimit) + 1 : 0;
    const end = Math.min(page * pageLimit, total);

    document.getElementById("paginationInfo").textContent =
        `Showing ${start}-${end} of ${total} students`;

    document.getElementById("pageInfo").textContent =
        `Page ${page} of ${totalPages}`;

    document.getElementById("previousButton").disabled = page <= 1;
    document.getElementById("nextButton").disabled =
        page >= totalPages;
}

// Statistics for the current filter selection
function updateStatistics() {
    const active = currentStudents.filter(
        student => student.isActive
    ).length;

    const inactive = currentStudents.filter(
        student => !student.isActive
    ).length;

    document.getElementById("totalStudents").textContent =
        currentStudents.length;

    document.getElementById("activeStudents").textContent = active;
    document.getElementById("inactiveStudents").textContent = inactive;
}

// OPEN ADD MODAL
function openAddModal() {
    editingStudentId = null;
    studentForm.reset();

    document.getElementById("modalTitle").textContent =
        "Add New Student";

    document.getElementById("saveButton").textContent =
        "Save Student";

    document.getElementById("passwordGroup").style.display = "flex";

    const password = studentForm.elements.password;
    password.required = true;

    studentModal.classList.add("show");
}

// OPEN EDIT MODAL
async function openEditModal(id) {
    try {
        const response = await apiRequest(`${API}/students/${id}`);
        const student = response.data;

        editingStudentId = id;
        studentForm.reset();

        document.getElementById("modalTitle").textContent =
            "Edit Student";

        document.getElementById("saveButton").textContent =
            "Update Student";

        document.getElementById("passwordGroup").style.display = "none";

        studentForm.elements.password.required = false;

        studentForm.elements.name.value = student.name || "";
        studentForm.elements.email.value = student.email || "";
        studentForm.elements.phone.value = student.phone || "";
        studentForm.elements.admissionNumber.value =
            student.admissionNumber || "";
        studentForm.elements.rollNumber.value =
            student.rollNumber || "";

        studentForm.elements.dateOfBirth.value = student.dateOfBirth
            ? new Date(student.dateOfBirth).toISOString().split("T")[0]
            : "";

        studentForm.elements.guardianName.value =
            student.guardianName || "";

        studentForm.elements.guardianPhone.value =
            student.guardianPhone || "";

        studentForm.elements.class.value =
            student.class?._id || "";

        studentModal.classList.add("show");

    } catch (error) {
        showToast(error.message, true);
    }
}

function closeModal() {
    studentModal.classList.remove("show");
    studentForm.reset();
    editingStudentId = null;
}

// SAVE STUDENT
studentForm.addEventListener("submit", async event => {
    event.preventDefault();

    const saveButton = document.getElementById("saveButton");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const formData = new FormData(studentForm);
    const payload = {};

    for (const [key, value] of formData.entries()) {
        payload[key] = value.trim();
    }

    if (!payload.class) {
        payload.class = null;
    }

    if (editingStudentId) {
        delete payload.password;
    }

    try {
        const url = editingStudentId
            ? `${API}/students/${editingStudentId}`
            : `${API}/students`;

        const method = editingStudentId ? "PUT" : "POST";

        const response = await apiRequest(url, {
            method,
            body: JSON.stringify(payload)
        });

        showToast(response.message || "Student saved successfully.");

        closeModal();
        currentPage = 1;
        await loadStudents();

    } catch (error) {
        showToast(error.message, true);

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = editingStudentId
            ? "Update Student"
            : "Save Student";
    }
});

// TABLE ACTIONS
studentsTable.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit") {
        await openEditModal(id);
        return;
    }

    if (action === "delete") {
        const confirmed = confirm(
            "Are you sure you want to delete this student?"
        );

        if (!confirmed) return;

        try {
            const response = await apiRequest(`${API}/students/${id}`, {
                method: "DELETE"
            });

            showToast(response.message || "Student deleted.");

            if (currentStudents.length === 1 && currentPage > 1) {
                currentPage--;
            }

            await loadStudents();

        } catch (error) {
            showToast(error.message, true);
        }

        return;
    }

    if (action === "status") {
        try {
            const response = await apiRequest(
                `${API}/students/${id}/status`,
                { method: "PATCH" }
            );

            showToast(response.message || "Student status updated.");
            await loadStudents();

        } catch (error) {
            showToast(error.message, true);
        }
    }
});

// SEARCH AND FILTERS
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
        currentPage = 1;
        loadStudents();
    }, 400);
});

classFilter.addEventListener("change", () => {
    currentPage = 1;
    loadStudents();
});

statusFilter.addEventListener("change", () => {
    currentPage = 1;
    loadStudents();
});

// PAGINATION
document.getElementById("previousButton").addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        loadStudents();
    }
});

document.getElementById("nextButton").addEventListener("click", () => {
    if (currentPage < totalPages) {
        currentPage++;
        loadStudents();
    }
});

// MODAL CONTROLS
document.getElementById("addStudentButton").addEventListener(
    "click", openAddModal
);

document.getElementById("closeModalButton").addEventListener(
    "click", closeModal
);

document.getElementById("cancelButton").addEventListener(
    "click", closeModal
);

studentModal.addEventListener("click", event => {
    if (event.target === studentModal) {
        closeModal();
    }
});

// REFRESH
document.getElementById("refreshButton").addEventListener(
    "click", loadStudents
);

// MOBILE MENU
menuButton.addEventListener("click", () => {
    sidebar.classList.toggle("open");
});

// LOGOUT
logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {
        await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin"
        });
    } catch (error) {
        console.error(error);
    }

    window.location.replace("/");
});

// INITIALIZE
(async function initialize() {
    const authenticated = await checkAdmin();

    if (!authenticated) return;

    await loadClasses();
    await loadStudents();
})();
