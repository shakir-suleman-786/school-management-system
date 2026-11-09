const API = "/api";

const elements = {
    sidebar: document.getElementById("sidebar"),
    menuButton: document.getElementById("menuButton"),
    logoutButton: document.getElementById("logoutButton"),

    addButton: document.getElementById("addClassButton"),
    refreshButton: document.getElementById("refreshButton"),

    table: document.getElementById("classesTable"),
    total: document.getElementById("totalClasses"),
    active: document.getElementById("activeClasses"),
    inactive: document.getElementById("inactiveClasses"),

    search: document.getElementById("searchInput"),
    status: document.getElementById("statusFilter"),

    previous: document.getElementById("previousButton"),
    next: document.getElementById("nextButton"),
    pageInfo: document.getElementById("pageInfo"),
    paginationInfo: document.getElementById("paginationInfo"),

    modal: document.getElementById("classModal"),
    modalTitle: document.getElementById("modalTitle"),
    form: document.getElementById("classForm"),
    closeModal: document.getElementById("closeModalButton"),
    cancel: document.getElementById("cancelButton"),
    save: document.getElementById("saveButton"),

    teacher: document.getElementById("classTeacher"),
    students: document.getElementById("classStudents"),
    subjects: document.getElementById("classSubjects"),

    toast: document.getElementById("toast")
};

let currentPage = 1;
let totalPages = 1;
let editingId = null;
let searchTimer = null;
let allClasses = [];

const limit = 10;

function getArray(result, key) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.data?.[key])) return result.data[key];
    if (Array.isArray(result?.[key])) return result[key];
    return [];
}

async function request(url, options = {}) {
    const response = await fetch(`${API}${url}`, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });

    let result = {};
    try {
        result = await response.json();
    } catch {
        throw new Error("Invalid server response.");
    }

    if (!response.ok || result.success === false) {
        throw new Error(result.message || "Request failed.");
    }

    return result;
}

function showToast(message, type = "success") {
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type === "error" ? "error" : ""}`;

    setTimeout(() => {
        elements.toast.className = "toast";
    }, 3000);
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

function getSelectedValues(select) {
    return Array.from(select.selectedOptions).map(option => option.value);
}

function setSelectedValues(select, values = []) {
    const selected = new Set(values.map(value =>
        typeof value === "object" ? String(value._id) : String(value)
    ));

    Array.from(select.options).forEach(option => {
        option.selected = selected.has(option.value);
    });
}

function getTeacherId(teacher) {
    if (!teacher) return "";
    return String(typeof teacher === "object" ? teacher._id : teacher);
}

function getIdList(items = []) {
    return items.map(item =>
        typeof item === "object" ? String(item._id) : String(item)
    );
}

async function loadAssignmentOptions() {
    const [teachersResult, studentsResult, subjectsResult] = await Promise.all([
        request("/teachers?page=1&limit=100&isActive=true"),
        request("/students?page=1&limit=100&isActive=true"),
        request("/subjects?page=1&limit=100")
    ]);

    const teachers = getArray(teachersResult, "teachers");
    const students = getArray(studentsResult, "students");
    const subjects = getArray(subjectsResult, "subjects");

    elements.teacher.innerHTML =
        '<option value="">No Teacher Assigned</option>' +
        teachers.map(teacher =>
            `<option value="${escapeHTML(teacher._id)}">${escapeHTML(teacher.name)} (${escapeHTML(teacher.email || "")})</option>`
        ).join("");

    elements.students.innerHTML = students.length
        ? students.map(student =>
            `<option value="${escapeHTML(student._id)}">${escapeHTML(student.name)} — ${escapeHTML(student.admissionNumber || student.rollNumber || student.email || "")}</option>`
        ).join("")
        : '<option disabled>No active students found</option>';

    elements.subjects.innerHTML = subjects.length
        ? subjects.map(subject =>
            `<option value="${escapeHTML(subject._id)}">${escapeHTML(subject.name || subject.title || "Unnamed Subject")}</option>`
        ).join("")
        : '<option disabled>No subjects found</option>';
}

async function loadClasses() {
    elements.table.innerHTML =
        '<tr><td colspan="8" class="loading-cell">Loading classes...</td></tr>';

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit
        });

        if (elements.search.value.trim()) {
            params.set("search", elements.search.value.trim());
        }

        if (elements.status.value !== "") {
            params.set("isActive", elements.status.value);
        }

        const result = await request(`/classes?${params.toString()}`);

        const classes = getArray(result, "classes");
        allClasses = classes;

        const pagination = result.pagination || result.data?.pagination || {};

        totalPages = Math.max(1, pagination.totalPages || 1);

        renderClasses(classes);
        updatePagination(pagination);
        loadStatistics();

    } catch (error) {
        elements.table.innerHTML =
            `<tr><td colspan="8" class="empty-cell">${escapeHTML(error.message)}</td></tr>`;
        showToast(error.message, "error");
    }
}

function renderClasses(classes) {
    if (!classes.length) {
        elements.table.innerHTML =
            '<tr><td colspan="8" class="empty-cell">No classes found. Click Add New Class to create one.</td></tr>';
        return;
    }

    elements.table.innerHTML = classes.map(classItem => {
        const teacherName = classItem.classTeacher?.name || "Not Assigned";
        const studentCount = Array.isArray(classItem.students)
            ? classItem.students.length : 0;

        return `
            <tr>
                <td>
                    <span class="class-name">${escapeHTML(classItem.name)}</span>
                    <span class="sub-text">${escapeHTML(classItem.roomNumber || "No room assigned")}</span>
                </td>
                <td>${escapeHTML(classItem.section)}</td>
                <td>${escapeHTML(classItem.academicYear)}</td>
                <td>${escapeHTML(teacherName)}</td>
                <td>${studentCount}</td>
                <td>${studentCount} / ${Number(classItem.capacity || 0)}</td>
                <td>
                    <span class="status ${classItem.isActive ? "active" : "inactive"}">
                        ${classItem.isActive ? "Active" : "Inactive"}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-button" data-action="edit"
                            data-id="${escapeHTML(classItem._id)}">Edit</button>
                        <button class="action-button" data-action="status"
                            data-id="${escapeHTML(classItem._id)}">
                            ${classItem.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button class="action-button delete" data-action="delete"
                            data-id="${escapeHTML(classItem._id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

async function loadStatistics() {
    try {
        const [allResult, activeResult, inactiveResult] = await Promise.all([
            request("/classes?page=1&limit=1"),
            request("/classes?page=1&limit=1&isActive=true"),
            request("/classes?page=1&limit=1&isActive=false")
        ]);

        elements.total.textContent = allResult.pagination?.total ?? 0;
        elements.active.textContent = activeResult.pagination?.total ?? 0;
        elements.inactive.textContent = inactiveResult.pagination?.total ?? 0;
    } catch {
        // Statistics are supplementary; the table remains usable.
    }
}

function updatePagination(pagination = {}) {
    const total = pagination.total ?? allClasses.length;
    const start = total ? ((currentPage - 1) * limit) + 1 : 0;
    const end = Math.min(currentPage * limit, total);

    elements.paginationInfo.textContent =
        `Showing ${start}-${end} of ${total} classes`;

    elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    elements.previous.disabled = currentPage <= 1;
    elements.next.disabled = currentPage >= totalPages;
}

function openModal() {
    elements.modal.classList.add("show");
}

function closeModal() {
    elements.modal.classList.remove("show");
    elements.form.reset();
    editingId = null;
    elements.modalTitle.textContent = "Add New Class";
    elements.save.textContent = "Save Class";
    elements.form.elements.capacity.value = 40;
}

async function openAddModal() {
    try {
        elements.form.reset();
        editingId = null;
        elements.modalTitle.textContent = "Add New Class";
        elements.save.textContent = "Save Class";
        elements.form.elements.capacity.value = 40;

        await loadAssignmentOptions();
        openModal();
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function openEditModal(id) {
    try {
        const [result] = await Promise.all([
            request(`/classes/${id}`),
            loadAssignmentOptions()
        ]);

        const classItem = result.data?.data || result.data;

        if (!classItem?._id) {
            throw new Error("Unable to load class information.");
        }

        editingId = id;

        elements.form.elements.name.value = classItem.name || "";
        elements.form.elements.section.value = classItem.section || "";
        elements.form.elements.academicYear.value = classItem.academicYear || "";
        elements.form.elements.roomNumber.value = classItem.roomNumber || "";
        elements.form.elements.capacity.value = classItem.capacity || 40;

        elements.teacher.value = getTeacherId(classItem.classTeacher);
        setSelectedValues(elements.students, getIdList(classItem.students || []));
        setSelectedValues(elements.subjects, getIdList(classItem.subjects || []));

        elements.modalTitle.textContent = "Edit Class";
        elements.save.textContent = "Update Class";

        openModal();
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function saveClass(event) {
    event.preventDefault();

    const formData = new FormData(elements.form);

    const payload = {
        name: formData.get("name").trim(),
        section: formData.get("section").trim().toUpperCase(),
        academicYear: formData.get("academicYear").trim(),
        roomNumber: formData.get("roomNumber").trim(),
        capacity: Number(formData.get("capacity")),
        classTeacher: elements.teacher.value || null,
        students: getSelectedValues(elements.students),
        subjects: getSelectedValues(elements.subjects)
    };

    if (!payload.name || !payload.section || !payload.academicYear) {
        showToast("Please fill all required fields.", "error");
        return;
    }

    if (!Number.isInteger(payload.capacity) || payload.capacity < 1) {
        showToast("Capacity must be a positive whole number.", "error");
        return;
    }

    if (payload.students.length > payload.capacity) {
        showToast("Selected students exceed the class capacity.", "error");
        return;
    }

    elements.save.disabled = true;
    elements.save.textContent = "Saving...";

    try {
        const url = editingId ? `/classes/${editingId}` : "/classes";
        const method = editingId ? "PUT" : "POST";

        const result = await request(url, {
            method,
            body: JSON.stringify(payload)
        });

        closeModal();
        showToast(result.message || "Class saved successfully.");
        await loadClasses();

    } catch (error) {
        showToast(error.message, "error");
    } finally {
        elements.save.disabled = false;
        elements.save.textContent = editingId ? "Update Class" : "Save Class";
    }
}

async function toggleStatus(id) {
    if (!confirm("Are you sure you want to change this class status?")) return;

    try {
        const result = await request(`/classes/${id}/status`, {
            method: "PATCH"
        });

        showToast(result.message || "Class status updated.");
        await loadClasses();
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function deleteClass(id) {
    if (!confirm("Are you sure you want to delete this class? This action cannot be undone.")) {
        return;
    }

    try {
        const result = await request(`/classes/${id}`, {
            method: "DELETE"
        });

        showToast(result.message || "Class deleted successfully.");
        await loadClasses();
    } catch (error) {
        showToast(error.message, "error");
    }
}

elements.table.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "edit") openEditModal(id);
    if (action === "status") toggleStatus(id);
    if (action === "delete") deleteClass(id);
});

elements.addButton.addEventListener("click", openAddModal);
elements.refreshButton.addEventListener("click", loadClasses);
elements.form.addEventListener("submit", saveClass);

elements.closeModal.addEventListener("click", closeModal);
elements.cancel.addEventListener("click", closeModal);

elements.modal.addEventListener("click", event => {
    if (event.target === elements.modal) closeModal();
});

elements.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        currentPage = 1;
        loadClasses();
    }, 350);
});

elements.status.addEventListener("change", () => {
    currentPage = 1;
    loadClasses();
});

elements.previous.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        loadClasses();
    }
});

elements.next.addEventListener("click", () => {
    if (currentPage < totalPages) {
        currentPage++;
        loadClasses();
    }
});

elements.menuButton.addEventListener("click", () => {
    elements.sidebar.classList.toggle("open");
});

elements.logoutButton.addEventListener("click", async () => {
    try {
        await request("/auth/logout", { method: "POST" });
    } catch {
        // Redirect to login even if the logout endpoint is unavailable.
    }
    window.location.href = "/login.html";
});

loadClasses();