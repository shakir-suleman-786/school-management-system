
document.addEventListener("DOMContentLoaded", () => {
    const API = "/api/notices";

    const elements = {
        noticeList: document.getElementById("noticeList"),
        total: document.getElementById("totalNotices"),
        published: document.getElementById("publishedNotices"),
        drafts: document.getElementById("draftNotices"),
        role: document.getElementById("userRole"),
        addBtn: document.getElementById("addNoticeBtn"),
        modal: document.getElementById("noticeModal"),
        form: document.getElementById("noticeForm"),
        modalTitle: document.getElementById("modalTitle"),
        noticeId: document.getElementById("noticeId"),
        title: document.getElementById("title"),
        content: document.getElementById("content"),
        audience: document.getElementById("audience"),
        classGroup: document.getElementById("classGroup"),
        targetClasses: document.getElementById("targetClasses"),
        expiresAt: document.getElementById("expiresAt"),
        publish: document.getElementById("publishImmediately"),
        search: document.getElementById("searchInput"),
        audienceFilter: document.getElementById("audienceFilter"),
        statusFilter: document.getElementById("statusFilter"),
        previous: document.getElementById("previousPage"),
        next: document.getElementById("nextPage"),
        pageInfo: document.getElementById("pageInfo"),
        saveBtn: document.getElementById("saveNoticeBtn"),
        toast: document.getElementById("toast")
    };

    let currentPage = 1;
    let totalPages = 1;
    let notices = [];
    let currentRole = "student";
    let searchTimer;

    function getUser() {
        for (const key of ["user", "currentUser", "schoolUser"]) {
            try {
                const value = JSON.parse(localStorage.getItem(key));
                if (value) return value.user || value;
            } catch (_) {}
        }
        return {};
    }

    currentRole = getUser().role || "student";
    elements.role.textContent = currentRole;

    if (currentRole !== "admin") {
        elements.addBtn.hidden = true;
        document.querySelector(".notice-stats").hidden = true;
        document.querySelector(".filters").style.display = "none";
    }

    async function request(url, options = {}) {
        const response = await fetch(url, {
            credentials: "include",
            ...options,
            headers: {
                ...(options.body instanceof FormData
                    ? {}
                    : { "Content-Type": "application/json" }),
                ...(options.headers || {})
            }
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Something went wrong.");
        }

        return result;
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

    function showToast(message, isError = false) {
        elements.toast.textContent = message;
        elements.toast.classList.toggle("error", isError);
        elements.toast.classList.add("show");

        setTimeout(() => elements.toast.classList.remove("show"), 3000);
    }

    function formatDate(value) {
        if (!value) return "No expiry";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "No expiry"
            : date.toLocaleString();
    }

    function getAudienceLabel(notice) {
        const labels = {
            all: "Everyone",
            students: "Students",
            teachers: "Teachers",
            specific_class: "Specific Classes"
        };

        let label = labels[notice.audience] || notice.audience;

        if (notice.audience === "specific_class") {
            const classes = (notice.targetClasses || [])
                .map(item => {
                    if (typeof item === "string") return item;
                    return `${item.name || ""} ${item.section || ""}`.trim();
                })
                .join(", ");

            if (classes) label += `: ${classes}`;
        }

        return label;
    }

    function updateStats() {
        elements.total.textContent = notices.length;
        elements.published.textContent =
            notices.filter(item => item.isPublished).length;
        elements.drafts.textContent =
            notices.filter(item => !item.isPublished).length;
    }

    function renderNotices() {
        if (!notices.length) {
            elements.noticeList.innerHTML =
                `<div class="empty-state">No notices found.</div>`;
            updateStats();
            return;
        }

        elements.noticeList.innerHTML = notices.map(notice => {
            const published = notice.isPublished;

            return `
                <article class="notice-card">
                    <div class="notice-top">
                        <div>
                            <h3>${escapeHTML(notice.title)}</h3>
                            <div class="notice-meta">
                                <span>${escapeHTML(getAudienceLabel(notice))}</span>
                                <span>Created: ${formatDate(notice.createdAt)}</span>
                                <span>Expires: ${formatDate(notice.expiresAt)}</span>
                            </div>
                        </div>
                        <span class="notice-status ${published
                            ? "status-published" : "status-draft"}">
                            ${published ? "Published" : "Draft"}
                        </span>
                    </div>

                    <div class="notice-content">${escapeHTML(notice.content)}</div>

                    ${currentRole === "admin" ? `
                        <div class="notice-actions">
                            <button class="action-btn edit-btn"
                                data-action="edit" data-id="${notice._id}">
                                Edit
                            </button>
                            <button class="action-btn ${published
                                ? "unpublish-btn" : "publish-btn"}"
                                data-action="publish" data-id="${notice._id}">
                                ${published ? "Unpublish" : "Publish"}
                            </button>
                            <button class="action-btn delete-btn"
                                data-action="delete" data-id="${notice._id}">
                                Delete
                            </button>
                        </div>
                    ` : ""}
                </article>
            `;
        }).join("");

        updateStats();
    }

    async function loadNotices() {
        elements.noticeList.innerHTML =
            `<div class="loading-state">Loading notices...</div>`;

        try {
            const params = new URLSearchParams({
                page: currentPage,
                limit: 20
            });

            if (currentRole === "admin") {
                if (elements.search.value.trim()) {
                    params.set("search", elements.search.value.trim());
                }

                if (elements.audienceFilter.value) {
                    params.set("audience", elements.audienceFilter.value);
                }
            }

            const result = await request(`${API}?${params.toString()}`);

            notices = Array.isArray(result.data) ? result.data : [];

            if (currentRole === "admin" && elements.statusFilter.value) {
                const published = elements.statusFilter.value === "published";
                notices = notices.filter(item => item.isPublished === published);
            }

            totalPages = result.pagination?.pages || 1;

            elements.pageInfo.textContent =
                `Page ${currentPage} of ${totalPages}`;

            elements.previous.disabled = currentPage <= 1;
            elements.next.disabled = currentPage >= totalPages;

            renderNotices();
        } catch (error) {
            elements.noticeList.innerHTML =
                `<div class="empty-state">${escapeHTML(error.message)}</div>`;
            showToast(error.message, true);
        }
    }

    async function loadClasses() {
        try {
            const result = await request("/api/classes");
            const classes = Array.isArray(result.data)
                ? result.data
                : result.data?.classes || result.classes || [];

            elements.targetClasses.innerHTML = classes.map(item => {
                const id = item._id || item.id;
                const name = `${item.name || "Class"} ${item.section || ""}`.trim();

                return `<option value="${escapeHTML(id)}">${escapeHTML(name)}</option>`;
            }).join("");
        } catch (error) {
            elements.targetClasses.innerHTML = "";
            console.error("Unable to load classes:", error);
        }
    }

    function openModal(notice = null) {
        elements.form.reset();
        elements.noticeId.value = "";
        elements.modalTitle.textContent = notice ? "Edit Notice" : "Create Notice";
        elements.saveBtn.textContent = notice ? "Update Notice" : "Save Notice";

        if (notice) {
            elements.noticeId.value = notice._id;
            elements.title.value = notice.title || "";
            elements.content.value = notice.content || "";
            elements.audience.value = notice.audience || "all";
            elements.publish.checked = Boolean(notice.isPublished);

            if (notice.expiresAt) {
                const date = new Date(notice.expiresAt);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                elements.expiresAt.value = date.toISOString().slice(0, 16);
            }

            const selectedIds = (notice.targetClasses || []).map(item =>
                String(item._id || item)
            );

            Array.from(elements.targetClasses.options).forEach(option => {
                option.selected = selectedIds.includes(option.value);
            });
        }

        updateClassVisibility();
        elements.modal.classList.add("show");
    }

    function closeModal() {
        elements.modal.classList.remove("show");
    }

    function updateClassVisibility() {
        elements.classGroup.hidden =
            elements.audience.value !== "specific_class";
    }

    async function saveNotice(event) {
        event.preventDefault();

        const id = elements.noticeId.value;
        const audience = elements.audience.value;

        const targetClasses = Array.from(elements.targetClasses.selectedOptions)
            .map(option => option.value);

        if (audience === "specific_class" && !targetClasses.length) {
            showToast("Please select at least one class.", true);
            return;
        }

        const payload = {
            title: elements.title.value.trim(),
            content: elements.content.value.trim(),
            audience,
            targetClasses: audience === "specific_class" ? targetClasses : [],
            expiresAt: elements.expiresAt.value
                ? new Date(elements.expiresAt.value).toISOString()
                : null
        };

        if (!id) {
            payload.isPublished = elements.publish.checked;
        }

        elements.saveBtn.disabled = true;
        elements.saveBtn.textContent = "Saving...";

        try {
            await request(id ? `${API}/${id}` : API, {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(payload)
            });

            closeModal();
            showToast(id ? "Notice updated successfully." : "Notice created successfully.");
            await loadNotices();
        } catch (error) {
            showToast(error.message, true);
        } finally {
            elements.saveBtn.disabled = false;
            elements.saveBtn.textContent = id ? "Update Notice" : "Save Notice";
        }
    }

    async function handleNoticeAction(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;
        const notice = notices.find(item => item._id === id);

        if (!notice) return;

        try {
            if (action === "edit") {
                openModal(notice);
                return;
            }

            if (action === "publish") {
                await request(`${API}/${id}/publish`, { method: "PATCH" });
                showToast(notice.isPublished
                    ? "Notice unpublished successfully."
                    : "Notice published successfully.");
            }

            if (action === "delete") {
                if (!confirm("Are you sure you want to delete this notice?")) {
                    return;
                }

                await request(`${API}/${id}`, { method: "DELETE" });
                showToast("Notice deleted successfully.");
            }

            await loadNotices();
        } catch (error) {
            showToast(error.message, true);
        }
    }

    elements.addBtn.addEventListener("click", () => openModal());
    document.getElementById("closeModalBtn").addEventListener("click", closeModal);
    document.getElementById("cancelBtn").addEventListener("click", closeModal);
    elements.form.addEventListener("submit", saveNotice);
    elements.audience.addEventListener("change", updateClassVisibility);
    elements.noticeList.addEventListener("click", handleNoticeAction);

    elements.previous.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            loadNotices();
        }
    });

    elements.next.addEventListener("click", () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadNotices();
        }
    });

    elements.search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentPage = 1;
            loadNotices();
        }, 350);
    });

    elements.audienceFilter.addEventListener("change", () => {
        currentPage = 1;
        loadNotices();
    });

    elements.statusFilter.addEventListener("change", () => {
        currentPage = 1;
        loadNotices();
    });

    elements.modal.addEventListener("click", event => {
        if (event.target === elements.modal) closeModal();
    });

    if (currentRole === "admin") {
        loadClasses();
    }

    loadNotices();
});
