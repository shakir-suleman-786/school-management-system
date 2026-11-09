
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const buttonText = document.getElementById("buttonText");
const messageBox = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");

function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = `message ${type}`;
}

togglePassword.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";
    togglePassword.textContent = isPassword ? "Hide" : "Show";
    togglePassword.setAttribute(
        "aria-label",
        isPassword ? "Hide password" : "Show password"
    );
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    messageBox.className = "message";

    loginButton.disabled = true;
    buttonText.textContent = "Signing in...";

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                email: emailInput.value.trim(),
                password: passwordInput.value
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Login failed.");
        }

        if (!data.user || data.user.role !== "admin") {
            await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin"
            });

            throw new Error("Access denied. Only administrators can access this portal.");
        }

        showMessage("Login successful. Redirecting...", "success");

        window.location.href = "/admin-dashboard.html";

    } catch (error) {
        showMessage(error.message);

        loginButton.disabled = false;
        buttonText.textContent = "Sign In to Dashboard";
    }
});
