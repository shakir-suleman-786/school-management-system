const API = "/api";

const state = {
    page: 1,
    limit: 10,
    totalPages: 1,
    search: "",
    status: "",
    editingId: null,
    teachers: [],
    classes: []
};

const $ = (id) => document.getElementById(id);

let searchTimer;
let toastTimer;

async function request(url, options = {}) {
    const response = await fetch(url, {
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
        throw new Error(result.message || "Request failed.");
    }

    return result;
}

function showToast(message, error = false) {
    const toast = $("toast");

    toast.textContent = message;
    toast.className = error ? "toast show error" : "toast show";

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.className = "toast";
    }, 3500);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function getSubjects(result) {
    return result.data?.subjects || [];
}

function getTeachers(result) {
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.data?.teachers)) return result.data.teachers;
    return [];
}

function getClasses(result) {
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.data?.classes)) return result.data.classes;
    return [];
}

function getSelectedValues(select) {
    return Array.from(select.selectedOptions).map(option => option.value);
}

function populateTeachers(selectedId = "") {
    const select = $("subjectTeacher");

    select.innerHTML = '<option value="">No Teacher Assigned</option>';

    state.teachers.forEach(teacher => {
        const option = document.createElement("option");
        option.value = teacher._id;
        option.textContent = teacher.name || teacher.email || "Unnamed Teacher";

        if (String(teacher._id) === String(selectedId || "")) {
            option.selected = true;
        }

        select.appendChild(option);
    });
}

function populateClasses(selectedIds = []) {
    const select = $("subjectClasses");
    const selected = selectedIds.map(String);

    select.innerHTML = "";

    state.classes.forEach(classItem => {
        const option = document.createElement("option");
        option.value = classItem._id;

        const label = [
            classItem.name,
            classItem.section,
            classItem.academicYear
        ].filter(Boolean).join(" - ");

        option.textContent = label || "Unnamed Class";
        option.selected = selected.includes(String(classItem._id));

        select.appendChild(option);
    });
}

async function loadAssignmentOptions() {
    const [teachersResult, classesResult] = await Promise.all([
        request(`${API}/teachers?page=1&limit=100&isActive=true`),
        request(`${API}/classes?page=1&limit=100&isActive=true`)
    ]);

    state.teachers = getTeachers(teachersResult);
    state.classes = getClasses(classesResult);

    populateTeachers();
    populateClasses();
}

async function loadSubjects() {
    const tbody = $("subjectsTable");

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="empty-cell">Loading subjects...</td>
        </tr>
    `;

    try {
        const params = new URLSearchParams({
            page: state.page,
            limit: state.limit
        });

        if (state.search) params.set("search", state.search);
        if (state.status !== "") params.set("isActive", state.status);

        const result = await request(`${API}/subjects?${params}`);
        const subjects = getSubjects(result);

        state.totalPages = result.data?.pagination?.totalPages || 1;

        renderSubjects(subjects);
        updatePagination(result.data?.pagination || {});
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showToast(error.message, true);
    }
}

function renderSubjects(subjects) {
    const tbody = $("subjectsTable");

    if (!subjects.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    No subjects found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = subjects.map(subject => {
        const teacherName = subject.teacher?.name || "Not Assigned";

        const classNames = (subject.classes || [])
            .map(item => `${item.name || ""}${item.section ? " - " + item.section : ""}`)
            .join(", ");

        const active = subject.isActive !== false;

        return `
            <tr>
                <td>
                    <div class="subject-name">
                        ${escapeHTML(subject.name)}
                    </div>
                    <span class="subject-description">
                        ${escapeHTML(subject.description || "No description")}
                    </span>
                </td>

                <td>
                    <span class="code-badge">
                        ${escapeHTML(subject.code)}
                    </span>
                </td>

                <td>${escapeHTML(teacherName)}</td>

                <td>${escapeHTML(classNames || "Not Assigned")}</td>

                <td>
                    <span class="status-badge ${active ? "status-active" : "status-inactive"}">
                        ${active ? "Active" : "Inactive"}
                    </span>
                </td>

                <td>
                    <div class="action-group">
                        <button class="action-button edit"
                            data-action="edit"
                            data-id="${subject._id}">
                            Edit
                        </button>

                        <button class="action-button toggle"
                            data-action="toggle"
                            data-id="${subject._id}">
                            ${active ? "Deactivate" : "Activate"}
                        </button>

                        <button class="action-button delete"
                            data-action="delete"
                            data-id="${subject._id}">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function updatePagination(pagination) {
    const total = pagination.total ?? 0;
    const page = pagination.page || state.page;
    const limit = pagination.limit || state.limit;

    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    $("paginationInfo").textContent =
        `Showing ${start}-${end} of ${total} subjects`;

    $("pageInfo").textContent = `Page ${page} of ${state.totalPages}`;

    $("previousButton").disabled = page <= 1;
    $("nextButton").disabled = page >= state.totalPages;
}

async function loadStats() {
    try {
        const [allResult, activeResult, inactiveResult] = await Promise.all([
            request(`${API}/subjects?page=1&limit=1`),
            request(`${API}/subjects?page=1&limit=1&isActive=true`),
            request(`${API}/subjects?page=1&limit=1&isActive=false`)
        ]);

        $("totalSubjects").textContent =
            allResult.data?.pagination?.total ?? 0;

        $("activeSubjects").textContent =
            activeResult.data?.pagination?.total ?? 0;

        $("inactiveSubjects").textContent =
            inactiveResult.data?.pagination?.total ?? 0;

    } catch (error) {
        console.error("Stats loading failed:", error);
    }
}

function openModal() {
    $("subjectModal").classList.add("show");
}

function closeModal() {
    $("subjectModal").classList.remove("show");
    $("subjectForm").reset();

    state.editingId = null;

    $("modalTitle").textContent = "Add New Subject";
    $("saveButton").textContent = "Save Subject";

    populateTeachers();
    populateClasses();
}

async function openEditModal(id) {
    try {
        const result = await request(`${API}/subjects/${id}`);
        const subject = result.data?.subject;

        if (!subject) {
            throw new Error("Subject not found.");
        }

        state.editingId = id;

        $("subjectName").value = subject.name || "";
        $("subjectCode").value = subject.code || "";
        $("subjectDescription").value = subject.description || "";

        populateTeachers(subject.teacher?._id || subject.teacher || "");

        populateClasses(
            (subject.classes || []).map(item => item._id || item)
        );

        $("modalTitle").textContent = "Edit Subject";
        $("saveButton").textContent = "Update Subject";

        openModal();

    } catch (error) {
        showToast(error.message, true);
    }
}

async function saveSubject(event) {
    event.preventDefault();

    const name = $("subjectName").value.trim();
    const code = $("subjectCode").value.trim();

    if (!name || !code) {
        showToast("Subject name and code are required.", true);
        return;
    }

    const payload = {
        name,
        code,
        description: $("subjectDescription").value.trim(),
        teacher: $("subjectTeacher").value || null,
        classes: getSelectedValues($("subjectClasses"))
    };

    const button = $("saveButton");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        if (state.editingId) {
            await request(`${API}/subjects/${state.editingId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });

            showToast("Subject updated successfully.");
        } else {
            await request(`${API}/subjects`, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showToast("Subject created successfully.");
        }

        closeModal();
        state.page = 1;

        await Promise.all([
            loadSubjects(),
            loadStats()
        ]);

    } catch (error) {
        showToast(error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = state.editingId ? "Update Subject" : "Save Subject";
    }
}

async function toggleSubject(id) {
    if (!confirm("Are you sure you want to change this subject's status?")) {
        return;
    }

    try {
        const result = await request(`${API}/subjects/${id}/status`, {
            method: "PATCH"
        });

        showToast(result.message || "Subject status updated.");

        await Promise.all([
            loadSubjects(),
            loadStats()
        ]);

    } catch (error) {
        showToast(error.message, true);
    }
}

async function deleteSubject(id) {
    if (!confirm(
        "Are you sure you want to delete this subject? This action cannot be undone."
    )) {
        return;
    }

    try {
        const result = await request(`${API}/subjects/${id}`, {
            method: "DELETE"
        });

        showToast(result.message || "Subject deleted successfully.");

        await Promise.all([
            loadSubjects(),
            loadStats()
        ]);

    } catch (error) {
        showToast(error.message, true);
    }
}

$("subjectsTable").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit") openEditModal(id);
    if (action === "toggle") toggleSubject(id);
    if (action === "delete") deleteSubject(id);
});

$("addSubjectButton").addEventListener("click", () => {
    closeModal();
    openModal();
});

$("closeModalButton").addEventListener("click", closeModal);
$("cancelButton").addEventListener("click", closeModal);

$("subjectForm").addEventListener("submit", saveSubject);

$("refreshButton").addEventListener("click", () => {
    loadSubjects();
    loadStats();
});

$("searchInput").addEventListener("input", event => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
        state.search = event.target.value.trim();
        state.page = 1;
        loadSubjects();
    }, 350);
});

$("statusFilter").addEventListener("change", event => {
    state.status = event.target.value;
    state.page = 1;
    loadSubjects();
});

$("previousButton").addEventListener("click", () => {
    if (state.page > 1) {
        state.page--;
        loadSubjects();
    }
});

$("nextButton").addEventListener("click", () => {
    if (state.page < state.totalPages) {
        state.page++;
        loadSubjects();
    }
});

$("menuButton").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
});

$("logoutButton").addEventListener("click", async () => {
    try {
        await request(`${API}/auth/logout`, {
            method: "POST"
        });
    } catch (error) {
        console.error("Logout error:", error);
    }

    window.location.href = "/login.html";
});

async function initializePage() {
    try {
        await loadAssignmentOptions();

        await Promise.all([
            loadSubjects(),
            loadStats()
        ]);

    } catch (error) {
        showToast(error.message, true);

        $("subjectsTable").innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    Failed to load assignment options. Refresh the page.
                </td>
            </tr>
        `;
    }
}

initializePage();