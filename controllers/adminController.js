const db = require("../Database/db");
const crypto = require("crypto");


const ALLOWED_ROLES = [
    "Cashier",
    "Manager",
    "Administrator",
    "Admin"
];


function getBusinessId(req) {
    return req.user?.business_id || req.session?.user?.business_id;
}


function getUserId(req) {
    return req.user?.id || req.user?.UserID || req.session?.user?.id;
}


function createSetupToken() {
    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    return {
        rawToken,
        tokenHash
    };
}


const adminController = {

    // ============================================================
    // ADMIN DASHBOARD
    // ============================================================

    dashboard: async (req, res) => {
        const businessId = getBusinessId(req);

        try {
            const [[pendingResult]] = await db.query(
                `
                SELECT COUNT(*) AS total
                FROM Users
                WHERE business_id = ?
                AND IsActive = 0
                `,
                [businessId]
            );

            const [[employeeResult]] = await db.query(
                `
                SELECT COUNT(*) AS total
                FROM Users
                WHERE business_id = ?
                `,
                [businessId]
            );

            const [[branchResult]] = await db.query(
                `
                SELECT COUNT(*) AS total
                FROM branches
                WHERE business_id = ?
                `,
                [businessId]
            );

            return res.render("admin/dashboard", {
                pendingRegistrations: pendingResult.total,
                totalEmployees: employeeResult.total,
                totalBranches: branchResult.total
            });

        } catch (error) {
            console.error("Admin dashboard error:", error);

            return res.status(500).render("500", {
                message: "Unable to load the administrator dashboard."
            });
        }
    },


    // ============================================================
    // PENDING REGISTRATIONS
    // ============================================================

    pendingRegistrations: async (req, res) => {
        const businessId = getBusinessId(req);

        try {
            const [registrations] = await db.query(
                `
                SELECT
                    UserID,
                    FirstName,
                    LastName,
                    JobTitle,
                    RoleName,
                    Email,
                    Phone,
                    branch_id,
                    IsActive
                FROM Users
                WHERE business_id = ?
                AND IsActive = 0
                ORDER BY UserID DESC
                `,
                [businessId]
            );

            const [branches] = await db.query(
                `
                SELECT
                    branch_id,
                    branch_name,
                    location
                FROM branches
                WHERE business_id = ?
                ORDER BY branch_name ASC
                `,
                [businessId]
            );

            return res.render("admin/pendingRegistrations", {
                pendingRegistrations:registrations,
                branches
            });

        } catch (error) {
            console.error("Pending registrations error:", error);

            return res.status(500).render("500", {
                message: "Unable to load pending registrations."
            });
        }
    },


    // ============================================================
    // APPROVE REGISTRATION
    // ============================================================

    approveRegistration: async (req, res) => {
        const businessId = getBusinessId(req);
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        try {
            const [result] = await db.query(
                `
                UPDATE Users
                SET IsActive = 1
                WHERE UserID = ?
                AND business_id = ?
                AND IsActive = 0
                `,
                [userId, businessId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Registration not found or already approved."
                });
            }

            return res.json({
                success: true,
                message: "Registration approved successfully."
            });

        } catch (error) {
            console.error("Approve registration error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to approve registration."
            });
        }
    },


    // ============================================================
    // REJECT REGISTRATION
    // ============================================================

    rejectRegistration: async (req, res) => {
        const businessId = getBusinessId(req);
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        try {
            const [result] = await db.query(
                `
                UPDATE Users
                SET IsActive = 0
                WHERE UserID = ?
                AND business_id = ?
                `,
                [userId, businessId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Registration not found."
                });
            }

            return res.json({
                success: true,
                message: "Registration rejected."
            });

        } catch (error) {
            console.error("Reject registration error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to reject registration."
            });
        }
    },


    // ============================================================
    // EMPLOYEE LIST
    // ============================================================

    employees: async (req, res) => {
        const businessId = getBusinessId(req);

        try {
            const [employees] = await db.query(
                `
                 SELECT
                    u.UserID,
                    u.FirstName,
                    u.LastName,
                    u.Email,
                    u.Phone,
                    u.JobTitle,
                    u.RoleName,
                    u.IsActive,
                    u.branch_id,
                    b.branch_name
                FROM Users u
                LEFT JOIN branches b
                    ON b.branch_id = u.branch_id
                    AND b.business_id = u.business_id
                WHERE u.business_id = ?
                ORDER BY u.UserID DESC
                `,
                [businessId]
            );

            return res.render("admin/employees", {
                employees
            });

        } catch (error) {
            console.error("Employee list error:", error);

            return res.status(500).render("500", {
                message: "Unable to load employees."
            });
        }
    },


    // ============================================================
    // CREATE EMPLOYEE
    // ============================================================

    createEmployee: async (req, res) => {
        const businessId = getBusinessId(req);
        const adminUserId = getUserId(req);

        let connection;

        try {
            const {
                first_name,
                last_name,
                job_title,
                role_name,
                email,
                phone,
                branch_id
            } = req.body;

            const firstName = String(first_name || "").trim();
            const lastName = String(last_name || "").trim();
            const jobTitle = String(job_title || "").trim();
            const roleName = String(role_name || "").trim();
            const employeeEmail = String(email || "").trim().toLowerCase();
            const employeePhone = String(phone || "").trim();

            const branchId = Number(branch_id);

            // ----------------------------------------------------
            // BASIC VALIDATION
            // ----------------------------------------------------

            if (!firstName || !lastName || !roleName || !employeeEmail) {
                return res.status(400).json({
                    success: false,
                    message: "First name, last name, role and email are required."
                });
            }

            if (!Number.isInteger(branchId) || branchId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "A valid branch is required."
                });
            }

            if (!ALLOWED_ROLES.includes(roleName)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid employee role."
                });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(employeeEmail)) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid email address."
                });
            }


            // ----------------------------------------------------
            // DATABASE TRANSACTION
            // ----------------------------------------------------

            connection = await db.getConnection();

            await connection.beginTransaction();


            // ----------------------------------------------------
            // VERIFY BRANCH BELONGS TO CURRENT BUSINESS
            // ----------------------------------------------------

            const [branches] = await connection.query(
                `
                SELECT branch_id
                FROM branches
                WHERE branch_id = ?
                AND business_id = ?
                LIMIT 1
                `,
                [branchId, businessId]
            );

            if (branches.length === 0) {
                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message: "The selected branch does not belong to your business."
                });
            }


            // ----------------------------------------------------
            // CHECK EMAIL
            // ----------------------------------------------------

            const [existingUsers] = await connection.query(
                `
                SELECT UserID
                FROM Users
                WHERE Email = ?
                LIMIT 1
                `,
                [employeeEmail]
            );

            if (existingUsers.length > 0) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message: "An account with this email already exists."
                });
            }


            // ----------------------------------------------------
            // GET BUSINESS INFORMATION
            // ----------------------------------------------------

            const [businesses] = await connection.query(
                `
                SELECT
                    business_id,
                    business_name
                FROM businesses
                WHERE business_id = ?
                LIMIT 1
                `,
                [businessId]
            );

            if (businesses.length === 0) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message: "Business could not be found."
                });
            }

            const business = businesses[0];


            // ----------------------------------------------------
            // CREATE EMPLOYEE
            //
            // IMPORTANT:
            // No password is created by the administrator.
            // The employee will create their own password through
            // the one-time setup link.
            // ----------------------------------------------------

            const [userResult] = await connection.query(
                `
                INSERT INTO Users (
                    business_id,
                    FirstName,
                    LastName,
                    JobTitle,
                    RoleName,
                    Business_name,
                    branch_id,
                    Email,
                    Phone,
                    PasswordHash,
                    IsActive
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
                `,
                [
                    businessId,
                    firstName,
                    lastName,
                    jobTitle || null,
                    roleName,
                    business.business_name,
                    branchId,
                    employeeEmail,
                    employeePhone || null
                ]
            );

            const employeeId = userResult.insertId;

            // ----------------------------------------------------
            // CREATE ONE-TIME SETUP TOKEN
            // ----------------------------------------------------

            const { rawToken, tokenHash } = createSetupToken();

            await connection.query(
                `
                INSERT INTO employee_setup_tokens (
                    user_id,
                    business_id,
                    token_hash,
                    expires_at
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    DATE_ADD(NOW(), INTERVAL 24 HOUR)
                )
                `,
                [
                    employeeId,
                    businessId,
                    tokenHash
                ]
            );


            // ----------------------------------------------------
            // COMMIT
            // ----------------------------------------------------

            await connection.commit();


            // ----------------------------------------------------
            // SETUP URL
            // ----------------------------------------------------

            const baseUrl =
                process.env.APP_URL ||
                `${req.protocol}://${req.get("host")}`;

            const setupUrl =
                `${baseUrl}/auth/employee/setup?token=${encodeURIComponent(rawToken)}`;


            console.log(
                `Employee ${employeeId} created by admin ${adminUserId}`
            );


            return res.status(201).json({
                success: true,
                message: "Employee created successfully.",
                setupUrl
            });

        } catch (error) {

            if (connection) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        "Employee creation rollback error:",
                        rollbackError
                    );
                }
            }

            console.error("Create employee error:", error);

            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    success: false,
                    message: "An account with this email already exists."
                });
            }

            return res.status(500).json({
                success: false,
                message: "Unable to create employee."
            });

        } finally {

            if (connection) {
                connection.release();
            }
        }
    },


    // ============================================================
    // ACTIVATE EMPLOYEE
    // ============================================================

    activateEmployee: async (req, res) => {
        const businessId = getBusinessId(req);
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        try {
            const [result] = await db.query(
                `
                UPDATE Users
                SET IsActive = 1
                WHERE UserID = ?
                AND business_id = ?
                `,
                [userId, businessId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Employee not found."
                });
            }

            return res.json({
                success: true,
                message: "Employee activated successfully."
            });

        } catch (error) {
            console.error("Activate employee error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to activate employee."
            });
        }
    },


    // ============================================================
    // DEACTIVATE EMPLOYEE
    // ============================================================

    deactivateEmployee: async (req, res) => {
        const businessId = getBusinessId(req);
        const userId = Number(req.params.userId);
        const adminUserId = getUserId(req);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        if (userId === Number(adminUserId)) {
            return res.status(400).json({
                success: false,
                message: "You cannot deactivate your own administrator account."
            });
        }

        try {
            const [result] = await db.query(
                `
                UPDATE Users
                SET IsActive = 0
                WHERE UserID = ?
                AND business_id = ?
                `,
                [userId, businessId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Employee not found."
                });
            }

            return res.json({
                success: true,
                message: "Employee deactivated successfully."
            });

        } catch (error) {
            console.error("Deactivate employee error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to deactivate employee."
            });
        }
    }
};


module.exports = adminController;