const db = require("../Database/db");

const ALLOWED_ROLES = [
    "Owner",
    "Admin",
    "Administrator"
];

function getAuthenticatedUser(req) {
    return req.session?.user || req.user || null;
}

function getBusinessId(user) {
    const businessId = Number(user?.business_id);

    if (!Number.isInteger(businessId) || businessId <= 0) {
        return null;
    }

    return businessId;
}

function isAuthorized(user) {
    const role = String(user?.RoleName || "")
        .trim()
        .toLowerCase();

    return ALLOWED_ROLES.some(
        allowedRole =>
            allowedRole.toLowerCase() === role
    );
}

function cleanValue(value) {
    return typeof value === "string"
        ? value.trim()
        : "";
}


/*
|--------------------------------------------------------------------------
| SHOW NEW BRANCH PAGE
|--------------------------------------------------------------------------
*/

exports.showNewBranch = async (req, res) => {
    try {
        const user = getAuthenticatedUser(req);

        if (!user) {
            return res.redirect("/login");
        }

        if (!isAuthorized(user)) {
            return res.status(403).render("error", {
                message: "You are not authorized to manage branches."
            });
        }

        const businessId = getBusinessId(user);

        if (!businessId) {
            return res.status(403).render("error", {
                message: "Your account is not associated with a valid business."
            });
        }

        const [businesses] = await db.query(
            `
            SELECT
                business_id,
                business_name,
                phone,
                email,
                address,
                city
            FROM businesses
            WHERE business_id = ?
              AND is_active = 1
            LIMIT 1
            `,
            [businessId]
        );

        if (!businesses.length) {
            return res.status(404).render("error", {
                message: "Your business could not be found."
            });
        }

        const [branches] = await db.query(
            `
            SELECT
                branch_id,
                business_id,
                business_name,
                branch_name,
                location,
                phone,
                is_active,
                created_at,
                updated_at
            FROM branches
            WHERE business_id = ?
            ORDER BY
                is_active DESC,
                branch_name ASC
            `,
            [businessId]
        );

        return res.render("newBranch", {
            title: "New Branch | MarketFlow",
            business: businesses[0],
            branches,
            user
        });

    } catch (error) {
        console.error(
            "Show new branch error:",
            error
        );

        return res.status(500).render("error", {
            message: "Unable to load the branch management page."
        });
    }
};


/*
|--------------------------------------------------------------------------
| GET BUSINESS BRANCHES
|--------------------------------------------------------------------------
*/

exports.getBranches = async (req, res) => {
    try {
        const user = getAuthenticatedUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        if (!isAuthorized(user)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to manage branches."
            });
        }

        const businessId = getBusinessId(user);

        if (!businessId) {
            return res.status(403).json({
                success: false,
                message: "Your account is not associated with a valid business."
            });
        }

        const [branches] = await db.query(
            `
            SELECT
                branch_id,
                business_id,
                business_name,
                branch_name,
                location,
                phone,
                is_active,
                created_at,
                updated_at
            FROM branches
            WHERE business_id = ?
            ORDER BY
                is_active DESC,
                branch_name ASC
            `,
            [businessId]
        );

        return res.json({
            success: true,
            branches
        });

    } catch (error) {
        console.error(
            "Get branches error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to load branches."
        });
    }
};


/*
|--------------------------------------------------------------------------
| CREATE NEW BRANCH
|--------------------------------------------------------------------------
*/

exports.createBranch = async (req, res) => {
    let connection;

    try {
        const user = getAuthenticatedUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        if (!isAuthorized(user)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to create branches."
            });
        }

        const businessId = getBusinessId(user);

        if (!businessId) {
            return res.status(403).json({
                success: false,
                message: "Your account is not associated with a valid business."
            });
        }

        const branchName = cleanValue(
            req.body?.branch_name
        );

        const branchLocation = cleanValue(
            req.body?.branch_location
        );

        const branchPhone = cleanValue(
            req.body?.branch_phone
        );

        if (!branchName) {
            return res.status(400).json({
                success: false,
                message: "Branch name is required."
            });
        }

        if (branchName.length > 150) {
            return res.status(400).json({
                success: false,
                message: "Branch name cannot exceed 150 characters."
            });
        }

        if (branchLocation.length > 255) {
            return res.status(400).json({
                success: false,
                message: "Branch location cannot exceed 255 characters."
            });
        }

        if (branchPhone.length > 30) {
            return res.status(400).json({
                success: false,
                message: "Branch phone cannot exceed 30 characters."
            });
        }

        connection = await db.getConnection();

        await connection.beginTransaction();

        /*
        |--------------------------------------------------------------------------
        | VERIFY AUTHENTICATED BUSINESS
        |--------------------------------------------------------------------------
        */

        const [businesses] = await connection.query(
            `
            SELECT
                business_id,
                business_name
            FROM businesses
            WHERE business_id = ?
              AND is_active = 1
            LIMIT 1
            `,
            [businessId]
        );

        if (!businesses.length) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Your business could not be found."
            });
        }

        const business = businesses[0];

        /*
        |--------------------------------------------------------------------------
        | CHECK DUPLICATE BRANCH NAME
        |--------------------------------------------------------------------------
        */

        const [existingBranches] = await connection.query(
            `
            SELECT
                branch_id,
                is_active
            FROM branches
            WHERE business_id = ?
              AND branch_name = ?
            LIMIT 1
            `,
            [
                businessId,
                branchName
            ]
        );

        if (existingBranches.length) {
            await connection.rollback();

            if (Number(existingBranches[0].is_active) === 1) {
                return res.status(409).json({
                    success: false,
                    message: "A branch with this name already exists."
                });
            }

            return res.status(409).json({
                success: false,
                message:
                    "A branch with this name already exists but is inactive."
            });
        }

        /*
        |--------------------------------------------------------------------------
        | CREATE BRANCH
        |--------------------------------------------------------------------------
        */

        const [branchResult] = await connection.query(
            `
            INSERT INTO branches
            (
                business_id,
                business_name,
                branch_name,
                location,
                phone,
                is_active
            )
            VALUES (?, ?, ?, ?, ?, 1)
            `,
            [
                businessId,
                business.business_name,
                branchName,
                branchLocation || null,
                branchPhone || null
            ]
        );

        const branchId = branchResult.insertId;

        /*
        |--------------------------------------------------------------------------
        | READ CREATED BRANCH
        |--------------------------------------------------------------------------
        */

        const [createdBranches] = await connection.query(
            `
            SELECT
                branch_id,
                business_id,
                business_name,
                branch_name,
                location,
                phone,
                is_active,
                created_at,
                updated_at
            FROM branches
            WHERE branch_id = ?
              AND business_id = ?
            LIMIT 1
            `,
            [
                branchId,
                businessId
            ]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Branch created successfully.",
            branch: createdBranches[0]
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Branch rollback error:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Create branch error:",
            error
        );

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "A branch with this name already exists."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to create branch. Please try again."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};