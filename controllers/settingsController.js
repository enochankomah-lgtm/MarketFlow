// ============================================================
// MARKETFLOW — SETTINGS CONTROLLER
// ============================================================
//
// Handles application settings:
//
//   1. Transaction-level Tax
//   2. Transaction-level Discount
//   3. Product-level Discounts
//
// SCOPE RULES
// ------------------------------------------------------------
//
// Transaction settings:
//
//   branch_id = NULL
//       → Entire business
//
//   branch_id = specific branch
//       → That branch only
//
// Product discounts:
//
//   branch_id = NULL
//       → Entire business
//
//   branch_id = specific branch
//       → That branch only
//
// READ FALLBACK
// ------------------------------------------------------------
//
// For a user operating in a branch:
//
//     Branch-specific setting
//             ↓
//     Business-wide setting
//             ↓
//     0.00 / no setting
//
// SECURITY
// ------------------------------------------------------------
//
// business_id ALWAYS comes from:
//
//     req.user.business_id
//
// branch_id may be selected by the user as a setting scope,
// but is always verified to belong to the authenticated business.
//
// Never trust a browser-supplied business_id.
//
// ============================================================

const db = require('../Database/db');



// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Get the authenticated business ID.
 */
function getBusinessId(req) {
    return Number(req.user?.business_id);
}


/**
 * Get the authenticated user's branch ID.
 */
function getUserBranchId(req) {
    const branchId = Number(req.user?.branch_id);

    return Number.isInteger(branchId) && branchId > 0
        ? branchId
        : null;
}


/**
 * Get the authenticated user ID.
 */
function getUserId(req) {
    return Number(req.user?.UserID || req.user?.id);
}


/**
 * Convert an optional branch ID.
 *
 * null / empty / undefined
 *     → business-wide setting
 *
 * positive integer
 *     → branch-specific setting
 */
function parseOptionalBranchId(value) {

    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    ) {
        return null;
    }

    const branchId = Number(value);

    if (
        !Number.isInteger(branchId) ||
        branchId <= 0
    ) {
        return undefined;
    }

    return branchId;
}


/**
 * Verify that a branch belongs to the authenticated business.
 */
async function verifyBranchBelongsToBusiness(
    businessId,
    branchId
) {

    if (branchId === null) {
        return true;
    }

    const [rows] = await db.query(`
        SELECT
            branch_id
        FROM branches
        WHERE branch_id = ?
          AND business_id = ?
        LIMIT 1
    `, [
        branchId,
        businessId
    ]);

    return rows.length > 0;
}


/**
 * Verify that a manager belongs to the authenticated business
 * and is currently active.
 */
async function getValidManager(
    businessId,
    managerId
) {

    const [rows] = await db.query(`
        SELECT
            UserID,
            FirstName,
            LastName,
            JobTitle,
            RoleName
        FROM users
        WHERE UserID = ?
          AND business_id = ?
          AND IsActive = 1
          AND (
                  RoleName = 'Manager'
                    OR RoleName = 'Owner'
                    OR JobTitle = 'Manager'
              )
        LIMIT 1
    `, [
        managerId,
        businessId
    ]);

    return rows[0] || null;
}

// ============================================================
// GET SETTINGS PAGE
// ============================================================

exports.getSettings = async (req, res) => {
    try {
        const businessId = getBusinessId(req);
        const userBranchId = getUserBranchId(req);

        const [settingsRows] = await db.query(
            `
            SELECT
                td.tax_discount_id,
                td.business_id,
                td.branch_id,
                td.tax_rate,
                td.discount_rate,
                td.effective_from,
                td.updated_by,
                td.change_reason,
                td.updated_at
            FROM tax_discount td
            WHERE td.business_id = ?
              AND (
                    td.branch_id = ?
                    OR td.branch_id IS NULL
                  )
            ORDER BY
                CASE
                    WHEN td.branch_id = ? THEN 0
                    WHEN td.branch_id IS NULL THEN 1
                    ELSE 2
                END
            LIMIT 1
            `,
            [businessId, userBranchId || null, userBranchId || null]
        );

        const pageSettings = settingsRows.length
            ? settingsRows[0]
            : {
                  business_id: businessId,
                  branch_id: null,
                  tax_rate: 0,
                  discount_rate: 0,
                  effective_from: null,
                  updated_by: null,
                  change_reason: null,
                  updated_at: null
              };

        const [branches] = await db.query(
            `
            SELECT
                branch_id,
                branch_name
            FROM branches
            WHERE business_id = ?
            ORDER BY branch_name ASC
            `,
            [businessId]
        );

      
        const [productDiscounts] = await db.query(
            `
            SELECT
                pd.discount_id,
                pd.business_id,
                pd.branch_id,
                pd.product_id,
                pd.product_name,
                pd.discount,
                pd.reason,
                pd.created_at,
                pd.updated_at
            FROM product_discount pd
            INNER JOIN products p
                ON p.product_id = pd.product_id
               AND p.business_id = pd.business_id
            WHERE pd.business_id = ?
              AND (
                    pd.branch_id = ?
                    OR pd.branch_id IS NULL
                  )
            ORDER BY
                p.product_name ASC,
                CASE
                    WHEN pd.branch_id = ? THEN 0
                    WHEN pd.branch_id IS NULL THEN 1
                    ELSE 2
                END
            `,
            [businessId, userBranchId || null, userBranchId || null]
        );

        const effectiveProductDiscounts = [];
        const seenProducts = new Set();

        for (const discount of productDiscounts) {
            if (seenProducts.has(discount.product_id)) {
                continue;
            }

            seenProducts.add(discount.product_id);
            effectiveProductDiscounts.push(discount);
        }

        return res.render("settings", {
            pageTitle: "Settings",
            pageSettings,
            productDiscounts: effectiveProductDiscounts,
            branches
        });

    } catch (error) {
        console.error("Get settings error:", error);

        return res.status(500).render("error", {
            message: "Unable to load settings."
        });
    }
};


exports.searchManagers = async (req, res) => {

    try {

        const businessId = getBusinessId(req);

        if (
            !Number.isInteger(businessId) ||
            businessId <= 0
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Invalid business context.'
            });
        }


        const search = String(
            req.query.search || ''
        ).trim();


        if (search.length < 1) {

            return res.json({
                success: true,
                managers: []
            });
        }


        const searchValue = `%${search}%`;


        const [managers] = await db.query(`
            SELECT
                UserID,
                FirstName,
                LastName,
                JobTitle,
                RoleName
            FROM users
            WHERE business_id = ?
              AND IsActive = 1
              AND (
                     RoleName = 'Manager'
                        OR RoleName = 'Owner'
                        OR JobTitle = 'Manager'
                  )
              AND (
                    FirstName LIKE ?
                    OR LastName LIKE ?
                    OR CONCAT(
                        FirstName,
                        ' ',
                        LastName
                    ) LIKE ?
                  )
            ORDER BY
                FirstName ASC,
                LastName ASC
            LIMIT 10
        `, [
            businessId,
            searchValue,
            searchValue,
            searchValue
        ]);


        res.json({
            success: true,
            managers
        });


    } catch (error) {

        console.error(
            'Error searching managers:',
            error
        );

        res.status(500).json({
            success: false,
            message:
                'Unable to search managers.'
        });
    }
};



// ============================================================
// UPDATE TAX & TRANSACTION DISCOUNT
// ============================================================
//
// branch_id:
//
//     omitted / null
//         → Entire business
//
//     supplied
//         → Specific branch
//
// ============================================================

exports.updateTaxDiscount = async (req, res) => {

    const connection = await db.getConnection();

    try {

        const businessId = getBusinessId(req);

        if (
            !Number.isInteger(businessId) ||
            businessId <= 0
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Invalid business context.'
            });
        }


        const {
            tax_rate,
            discount_rate,
            change_reason,
            manager_id,
            branch_id
        } = req.body;


        const taxRate = Number(tax_rate);
        const discountRate = Number(discount_rate);
        const managerId = Number(manager_id);


        // ----------------------------------------------------
        // Parse scope
        // ----------------------------------------------------

        const branchId = parseOptionalBranchId(
            branch_id
        );


        if (branchId === undefined) {

            return res.status(400).json({
                success: false,
                message:
                    'Invalid branch.'
            });
        }


        // ----------------------------------------------------
        // Validate Tax
        // ----------------------------------------------------

        if (
            !Number.isFinite(taxRate) ||
            taxRate < 0 ||
            taxRate > 100
        ) {

            return res.status(400).json({
                success: false,
                message:
                    'Tax rate must be between 0 and 100.'
            });
        }


        // ----------------------------------------------------
        // Validate Transaction Discount
        // ----------------------------------------------------

        if (
            !Number.isFinite(discountRate) ||
            discountRate < 0 ||
            discountRate > 100
        ) {

            return res.status(400).json({
                success: false,
                message:
                    'Discount rate must be between 0 and 100.'
            });
        }


        // ----------------------------------------------------
        // Validate Manager
        // ----------------------------------------------------

        if (
            !Number.isInteger(managerId) ||
            managerId <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    'Please select a valid manager.'
            });
        }


        // ----------------------------------------------------
        // Validate Reason
        // ----------------------------------------------------

        const reason = String(
            change_reason || ''
        ).trim();


        if (!reason) {

            return res.status(400).json({
                success: false,
                message:
                    'Please provide a reason for the change.'
            });
        }


        if (reason.length > 255) {

            return res.status(400).json({
                success: false,
                message:
                    'The reason cannot exceed 255 characters.'
            });
        }


        // ----------------------------------------------------
        // Verify branch
        // ----------------------------------------------------

        const validBranch =
            await verifyBranchBelongsToBusiness(
                businessId,
                branchId
            );


        if (!validBranch) {

            return res.status(403).json({
                success: false,
                message:
                    'The selected branch does not belong to your business.'
            });
        }


        // ----------------------------------------------------
        // Verify manager
        // ----------------------------------------------------

        const manager =
            await getValidManager(
                businessId,
                managerId
            );


        if (!manager) {

            return res.status(403).json({
                success: false,
                message:
                    'The selected user is not an active manager in your business.'
            });
        }


        // ----------------------------------------------------
        // Start transaction
        // ----------------------------------------------------

        await connection.beginTransaction();


        // ----------------------------------------------------
        // Lock existing setting for this exact scope
        // ----------------------------------------------------

        const [existingRows] = await connection.query(`
            SELECT
                tax_discount_id,
                tax_rate,
                discount_rate,
                branch_id
            FROM tax_discount
            WHERE business_id = ?
              AND (
                    branch_id = ?
                    OR (
                        branch_id IS NULL
                        AND ? IS NULL
                    )
                  )
            LIMIT 1
            FOR UPDATE
        `, [
            businessId,
            branchId,
            branchId
        ]);


        const existing = existingRows[0] || null;


        // ----------------------------------------------------
        // UPDATE EXISTING SETTING
        // ----------------------------------------------------

        if (existing) {

            await connection.query(`
                INSERT INTO tax_discount_history (
                    business_id,
                    branch_id,
                    tax_discount_id,
                    old_tax_rate,
                    new_tax_rate,
                    old_discount_rate,
                    new_discount_rate,
                    change_reason,
                    changed_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                businessId,
                branchId,
                existing.tax_discount_id,
                existing.tax_rate,
                taxRate,
                existing.discount_rate,
                discountRate,
                reason,
                managerId
            ]);


            await connection.query(`
                UPDATE tax_discount
                SET
                    tax_rate = ?,
                    discount_rate = ?,
                    effective_from = CURRENT_TIMESTAMP,
                    updated_by = ?,
                    change_reason = ?
                WHERE tax_discount_id = ?
                  AND business_id = ?
            `, [
                taxRate,
                discountRate,
                managerId,
                reason,
                existing.tax_discount_id,
                businessId
            ]);
        }


        // ----------------------------------------------------
        // CREATE NEW SETTING
        // ----------------------------------------------------
        //
        // NOTE:
        // tax_discount_id is NOT AUTO_INCREMENT in the current
        // database schema, so generate the next safe ID while
        // holding the transaction.
        //
        // This should later be reviewed at schema level.
        // ----------------------------------------------------

        else {

            const [maxIdRows] = await connection.query(`
                SELECT
                    COALESCE(
                        MAX(tax_discount_id),
                        0
                    ) + 1 AS next_id
                FROM tax_discount
                FOR UPDATE
            `);


            const nextId =
                Number(maxIdRows[0]?.next_id);


            if (
                !Number.isInteger(nextId) ||
                nextId <= 0 ||
                nextId > 255
            ) {

                throw new Error(
                    'Unable to allocate a valid tax discount setting ID.'
                );
            }


            await connection.query(`
                INSERT INTO tax_discount (
                    tax_discount_id,
                    business_id,
                    branch_id,
                    tax_rate,
                    discount_rate,
                    effective_from,
                    updated_by,
                    change_reason
                )
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
            `, [
                nextId,
                businessId,
                branchId,
                taxRate,
                discountRate,
                managerId,
                reason
            ]);


            // There is no previous setting, so history starts
            // with the newly-created values.
            await connection.query(`
                INSERT INTO tax_discount_history (
                    business_id,
                    branch_id,
                    tax_discount_id,
                    old_tax_rate,
                    new_tax_rate,
                    old_discount_rate,
                    new_discount_rate,
                    change_reason,
                    changed_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                businessId,
                branchId,
                nextId,
                0.00,
                taxRate,
                0.00,
                discountRate,
                reason,
                managerId
            ]);
        }


        await connection.commit();


        // ----------------------------------------------------
        // Return effective setting
        // ----------------------------------------------------

        const [updatedRows] = await db.query(`
            SELECT
                td.tax_discount_id,
                td.business_id,
                td.branch_id,
                td.tax_rate,
                td.discount_rate,
                td.effective_from,
                td.updated_by,
                td.change_reason,
                td.updated_at
            FROM tax_discount td
            WHERE td.business_id = ?
              AND (
                    td.branch_id = ?
                    OR (
                        td.branch_id IS NULL
                        AND ? IS NULL
                    )
                  )
            LIMIT 1
        `, [
            businessId,
            branchId,
            branchId
        ]);


        res.json({
            success: true,
            message:
                'Tax and transaction discount settings updated successfully.',
            settings:
                updatedRows[0] || null
        });


    } catch (error) {

        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error(
                'Settings transaction rollback error:',
                rollbackError
            );
        }


        console.error(
            'Error updating tax and transaction discount:',
            error
        );


        res.status(500).json({
            success: false,
            message:
                error.sqlMessage ||
                error.message ||
                'Unable to update tax and transaction discount settings.'
        });


    } finally {

        connection.release();
    }
};



// ============================================================
// GET TAX & TRANSACTION DISCOUNT HISTORY
// ============================================================

exports.getTaxDiscountHistory = async (req, res) => {

    try {

        const businessId = getBusinessId(req);

        if (
            !Number.isInteger(businessId) ||
            businessId <= 0
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Invalid business context.'
            });
        }


        const [history] = await db.query(`
            SELECT
                h.history_id,
                h.business_id,
                h.branch_id,
                h.old_tax_rate,
                h.new_tax_rate,
                h.old_discount_rate,
                h.new_discount_rate,
                h.change_reason,
                h.changed_at,
                h.changed_by,

                CONCAT(
                    u.FirstName,
                    ' ',
                    u.LastName
                ) AS manager_name

            FROM tax_discount_history h

            LEFT JOIN users u
                ON u.UserID = h.changed_by
               AND u.business_id = h.business_id

            WHERE h.business_id = ?

            ORDER BY
                h.changed_at DESC,
                h.history_id DESC

            LIMIT 100
        `, [
            businessId
        ]);


        res.json({
            success: true,
            history
        });


    } catch (error) {

        console.error(
            'Error loading tax and discount history:',
            error
        );


        res.status(500).json({
            success: false,
            message:
                'Unable to load settings history.'
        });
    }
};



// ============================================================
// GET ALL EFFECTIVE PRODUCT DISCOUNT SETTINGS
// ============================================================
//
// For the authenticated user's branch:
//
//     branch-specific discount
//             ↓
//     business-wide discount
//
// Only one effective row per product is returned.
//
// ============================================================

exports.getProductDiscountSettings = async (req, res) => {

    try {

        const businessId = getBusinessId(req);
        const branchId = getUserBranchId(req);


        if (
            !Number.isInteger(businessId) ||
            businessId <= 0
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Invalid business context.'
            });
        }


        const [productDiscounts] = await db.query(`
            SELECT
                pd.discount_id,
                pd.business_id,
                pd.branch_id,
                pd.product_id,
                p.product_name,
                p.selling_price,
                pd.discount,
                pd.reason,
                pd.created_at,
                pd.updated_at

            FROM product_discount pd

            INNER JOIN products p
                ON p.product_id = pd.product_id
               AND p.business_id = pd.business_id

            WHERE pd.business_id = ?
              AND (
                    pd.branch_id = ?
                    OR pd.branch_id IS NULL
                  )

              AND NOT EXISTS (
                    SELECT 1
                    FROM product_discount override_pd
                    WHERE override_pd.business_id = ?
                      AND override_pd.product_id = pd.product_id
                      AND override_pd.branch_id = ?
                      AND pd.branch_id IS NULL
                  )

            ORDER BY
                p.product_name ASC
        `, [
            businessId,
            branchId,
            businessId,
            branchId
        ]);


        res.json({
            success: true,
            productDiscounts
        });


    } catch (error) {

        console.error(
            'Error loading product discount settings:',
            error
        );


        res.status(500).json({
            success: false,
            message:
                'Unable to load product discount settings.'
        });
    }
};



// ============================================================
// SEARCH PRODUCT DISCOUNT SETTINGS
// ============================================================

exports.searchProductDiscountSettings = async (req, res) => {

    try {

        const businessId = getBusinessId(req);
        const branchId = getUserBranchId(req);


        if (
            !Number.isInteger(businessId) ||
            businessId <= 0
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Invalid business context.'
            });
        }


        const search = String(
            req.query.search || ''
        ).trim();


        if (search.length < 1) {

            return res.json({
                success: true,
                productDiscounts: []
            });
        }


        const searchValue = `%${search}%`;


        const [productDiscounts] = await db.query(`
            SELECT
                pd.discount_id,
                pd.business_id,
                pd.branch_id,
                pd.product_id,
                p.product_name,
                p.selling_price,
                pd.discount,
                pd.reason,
                pd.created_at,
                pd.updated_at

            FROM product_discount pd

            INNER JOIN products p
                ON p.product_id = pd.product_id
               AND p.business_id = pd.business_id

            WHERE pd.business_id = ?

              AND (
                    pd.branch_id = ?
                    OR pd.branch_id IS NULL
                  )

              AND (
                    p.product_name LIKE ?
                    OR CAST(
                        p.product_id AS CHAR
                    ) LIKE ?
                  )

              AND NOT EXISTS (
                    SELECT 1
                    FROM product_discount override_pd
                    WHERE override_pd.business_id = ?
                      AND override_pd.product_id = pd.product_id
                      AND override_pd.branch_id = ?
                      AND pd.branch_id IS NULL
                  )

            ORDER BY
                p.product_name ASC

            LIMIT 20
        `, [
            businessId,
            branchId,
            searchValue,
            searchValue,
            businessId,
            branchId
        ]);


        res.json({
            success: true,
            productDiscounts
        });


    } catch (error) {

        console.error(
            'Error searching product discount settings:',
            error
        );


        res.status(500).json({
            success: false,
            message:
                'Unable to search product discount settings.'
        });
    }
};



// ============================================================
// GET ONE PRODUCT DISCOUNT SETTING
// ============================================================
//
// Returns the effective discount for the authenticated
// user's branch.
//
// Optional query:
//
//     ?branch_id=25
//
// is intentionally NOT accepted here.
// Settings are read according to the authenticated user's
// current branch to prevent arbitrary branch data exposure.
//
// ============================================================

exports.getProductDiscountSetting = async (req, res) => {

    try {

        const businessId = getBusinessId(req);
        const branchId = getUserBranchId(req);


        const productId = Number(
            req.params.product_id
        );


        if (
            !Number.isInteger(businessId) ||
            businessId <= 0
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Invalid business context.'
            });
        }


        if (
            !Number.isInteger(productId) ||
            productId <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    'Invalid product.'
            });
        }


        const [rows] = await db.query(`
            SELECT
                pd.discount_id,
                pd.business_id,
                pd.branch_id,
                pd.product_id,
                p.product_name,
                p.selling_price,
                pd.discount,
                pd.reason,
                pd.created_at,
                pd.updated_at

            FROM product_discount pd

            INNER JOIN products p
                ON p.product_id = pd.product_id
               AND p.business_id = pd.business_id

            WHERE pd.business_id = ?
              AND pd.product_id = ?
              AND (
                    pd.branch_id = ?
                    OR pd.branch_id IS NULL
                  )

            ORDER BY
                CASE
                    WHEN pd.branch_id = ? THEN 0
                    WHEN pd.branch_id IS NULL THEN 1
                    ELSE 2
                END

            LIMIT 1
        `, [
            businessId,
            productId,
            branchId,
            branchId
        ]);


        if (rows.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    'Product discount setting not found.'
            });
        }


        res.json({
            success: true,
            productDiscount: rows[0]
        });


    } catch (error) {

        console.error(
            'Error loading product discount setting:',
            error
        );


        res.status(500).json({
            success: false,
            message:
                'Unable to load product discount setting.'
        });
    }
};



// ============================================================
// UPDATE PRODUCT DISCOUNT SETTING
// ============================================================
//
// branch_id:
//
//     null
//         → Business-wide product discount
//
//     specific branch
//         → Branch-specific product discount
//
// ============================================================

exports.updateProductDiscountSetting = async (req, res) => {

    const connection = await db.getConnection();

    try {

        const businessId = getBusinessId(req);


        if (
            !Number.isInteger(businessId) ||
            businessId <= 0
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Invalid business context.'
            });
        }


        const {
            discount,
            reason,
            branch_id
        } = req.body;


        const productId = Number(
            req.params.product_id ||
            req.body.product_id
        );


        const discountRate = Number(
            discount
        );


        const changeReason = String(
            reason || ''
        ).trim();


        // ----------------------------------------------------
        // Scope
        // ----------------------------------------------------

        const branchId = parseOptionalBranchId(
            branch_id
        );


        if (branchId === undefined) {

            return res.status(400).json({
                success: false,
                message:
                    'Invalid branch.'
            });
        }


        // ----------------------------------------------------
        // Validate Product ID
        // ----------------------------------------------------

        if (
            !Number.isInteger(productId) ||
            productId <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    'Please select a valid product.'
            });
        }


        // ----------------------------------------------------
        // Validate Discount
        // ----------------------------------------------------

        if (
            !Number.isFinite(discountRate) ||
            discountRate < 0 ||
            discountRate > 100
        ) {

            return res.status(400).json({
                success: false,
                message:
                    'Product discount must be between 0 and 100.'
            });
        }


        // ----------------------------------------------------
        // Validate Reason
        // ----------------------------------------------------

        if (!changeReason) {

            return res.status(400).json({
                success: false,
                message:
                    'Please provide a reason for the change.'
            });
        }


        if (changeReason.length > 255) {

            return res.status(400).json({
                success: false,
                message:
                    'The reason cannot exceed 255 characters.'
            });
        }


        // ----------------------------------------------------
        // Verify branch
        // ----------------------------------------------------

        const validBranch =
            await verifyBranchBelongsToBusiness(
                businessId,
                branchId
            );


        if (!validBranch) {

            return res.status(403).json({
                success: false,
                message:
                    'The selected branch does not belong to your business.'
            });
        }


        // ----------------------------------------------------
        // Verify product belongs to business
        // ----------------------------------------------------

        const [products] = await connection.query(`
            SELECT
                product_id,
                business_id,
                branch_id,
                product_name,
                selling_price
            FROM products
            WHERE product_id = ?
              AND business_id = ?
            LIMIT 1
        `, [
            productId,
            businessId
        ]);


        if (products.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    'Product not found in your business.'
            });
        }


        const product = products[0];


        // ----------------------------------------------------
        // If a branch-specific discount is being created,
        // make sure the product can legitimately be associated
        // with that branch.
        //
        // Business-wide products (branch_id NULL) can receive
        // branch-specific settings.
        //
        // Products assigned to another branch cannot.
        // ----------------------------------------------------

        if (
            branchId !== null &&
            product.branch_id !== null &&
            Number(product.branch_id) !== branchId
        ) {

            return res.status(400).json({
                success: false,
                message:
                    'This product does not belong to the selected branch.'
            });
        }


        // ----------------------------------------------------
        // Start transaction
        // ----------------------------------------------------

        await connection.beginTransaction();


        // ----------------------------------------------------
        // Find existing discount for exact scope
        // ----------------------------------------------------

        const [existingRows] = await connection.query(`
            SELECT
                discount_id
            FROM product_discount
            WHERE business_id = ?
              AND product_id = ?
              AND (
                    branch_id = ?
                    OR (
                        branch_id IS NULL
                        AND ? IS NULL
                    )
                  )
            LIMIT 1
            FOR UPDATE
        `, [
            businessId,
            productId,
            branchId,
            branchId
        ]);


        if (existingRows.length > 0) {

            await connection.query(`
                UPDATE product_discount
                SET
                    product_name = ?,
                    discount = ?,
                    reason = ?
                WHERE discount_id = ?
                  AND business_id = ?
            `, [
                product.product_name,
                discountRate,
                changeReason,
                existingRows[0].discount_id,
                businessId
            ]);

        } else {

            await connection.query(`
                INSERT INTO product_discount (
                    business_id,
                    branch_id,
                    product_id,
                    product_name,
                    discount,
                    reason
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                businessId,
                branchId,
                productId,
                product.product_name,
                discountRate,
                changeReason
            ]);
        }


        await connection.commit();


        // ----------------------------------------------------
        // Return saved record
        // ----------------------------------------------------

        const [updatedRows] = await db.query(`
            SELECT
                pd.discount_id,
                pd.business_id,
                pd.branch_id,
                pd.product_id,
                p.product_name,
                p.selling_price,
                pd.discount,
                pd.reason,
                pd.created_at,
                pd.updated_at

            FROM product_discount pd

            INNER JOIN products p
                ON p.product_id = pd.product_id
               AND p.business_id = pd.business_id

            WHERE pd.business_id = ?
              AND pd.product_id = ?

              AND (
                    pd.branch_id = ?
                    OR (
                        pd.branch_id IS NULL
                        AND ? IS NULL
                    )
                  )

            ORDER BY
                CASE
                    WHEN pd.branch_id = ? THEN 0
                    WHEN pd.branch_id IS NULL THEN 1
                    ELSE 2
                END

            LIMIT 1
        `, [
            businessId,
            productId,
            branchId,
            branchId,
            branchId
        ]);


        res.json({
            success: true,
            message:
                'Product discount setting updated successfully.',
            productDiscount:
                updatedRows[0] || null
        });


    } catch (error) {

        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error(
                'Product discount rollback error:',
                rollbackError
            );
        }


        console.error(
            'Error updating product discount setting:',
            error
        );


        res.status(500).json({
            success: false,
            message:
                error.sqlMessage ||
                error.message ||
                'Unable to update product discount setting.'
        });


    } finally {

        connection.release();
    }
};



// ============================================================
// SYNCHRONIZE PRODUCT NAMES
// ============================================================
//
// Synchronizes product_discount.product_name only inside the
// authenticated business.
//
// ============================================================

exports.syncProductDiscountNames = async (req, res) => {

    try {

        const businessId = getBusinessId(req);


        if (
            !Number.isInteger(businessId) ||
            businessId <= 0
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Invalid business context.'
            });
        }


        const [result] = await db.query(`
            UPDATE product_discount pd

            INNER JOIN products p
                ON p.product_id = pd.product_id
               AND p.business_id = pd.business_id

            SET
                pd.product_name = p.product_name

            WHERE pd.business_id = ?
        `, [
            businessId
        ]);


        res.json({
            success: true,
            message:
                'Product discount names synchronized successfully.',
            updatedRows:
                result.affectedRows
        });


    } catch (error) {

        console.error(
            'Error synchronizing product discount names:',
            error
        );


        res.status(500).json({
            success: false,
            message:
                'Unable to synchronize product discount names.'
        });
    }
};