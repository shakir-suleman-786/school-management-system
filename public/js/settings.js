
document.addEventListener("DOMContentLoaded", async () => {
    const API = "/api/settings";

    const fields = {
        schoolName: document.getElementById("schoolName"),
        schoolAddress: document.getElementById("schoolAddress"),
        schoolPhone: document.getElementById("schoolPhone"),
        schoolEmail: document.getElementById("schoolEmail")
    };

    const form = document.getElementById("settingsForm");
    const saveBtn = document.getElementById("saveSettingsBtn");
    const logoInput = document.getElementById("logoInput");
    const uploadBtn = document.getElementById("uploadLogoBtn");
    const deleteBtn = document.getElementById("deleteLogoBtn");
    const logoImage = document.getElementById("logoImage");
    const logoPlaceholder = document.getElementById("logoPlaceholder");
    const logoStatus = document.getElementById("logoStatus");
    const selectedFileName = document.getElementById("selectedFileName");
    const toast = document.getElementById("toast");

    let currentLogo = null;
    let userRole = null;

    function showToast(message, isError = false) {
        toast.textContent = message;
        toast.classList.toggle("error", isError);
        toast.classList.add("show");

        setTimeout(() => toast.classList.remove("show"), 3500);
    }

    async function request(url, options = {}) {
        const headers = { ...(options.headers || {}) };

        if (!(options.body instanceof FormData)) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(url, {
            ...options,
            credentials: "include",
            headers
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    function formatDate(value) {
        if (!value) return "Not available";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? "Not available"
            : date.toLocaleString();
    }

    function configurePermissions() {
        document.getElementById("userRole").textContent =
            userRole || "Unknown";

        const isAdmin = userRole === "admin";

        Object.values(fields).forEach(field => {
            field.readOnly = !isAdmin;
        });

        saveBtn.hidden = !isAdmin;
        logoInput.disabled = !isAdmin;
        uploadBtn.hidden = !isAdmin;
        deleteBtn.hidden = !isAdmin;

        document.querySelector(".upload-label").hidden = !isAdmin;
    }

    function setLogo(logo) {
        currentLogo = logo?.filename ? logo : null;

        if (!currentLogo) {
            logoImage.removeAttribute("src");
            logoImage.hidden = true;
            logoPlaceholder.hidden = false;
            logoStatus.textContent = "No logo uploaded";
            deleteBtn.hidden = true;
            return;
        }

        const url = logo.url || logo.path;

        if (!url) {
            setLogo(null);
            return;
        }

        logoImage.onerror = () => {
            logoImage.hidden = true;
            logoPlaceholder.hidden = false;
            logoStatus.textContent = "Logo file could not be loaded";
        };

        logoImage.onload = () => {
            logoImage.hidden = false;
            logoPlaceholder.hidden = true;
            logoStatus.textContent = "Logo uploaded";
        };

        logoImage.src =
            `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

        deleteBtn.hidden = userRole !== "admin";
    }

    async function loadSettings() {
        const result = await request(API);
        const settings = result.data || {};

        fields.schoolName.value = settings.schoolName || "";
        fields.schoolAddress.value = settings.schoolAddress || "";
        fields.schoolPhone.value = settings.schoolPhone || "";
        fields.schoolEmail.value = settings.schoolEmail || "";

        setLogo(settings.logo);

        document.getElementById("settingsRecord").textContent =
            settings.key || "School";

        document.getElementById("updatedAt").textContent =
            formatDate(settings.updatedAt);
    }

    async function saveSettings(event) {
        event.preventDefault();

        if (userRole !== "admin") {
            showToast("Only administrators can update settings.", true);
            return;
        }

        const payload = {
            schoolName: fields.schoolName.value.trim(),
            schoolAddress: fields.schoolAddress.value.trim(),
            schoolPhone: fields.schoolPhone.value.trim(),
            schoolEmail: fields.schoolEmail.value.trim()
        };

        if (!payload.schoolName) {
            showToast("School name is required.", true);
            fields.schoolName.focus();
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            await request(API, {
                method: "PUT",
                body: JSON.stringify(payload)
            });

            await loadSettings();
            showToast("School information updated successfully.");
        } catch (error) {
            showToast(error.message, true);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
        }
    }

    function validateLogo(file) {
        if (!file) {
            showToast("Please select a logo image.", true);
            return false;
        }

        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            showToast("Only PNG, JPG, JPEG and WEBP images are allowed.", true);
            return false;
        }

        if (file.size > 2 * 1024 * 1024) {
            showToast("Logo size cannot exceed 2 MB.", true);
            return false;
        }

        return true;
    }

    async function uploadLogo() {
        if (userRole !== "admin") return;

        const file = logoInput.files[0];

        if (!validateLogo(file)) return;

        const formData = new FormData();
        formData.append("logo", file);

        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading...";

        try {
            await request(`${API}/logo`, {
                method: "POST",
                body: formData
            });

            logoInput.value = "";
            selectedFileName.textContent = "";

            await loadSettings();

            showToast("School logo uploaded successfully.");
        } catch (error) {
            showToast(error.message, true);
        } finally {
            uploadBtn.disabled = true;
            uploadBtn.textContent = "Upload Logo";
        }
    }

    async function deleteLogo() {
        if (userRole !== "admin" || !currentLogo) return;

        if (!confirm("Are you sure you want to remove the school logo?")) {
            return;
        }

        deleteBtn.disabled = true;

        try {
            await request(`${API}/logo`, {
                method: "DELETE"
            });

            setLogo(null);
            showToast("School logo removed successfully.");
        } catch (error) {
            showToast(error.message, true);
        } finally {
            deleteBtn.disabled = false;
        }
    }

    logoInput.addEventListener("change", () => {
        const file = logoInput.files[0];

        if (!file) {
            selectedFileName.textContent = "";
            uploadBtn.disabled = true;
            return;
        }

        if (!validateLogo(file)) {
            logoInput.value = "";
            selectedFileName.textContent = "";
            uploadBtn.disabled = true;
            return;
        }

        selectedFileName.textContent = `Selected: ${file.name}`;
        uploadBtn.disabled = false;
    });

    form.addEventListener("submit", saveSettings);
    uploadBtn.addEventListener("click", uploadLogo);
    deleteBtn.addEventListener("click", deleteLogo);

    try {
        // Get the actual logged-in user from the authentication cookie.
        const authResult = await request("/api/auth/me");

        if (!authResult.user) {
            throw new Error("Unable to identify logged-in user.");
        }

        userRole = authResult.user.role;

        configurePermissions();

        await loadSettings();

    } catch (error) {
        userRole = null;
        configurePermissions();

        showToast(error.message || "Please log in again.", true);
    }
});
