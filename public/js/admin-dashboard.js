
const sidebar = document.getElementById("sidebar");
const menuButton = document.getElementById("menuButton");
const closeSidebar = document.getElementById("closeSidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const logoutButton = document.getElementById("logoutButton");
const refreshButton = document.getElementById("refreshButton");

const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? "";
};

const getInitial = (name) => {
    return String(name || "A").trim().charAt(0).toUpperCase();
};

function setAvatar(name) {
    const initial = getInitial(name);
    setText("sidebarAvatar", initial);
    setText("topAvatar", initial);
}

function setLogo(logoUrl) {
    if (!logoUrl) return;

    const sidebarLogo = document.getElementById("sidebarLogo");
    const welcomeLogo = document.getElementById("welcomeLogo");

    sidebarLogo.src = logoUrl;
    welcomeLogo.src = logoUrl;

    sidebarLogo.hidden = false;
    welcomeLogo.hidden = false;

    document.getElementById("sidebarLogoFallback").hidden = true;
    document.getElementById("welcomeLogoFallback").hidden = true;

    sidebarLogo.onerror = () => {
        sidebarLogo.hidden = true;
        document.getElementById("sidebarLogoFallback").hidden = false;
    };

    welcomeLogo.onerror = () => {
        welcomeLogo.hidden = true;
        document.getElementById("welcomeLogoFallback").hidden = false;
    };
}

function showSidebar() {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("show");
}

function hideSidebar() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
}

menuButton.addEventListener("click", showSidebar);
closeSidebar.addEventListener("click", hideSidebar);
sidebarOverlay.addEventListener("click", hideSidebar);

document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", hideSidebar);
});

function setCurrentDate() {
    const now = new Date();

    setText(
        "currentDate",
        now.toLocaleDateString("en-US", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        })
    );

    setText("currentYear", now.getFullYear());
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.headers || {})
        }
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("The server returned an invalid response.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || `Request failed (${response.status}).`);
    }

    return data;
}

async function loadAdminProfile() {
    const response = await fetchJSON("/api/auth/me");

    if (!response.user || response.user.role !== "admin") {
        window.location.replace("/");
        return;
    }

    const user = response.user;
    const name = user.name || "Administrator";

    setText("welcomeName", name);
    setText("sidebarName", name);
    setText("topName", name);
    setAvatar(name);
}

async function loadSchoolSettings() {
    try {
        const response = await fetchJSON("/api/settings");
        const settings = response.data || {};

        const schoolName = settings.schoolName || "School Management";

        setText("sidebarSchoolName", schoolName);
        setText("footerSchoolName", schoolName);

        if (settings.logo && settings.logo.url) {
            setLogo(settings.logo.url);
        }
    } catch (error) {
        console.error("School settings could not be loaded:", error);
    }
}

async function loadDashboardStatistics() {
    const status = document.getElementById("dataStatus");

    try {
        const response = await fetchJSON("/api/dashboard/overview");
        const statistics = response.data?.statistics || {};

        setText("totalStudents", statistics.totalStudents ?? 0);
        setText("totalTeachers", statistics.totalTeachers ?? 0);
        setText("totalClasses", statistics.totalClasses ?? 0);
        setText("totalSubjects", statistics.totalSubjects ?? 0);
        setText("totalAttendance", statistics.totalAttendance ?? 0);
        setText("totalAssignments", statistics.totalAssignments ?? 0);
        setText("totalSubmissions", statistics.totalSubmissions ?? 0);
        setText("totalAssessments", statistics.totalAssessments ?? 0);

        status.textContent = "Dashboard information updated successfully.";
    } catch (error) {
        console.error("Dashboard statistics error:", error);
        status.textContent = "Could not load dashboard statistics. Please refresh.";
    }
}

function createStudentRow(student) {
    const row = document.createElement("tr");

    const studentCell = document.createElement("td");
    const studentWrapper = document.createElement("div");
    studentWrapper.className = "student-cell";

    const avatar = document.createElement("div");
    avatar.className = "student-avatar";
    avatar.textContent = getInitial(student.name);

    const studentName = document.createElement("strong");
    studentName.textContent = student.name || "Unnamed Student";

    const nameWrapper = document.createElement("div");
    nameWrapper.appendChild(studentName);

    studentWrapper.append(avatar, nameWrapper);
    studentCell.appendChild(studentWrapper);

    const admissionCell = document.createElement("td");
    admissionCell.textContent = student.admissionNumber || "—";

    const emailCell = document.createElement("td");
    emailCell.textContent = student.email || "—";

    const classCell = document.createElement("td");
    classCell.textContent =
        student.class?.name
            ? `${student.class.name}${student.class.section ? ` - ${student.class.section}` : ""}`
            : "—";

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = student.isActive ? "status-active" : "status-active";
    status.textContent = student.isActive ? "Active" : "Inactive";
    statusCell.appendChild(status);

    row.append(
        studentCell,
        admissionCell,
        emailCell,
        classCell,
        statusCell
    );

    return row;
}

async function loadRecentStudents() {
    const tableBody = document.getElementById("recentStudentsBody");

    try {
        const response = await fetchJSON("/api/dashboard/overview");
        const students = response.data?.recentStudents || [];

        tableBody.replaceChildren();

        if (!students.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 5;
            cell.className = "empty-state";
            cell.textContent = "No students registered yet.";

            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }

        students.forEach((student) => {
            tableBody.appendChild(createStudentRow(student));
        });
    } catch (error) {
        console.error("Recent students error:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    Unable to load recent students.
                </td>
            </tr>
        `;
    }
}

async function loadDashboard() {
    refreshButton.disabled = true;
    refreshButton.textContent = "Loading...";

    await Promise.all([
        loadDashboardStatistics(),
        loadRecentStudents(),
        loadSchoolSettings()
    ]);

    refreshButton.disabled = false;
    refreshButton.textContent = "↻ Refresh Data";
}

refreshButton.addEventListener("click", loadDashboard);

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing out...";

    try {
        await fetchJSON("/api/auth/logout", {
            method: "POST"
        });
    } catch (error) {
        console.error("Logout error:", error);
    }

    window.location.replace("/");
});

async function initializeDashboard() {
    setCurrentDate();

    try {
        await loadAdminProfile();
        await loadDashboard();
    } catch (error) {
        console.error("Dashboard initialization error:", error);
        window.location.replace("/");
    }
}

initializeDashboard();
