document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("newBranchForm");
    const branchNameInput = document.getElementById("branchName");
    const branchLocationInput = document.getElementById("branchLocation");
    const branchPhoneInput = document.getElementById("branchPhone");
    const createBranchBtn = document.getElementById("createBranchBtn");
    const clearBranchFormBtn = document.getElementById("clearBranchFormBtn");
    const branchMessage = document.getElementById("branchMessage");
    const branchesContainer = document.getElementById("branchesContainer");

    if (!form) {
        return;
    }

    function showMessage(message, type = "error") {
        if (!branchMessage) {
            return;
        }

        branchMessage.textContent = message;
        branchMessage.className = `branch-message ${type}`;
        branchMessage.removeAttribute("hidden");
    }

    function clearMessage() {
        if (!branchMessage) {
            return;
        }

        branchMessage.textContent = "";
        branchMessage.className = "branch-message";
        branchMessage.setAttribute("hidden", "hidden");
    }

    function setButtonLoading(isLoading) {
        if (!createBranchBtn) {
            return;
        }

        if (isLoading) {
            createBranchBtn.disabled = true;
            createBranchBtn.dataset.originalText =
                createBranchBtn.innerHTML;

            createBranchBtn.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Creating Branch...
            `;
        } else {
            createBranchBtn.disabled = false;

            createBranchBtn.innerHTML =
                createBranchBtn.dataset.originalText ||
                `
                    <i class="fa-solid fa-plus"></i>
                    Create Branch
                `;
        }
    }

    function clearForm() {
        form.reset();
        clearMessage();
        branchNameInput?.focus();
    }

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value ?? "";
        return div.innerHTML;
    }

    function renderBranches(branches) {
        if (!branchesContainer) {
            return;
        }

        if (!Array.isArray(branches) || branches.length === 0) {
            branchesContainer.innerHTML = `
                <div id="emptyBranchesState" class="empty-branches-state">
                    <div class="empty-state-icon">
                        <i class="fa-solid fa-code-branch"></i>
                    </div>

                    <h3>No Additional Branches</h3>

                    <p>
                        Create a new branch using the form to get started.
                    </p>
                </div>
            `;

            return;
        }

        branchesContainer.innerHTML = branches
            .map(branch => {
                const branchName =
                    escapeHtml(branch.branch_name);

                const location =
                    escapeHtml(branch.location);

                const phone =
                    escapeHtml(branch.phone);

                const branchId =
                    escapeHtml(branch.branch_id);

                const isActive =
                    Number(branch.is_active) === 1;

                return `
                    <div
                        class="branch-item"
                        data-branch-id="${branchId}"
                    >
                        <div class="branch-item-icon">
                            <i class="fa-solid fa-code-branch"></i>
                        </div>

                        <div class="branch-item-content">
                            <h3>${branchName}</h3>

                            ${
                                location
                                    ? `
                                        <p>
                                            <i class="fa-solid fa-location-dot"></i>
                                            ${location}
                                        </p>
                                    `
                                    : ""
                            }

                            ${
                                phone
                                    ? `
                                        <p>
                                            <i class="fa-solid fa-phone"></i>
                                            ${phone}
                                        </p>
                                    `
                                    : ""
                            }
                        </div>

                        <div class="branch-item-status">
                            ${
                                isActive
                                    ? `
                                        <span class="active-status">
                                            <i class="fa-solid fa-circle"></i>
                                            Active
                                        </span>
                                    `
                                    : `
                                        <span class="inactive-status">
                                            <i class="fa-solid fa-circle"></i>
                                            Inactive
                                        </span>
                                    `
                            }
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    async function loadBranches() {
        try {
            const response = await fetch(
                "/branches/list",
                {
                    method: "GET",
                    headers: {
                        Accept: "application/json"
                    },
                    credentials: "same-origin"
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message ||
                    "Unable to load branches."
                );
            }

            renderBranches(data.branches);
        } catch (error) {
            console.error(
                "Load branches error:",
                error
            );

            showMessage(
                error.message ||
                "Unable to load branches.",
                "error"
            );
        }
    }

    async function createBranch(event) {
        event.preventDefault();

        clearMessage();

        const branchName =
            branchNameInput?.value.trim() || "";

        const branchLocation =
            branchLocationInput?.value.trim() || "";

        const branchPhone =
            branchPhoneInput?.value.trim() || "";

        if (!branchName) {
            showMessage(
                "Please enter a branch name.",
                "error"
            );

            branchNameInput?.focus();
            return;
        }

        if (branchName.length > 150) {
            showMessage(
                "Branch name cannot exceed 150 characters.",
                "error"
            );

            branchNameInput?.focus();
            return;
        }

        if (branchLocation.length > 255) {
            showMessage(
                "Branch location cannot exceed 255 characters.",
                "error"
            );

            branchLocationInput?.focus();
            return;
        }

        if (branchPhone.length > 50) {
            showMessage(
                "Branch phone cannot exceed 50 characters.",
                "error"
            );

            branchPhoneInput?.focus();
            return;
        }

        setButtonLoading(true);

        try {
            const response = await fetch(
                "/branches",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json"
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        branch_name: branchName,
                        branch_location: branchLocation,
                        branch_phone: branchPhone
                    })
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message ||
                    "Unable to create branch."
                );
            }

            showMessage(
                data.message ||
                "Branch created successfully.",
                "success"
            );

            form.reset();

            await loadBranches();

            branchNameInput?.focus();
        } catch (error) {
            console.error(
                "Create branch error:",
                error
            );

            if (error.message) {
                showMessage(
                    error.message,
                    "error"
                );
            } else {
                showMessage(
                    "An unexpected error occurred while creating the branch.",
                    "error"
                );
            }
        } finally {
            setButtonLoading(false);
        }
    }

    form.addEventListener(
        "submit",
        createBranch
    );

    clearBranchFormBtn?.addEventListener(
        "click",
        clearForm
    );

    branchNameInput?.addEventListener(
        "input",
        clearMessage
    );

    branchLocationInput?.addEventListener(
        "input",
        clearMessage
    );

    branchPhoneInput?.addEventListener(
        "input",
        clearMessage
    );

    loadBranches();
});