const myProfileBtn = document.getElementById("myProfileBtn");

const profileModalElement = document.getElementById("profileModal");
const profileModal = new bootstrap.Modal(profileModalElement);

const profileView = document.getElementById("profileView");
const editProfileForm = document.getElementById("editProfileForm");

const editProfileBtn = document.getElementById("editProfileBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");

let currentProfile = null;


// OPEN PROFILE
myProfileBtn.addEventListener("click", async function (e) {

    e.preventDefault();

    profileModal.show();

    await loadProfile();
});


// LOAD PROFILE
async function loadProfile() {

    try {

        const response = await fetch("/auth/profile");

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load profile.");
        }

        currentProfile = data.user;

        displayProfile(currentProfile);

    } catch (error) {

        console.error(error);

        alert(error.message);
    }
}


// DISPLAY PROFILE
function displayProfile(user) {

    document.getElementById("profileInitials").textContent =
        `${user.FirstName.charAt(0)}${user.LastName.charAt(0)}`.toUpperCase();

    document.getElementById("profileName").textContent =
        `${user.FirstName} ${user.LastName}`;

    document.getElementById("profileJobTitle").textContent =
        user.JobTitle || "No job title";

    document.getElementById("profileFirstName").textContent =
        user.FirstName;

    document.getElementById("profileLastName").textContent =
        user.LastName;

    document.getElementById("profileEmail").textContent =
        user.Email;

    document.getElementById("profilePhone").textContent =
        user.Phone || "Not provided";

    document.getElementById("profileBusiness").textContent =
        user.Business_name || "Not provided";

    document.getElementById("profileLocation").textContent =
        user.Business_location || "Not provided";

    document.getElementById("profileJob").textContent =
        user.JobTitle || "Not provided";

    document.getElementById("profileRole").textContent =
        user.RoleName || "Not assigned";

    document.getElementById("profileUserId").textContent =
        user.UserID;

    document.getElementById("profileAccountStatus").textContent =
        user.IsActive ? "Active" : "Inactive";

    document.getElementById("profileCreatedAt").textContent =
        formatDate(user.CreatedAt);

    document.getElementById("profileUpdatedAt").textContent =
        formatDate(user.UpdatedAt);

    const status = document.getElementById("profileStatus");

    status.textContent = user.IsActive ? "Active" : "Inactive";

    status.className =
        user.IsActive
            ? "badge bg-success"
            : "badge bg-secondary";
}


// EDIT BUTTON
editProfileBtn.addEventListener("click", function () {

    if (!currentProfile) return;

    document.getElementById("editFirstName").value =
        currentProfile.FirstName;

    document.getElementById("editLastName").value =
        currentProfile.LastName;

    document.getElementById("editEmail").value =
        currentProfile.Email;

    document.getElementById("editPhone").value =
        currentProfile.Phone || "";

    profileView.classList.add("d-none");
    editProfileForm.classList.remove("d-none");

    editProfileBtn.classList.add("d-none");
    cancelEditBtn.classList.remove("d-none");
    saveProfileBtn.classList.remove("d-none");
});


// CANCEL EDIT
cancelEditBtn.addEventListener("click", function () {

    editProfileForm.classList.add("d-none");
    profileView.classList.remove("d-none");

    editProfileBtn.classList.remove("d-none");
    cancelEditBtn.classList.add("d-none");
    saveProfileBtn.classList.add("d-none");
});


// SAVE PROFILE
editProfileForm.addEventListener("submit", async function (e) {

    e.preventDefault();

    const firstName =
        document.getElementById("editFirstName").value.trim();

    const lastName =
        document.getElementById("editLastName").value.trim();

    const email =
        document.getElementById("editEmail").value.trim();

    const phone =
        document.getElementById("editPhone").value.trim();

    try {

        saveProfileBtn.disabled = true;
        saveProfileBtn.textContent = "Saving...";

        const response = await fetch("/auth/profileedit", {

            method: "PUT",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                firstName,
                lastName,
                email,
                phone
            })

        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to update profile.");
        }

        currentProfile = data.user;

        displayProfile(currentProfile);

        editProfileForm.classList.add("d-none");
        profileView.classList.remove("d-none");

        editProfileBtn.classList.remove("d-none");
        cancelEditBtn.classList.add("d-none");
        saveProfileBtn.classList.add("d-none");

    } catch (error) {

        console.error(error);

        alert(error.message);

    } finally {

        saveProfileBtn.disabled = false;

        saveProfileBtn.innerHTML =
            `<i class="fa-regular fa-floppy-disk"></i> Save Changes`;
    }
});


function formatDate(date) {

    if (!date) return "Not available";

    return new Date(date).toLocaleString();
}




// =========================================
// CHANGE PASSWORD
// =========================================



const changePasswordModal =
    document.getElementById("changePasswordModal");

const openChangePasswordModal =
    document.getElementById("openChangePasswordModal");

const closeChangePasswordModal =
    document.getElementById("closeChangePasswordModal");

const cancelChangePassword =
    document.getElementById("cancelChangePassword");

const changePasswordForm =
    document.getElementById("changePasswordForm");

const changePasswordMessage =
    document.getElementById("changePasswordMessage");

const changePasswordButton =
    document.getElementById("changePasswordButton");


// =========================================
// OPEN CHANGE PASSWORD MODAL
// =========================================

openChangePasswordModal.addEventListener("click", function (e) {

    e.preventDefault();

    changePasswordModal.classList.add("show");

});


// =========================================
// CLOSE CHANGE PASSWORD MODAL
// =========================================

closeChangePasswordModal.addEventListener("click", function () {

    changePasswordModal.classList.remove("show");

});


cancelChangePassword.addEventListener("click", function () {

    changePasswordModal.classList.remove("show");

});


// =========================================
// CHANGE PASSWORD FORM SUBMISSION
// =========================================

changePasswordForm.addEventListener("submit", async function (e) {

    e.preventDefault();


    // =========================================
    // GET FORM VALUES
    // =========================================

    const currentPassword =
        document.getElementById("currentPassword").value.trim();

    const newPassword =
        document.getElementById("newPassword").value.trim();

    const confirmPassword =
        document.getElementById("confirmPassword").value.trim();


    // =========================================
    // CLEAR PREVIOUS MESSAGE
    // =========================================

    changePasswordMessage.className =
        "change-password-message";

    changePasswordMessage.textContent = "";


    // =========================================
    // CHECK PASSWORD MATCH
    // =========================================

    if (newPassword !== confirmPassword) {

        changePasswordMessage.classList.add("error");

        changePasswordMessage.textContent =
            "New password and confirmation password do not match.";

        return;
    }


    // =========================================
    // DISABLE BUTTON WHILE PROCESSING
    // =========================================

    changePasswordButton.disabled = true;

    changePasswordButton.innerHTML =
        `<i class="fa-solid fa-spinner fa-spin"></i> Changing...`;


    // =========================================
    // SEND REQUEST TO SERVER
    // =========================================

    try {

        const response = await fetch(
            "/auth/changepassword",
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword,
                    confirmPassword: confirmPassword
                })
            }
        );


        // =========================================
        // GET SERVER RESPONSE
        // =========================================

        const data = await response.json();


        // =========================================
        // HANDLE ERROR RESPONSE
        // =========================================

        if (!response.ok) {

            changePasswordMessage.classList.add("error");

            changePasswordMessage.textContent =
                data.message || "Unable to change password.";

            return;
        }


        // =========================================
        // HANDLE SUCCESS
        // =========================================

        changePasswordMessage.classList.add("success");

        changePasswordMessage.textContent =
            data.message || "Password changed successfully.";


        // =========================================
        // CLEAR FORM
        // =========================================

        changePasswordForm.reset();


        // =========================================
        // CLOSE MODAL AFTER 2 SECONDS
        // =========================================

        setTimeout(() => {

            changePasswordModal.classList.remove("show");

            changePasswordMessage.className =
                "change-password-message";

            changePasswordMessage.textContent = "";

        }, 2000);


    } catch (error) {

        // =========================================
        // HANDLE NETWORK / UNEXPECTED ERROR
        // =========================================

        console.error("Change password error:", error);

        changePasswordMessage.classList.add("error");

        changePasswordMessage.textContent =
            "Something went wrong. Please try again.";

    } finally {

        // =========================================
        // RESTORE BUTTON
        // =========================================

        changePasswordButton.disabled = false;

        changePasswordButton.innerHTML =
            `<i class="fa-solid fa-check"></i> Change Password`;

    }

});

// =========================================
// SHOW / HIDE PASSWORD
// =========================================

document.querySelectorAll(".toggle-password").forEach(button => {
    button.addEventListener("click", function () {
        const targetId = this.dataset.target;
        const input = document.getElementById(targetId);
        const icon = this.querySelector("i");

        if (input.type === "password") {
            input.type = "text";
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");

        } else {
            input.type = "password";
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");

        }
    });
});