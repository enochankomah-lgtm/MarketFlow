const db = require("../Database/db");

/*
|--------------------------------------------------------------------------
| MARKETFLOW - LOAD VEHICLE CONTROLLER
|--------------------------------------------------------------------------
| This controller intentionally handles ONLY the Load Vehicle workflow.
|
| Other stock operations will be added later:
|   1. Unload Vehicle
|   2. Branch Transfer
|   3. Adjustment
|   4. Damaged
|   5. Spoiled
|   6. Expired
|   7. Customer Return
|   8. Supplier Return
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| AUTHORIZATION HELPERS
|--------------------------------------------------------------------------
*/

function getUser(req) {
    return req.user || req.session?.user || null;
}


function requireBusinessUser(req, res) {
    const user = getUser(req);

    if (!user || !user.business_id) {
        res.status(401).json({
            success: false,
            message: "Unauthorized."
        });

        return null;
    }

    return user;
}


function requireProductManager(req, res) {
    const user = requireBusinessUser(req);

    if (!user) {
        return null;
    }

    const role = String(user.RoleName || "").trim().toLowerCase();

    const allowedRoles = [
        "owner",
        "admin",
        "administrator",
        "manager"
    ];

    if (!allowedRoles.includes(role)) {
        res.status(403).json({
            success: false,
            message: "You do not have permission to perform this action."
        });

        return null;
    }

    return user;
}


/*
|--------------------------------------------------------------------------
| VALIDATION HELPERS
|--------------------------------------------------------------------------
*/

function validId(value) {
    return Number.isInteger(Number(value)) && Number(value) > 0;
}


function validQuantity(value) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0;
}


function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}


function roundQuantity(value) {
    return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}


function cleanText(value, maxLength = 255) {
    return String(value || "")
        .trim()
        .slice(0, maxLength);
}


/*
|--------------------------------------------------------------------------
| DATABASE HELPERS
|--------------------------------------------------------------------------
*/

async function getBranch(connection, businessId, branchId) {
    const [rows] = await connection.query(
        `
        SELECT
            branch_id,
            business_id,
            branch_name,
            location,
            is_active
        FROM branches
        WHERE branch_id = ?
          AND business_id = ?
          AND is_active = 1
        LIMIT 1
        FOR UPDATE
        `,
        [branchId, businessId]
    );

    return rows[0] || null;
}


async function getVehicleForLoad(
    connection,
    businessId,
    vehicleLocationId,
    lock = true
) {
    const lockClause = lock ? "FOR UPDATE" : "";

    const [rows] = await connection.query(
        `
        SELECT
            location_id,
            business_id,
            location_type,
            location_name,
            description,
            is_active AS active
        FROM movement_locations
        WHERE location_id = ?
          AND business_id = ?
          AND location_type = 'VEHICLE'
        LIMIT 1
        ${lockClause}
        `,
        [vehicleLocationId, businessId]
    );

    return rows[0] || null;
}


async function createMovement(connection, data) {
    const [result] = await connection.query(
        `
        INSERT INTO inventory_movements (
            business_id,
            movement_type,
            source_type,
            source_branch_id,
            source_location_id,
            destination_type,
            destination_branch_id,
            destination_location_id,
            status,
            reference_type,
            reference_id,
            notes,
            performed_by,
            completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            data.business_id,
            data.movement_type,
            data.source_type || null,
            data.source_branch_id || null,
            data.source_location_id || null,
            data.destination_type || null,
            data.destination_branch_id || null,
            data.destination_location_id || null,
            data.status || "COMPLETED",
            data.reference_type || null,
            data.reference_id || null,
            data.notes || null,
            data.performed_by,
            data.completed_at || null
        ]
    );

    return result.insertId;
}


async function createMovementItem(connection, data) {
    const [result] = await connection.query(
        `
        INSERT INTO inventory_movement_items (
            movement_id,
            business_id,
            product_id,
            source_stock_id,
            source_vehicle_stock_id,
            quantity
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            data.movement_id,
            data.business_id,
            data.product_id,
            data.source_stock_id || null,
            data.source_vehicle_stock_id || null,
            data.quantity
        ]
    );

    return result.insertId;
}


/*
|--------------------------------------------------------------------------
| GET VEHICLES
|--------------------------------------------------------------------------
*/

exports.getVehicles = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    try {
        const [vehicles] = await db.query(
            `
            SELECT
    ml.location_id,
    ml.business_id,
    ml.location_type,
    ml.location_name,
    ml.description,
    ml.is_active AS active,

    COALESCE(
        SUM(
            CASE
                WHEN vs.quantity_available > 0
                THEN vs.quantity_available
                ELSE 0
            END
        ),
        0
    ) AS current_stock_quantity

FROM movement_locations ml

LEFT JOIN vehicle_stock vs
    ON vs.vehicle_location_id = ml.location_id
   AND vs.business_id = ml.business_id

WHERE ml.business_id = ?
  AND ml.location_type = 'VEHICLE'

GROUP BY
    ml.location_id,
    ml.business_id,
    ml.location_type,
    ml.location_name,
    ml.description,
    ml.is_active

ORDER BY
    ml.is_active DESC,
    ml.location_name ASC
            `,
            [user.business_id]
        );

        return res.json({
            success: true,
            vehicles
        });

    } catch (error) {
        console.error("getVehicles error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load vehicles."
        });
    }
};


/*
|--------------------------------------------------------------------------
| REGISTER VEHICLE
|--------------------------------------------------------------------------
*/

exports.registerVehicle = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    const vehicleName = cleanText(
        req.body.vehicle_name || req.body.location_name,
        150
    );

    const description = cleanText(
        req.body.description,
        255
    );

    if (!vehicleName) {
        return res.status(400).json({
            success: false,
            message: "Vehicle name is required."
        });
    }

    let connection;

    try {
        connection = await db.getConnection();

        const [existing] = await connection.query(
            `
            SELECT location_id
            FROM movement_locations
            WHERE business_id = ?
              AND location_type = 'VEHICLE'
              AND LOWER(location_name) = LOWER(?)
            LIMIT 1
            `,
            [user.business_id, vehicleName]
        );

        if (existing.length) {
            return res.status(409).json({
                success: false,
                message: "A vehicle with this name already exists."
            });
        }

        const [result] = await connection.query(
            `
            INSERT INTO movement_locations (
                business_id,
                location_type,
                location_name,
                description,
                is_active
            )
            VALUES (?, 'VEHICLE', ?, ?, 1)
            `,
            [
                user.business_id,
                vehicleName,
                description || null
            ]
        );

        const [vehicles] = await connection.query(
            `
            SELECT
                location_id,
                business_id,
                location_type,
                location_name,
                description,
                is_active AS active
            FROM movement_locations
            WHERE location_id = ?
            AND business_id = ?
            AND location_type = 'VEHICLE'
            LIMIT 1
            `,
            [
                result.insertId,
                user.business_id
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Vehicle registered successfully.",
            vehicle: vehicles[0]
        });

    } catch (error) {
        console.error("registerVehicle error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to register vehicle."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};


/*
|--------------------------------------------------------------------------
| UPDATE VEHICLE
|--------------------------------------------------------------------------
*/

exports.updateVehicle = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    const vehicleId = req.params.vehicleId;

    if (!validId(vehicleId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid vehicle ID."
        });
    }

    const vehicleName = cleanText(
        req.body.vehicle_name || req.body.location_name,
        150
    );

    const description = cleanText(
        req.body.description,
        255
    );

    if (!vehicleName) {
        return res.status(400).json({
            success: false,
            message: "Vehicle name is required."
        });
    }

    let connection;

    try {
        connection = await db.getConnection();

        const vehicle = await getVehicleForLoad(
            connection,
            user.business_id,
            vehicleId,
            true
        );

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: "Vehicle not found."
            });
        }

        const [duplicate] = await connection.query(
            `
            SELECT location_id
            FROM movement_locations
            WHERE business_id = ?
              AND location_type = 'VEHICLE'
              AND LOWER(location_name) = LOWER(?)
              AND location_id <> ?
            LIMIT 1
            `,
            [
                user.business_id,
                vehicleName,
                vehicleId
            ]
        );

        if (duplicate.length) {
            return res.status(409).json({
                success: false,
                message: "Another vehicle already uses this name."
            });
        }

        await connection.query(
            `
            UPDATE movement_locations
            SET
                location_name = ?,
                description = ?
            WHERE location_id = ?
              AND business_id = ?
              AND location_type = 'VEHICLE'
            `,
            [
                vehicleName,
                description || null,
                vehicleId,
                user.business_id
            ]
        );

        const updatedVehicle = await getVehicleForLoad(
            connection,
            user.business_id,
            vehicleId,
            false
        );

        return res.json({
            success: true,
            message: "Vehicle updated successfully.",
            vehicle: updatedVehicle
        });

    } catch (error) {
        console.error("updateVehicle error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update vehicle."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};


/*
|--------------------------------------------------------------------------
| ACTIVATE / DEACTIVATE VEHICLE
|--------------------------------------------------------------------------
*/

exports.setVehicleStatus = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    const vehicleId = req.params.vehicleId;

    if (!validId(vehicleId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid vehicle ID."
        });
    }

    const active =
        req.body.active === true ||
        req.body.active === 1 ||
        req.body.active === "1" ||
        req.body.active === "true";

    let connection;

    try {
        connection = await db.getConnection();

        await connection.beginTransaction();

        const vehicle = await getVehicleForLoad(
            connection,
            user.business_id,
            vehicleId,
            true
        );

        if (!vehicle) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Vehicle not found."
            });
        }

        if (!active) {
            const [stockRows] = await connection.query(
                `
                SELECT
                    COALESCE(SUM(quantity_available), 0) AS total_quantity
                FROM vehicle_stock
                WHERE business_id = ?
                  AND vehicle_location_id = ?
                `,
                [
                    user.business_id,
                    vehicleId
                ]
            );

            const totalQuantity =
                Number(stockRows[0]?.total_quantity || 0);

            if (totalQuantity > 0) {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "This vehicle cannot be deactivated while it still has available stock."
                });
            }
        }

        await connection.query(
            `
            UPDATE movement_locations
            SET is_active = ?
            WHERE location_id = ?
              AND business_id = ?
              AND location_type = 'VEHICLE'
            `,
            [
                active ? 1 : 0,
                vehicleId,
                user.business_id
            ]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: active
                ? "Vehicle activated successfully."
                : "Vehicle deactivated successfully.",
            active
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("setVehicleStatus error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update vehicle status."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};


/*
|--------------------------------------------------------------------------
| GET SOURCE BRANCHES
|--------------------------------------------------------------------------
*/

exports.getLoadVehicleBranches = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    try {
        const [branches] = await db.query(
            `
            SELECT
                branch_id,
                branch_name,
                location,
                is_active
            FROM branches
            WHERE business_id = ?
              AND is_active = 1
            ORDER BY branch_name ASC
            `,
            [user.business_id]
        );

        return res.json({
            success: true,
            branches
        });

    } catch (error) {
        console.error("getLoadVehicleBranches error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load branches."
        });
    }
};


/*
|--------------------------------------------------------------------------
| PRODUCT PICKER
|--------------------------------------------------------------------------
|
| Returns batch-level stock.
|
| The browser can select a particular stock/batch.
| The final load still validates everything again inside a transaction.
|--------------------------------------------------------------------------
*/

exports.getVehicleLoadProducts = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    const branchId = req.query.branch_id;

    if (!validId(branchId)) {
        return res.status(400).json({
            success: false,
            message: "A valid source branch is required."
        });
    }

    const search = cleanText(req.query.search, 100);
    const category = cleanText(req.query.category, 100);

    try {
        const [branchRows] = await db.query(
            `
            SELECT
                branch_id,
                branch_name
            FROM branches
            WHERE branch_id = ?
              AND business_id = ?
              AND is_active = 1
            LIMIT 1
            `,
            [
                branchId,
                user.business_id
            ]
        );

        if (!branchRows.length) {
            return res.status(404).json({
                success: false,
                message: "Source branch not found."
            });
        }

        let sql = `
            SELECT
                s.stock_id,
                s.product_id,
                s.batch_number,
                s.quantity_received,
                s.quantity_available,
                s.stock_date,
                s.expiry_date,

                p.product_name,
                p.category,
                p.brand,
                p.unit,
                p.product_image,
                p.cost_price,
                p.selling_price,
                p.msrp

            FROM stock s

            INNER JOIN products p
                ON p.product_id = s.product_id
               AND p.business_id = s.business_id

            WHERE s.business_id = ?
              AND s.branch_id = ?
              AND s.quantity_available > 0
        `;

        const params = [
            user.business_id,
            branchId
        ];

        if (search) {
            sql += `
                AND (
                    p.product_name LIKE ?
                    OR p.category LIKE ?
                    OR p.brand LIKE ?
                    OR s.batch_number LIKE ?
                )
            `;

            const term = `%${search}%`;

            params.push(
                term,
                term,
                term,
                term
            );
        }

        if (category) {
            sql += `
                AND p.category = ?
            `;

            params.push(category);
        }

        sql += `
            ORDER BY
                p.product_name ASC,
                s.stock_date ASC,
                s.stock_id ASC
        `;

        const [products] = await db.query(
            sql,
            params
        );

        const [categoryRows] = await db.query(
            `
            SELECT DISTINCT
                p.category
            FROM stock s
            INNER JOIN products p
                ON p.product_id = s.product_id
               AND p.business_id = s.business_id
            WHERE s.business_id = ?
              AND s.branch_id = ?
              AND s.quantity_available > 0
              AND p.category IS NOT NULL
              AND TRIM(p.category) <> ''
            ORDER BY p.category ASC
            `,
            [
                user.business_id,
                branchId
            ]
        );

        const [summaryRows] = await db.query(
            `
            SELECT
                COUNT(DISTINCT s.product_id) AS product_count,
                COALESCE(SUM(s.quantity_available), 0) AS total_quantity
            FROM stock s
            WHERE s.business_id = ?
              AND s.branch_id = ?
              AND s.quantity_available > 0
            `,
            [
                user.business_id,
                branchId
            ]
        );

        return res.json({
            success: true,

            branch: branchRows[0],

            products,

            categories: categoryRows
                .map(row => row.category)
                .filter(Boolean),

            summary: {
                product_count:
                    Number(summaryRows[0]?.product_count || 0),

                total_quantity:
                    Number(summaryRows[0]?.total_quantity || 0)
            }
        });

    } catch (error) {
        console.error("getVehicleLoadProducts error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load available products."
        });
    }
};


/*
|--------------------------------------------------------------------------
| LOAD VEHICLE
|--------------------------------------------------------------------------
|
| ONE authoritative transaction.
|
| Supports:
|
| products: [
|   {
|       product_id: 10,
|       stock_id: 25,
|       quantity: 5
|   }
| ]
|
| stock_id is optional.
|
| If stock_id is supplied:
|   The exact selected batch is loaded.
|
| If stock_id is omitted:
|   Server allocates FIFO.
|--------------------------------------------------------------------------
*/

exports.loadVehicle = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    const sourceBranchId = req.body.source_branch_id;
    const vehicleLocationId = req.body.vehicle_location_id;
    const notes = cleanText(req.body.notes, 255);

    let requestedProducts = req.body.products;

    /*
    |--------------------------------------------------------------------------
    | Backward compatibility with the old single-product payload
    |--------------------------------------------------------------------------
    */

    if (!Array.isArray(requestedProducts)) {
        requestedProducts = [];
    }

    if (
        requestedProducts.length === 0 &&
        validId(req.body.product_id) &&
        validQuantity(req.body.quantity)
    ) {
        requestedProducts = [
            {
                product_id: Number(req.body.product_id),
                quantity: Number(req.body.quantity),
                stock_id: validId(req.body.stock_id)
                    ? Number(req.body.stock_id)
                    : null
            }
        ];
    }

    if (!validId(sourceBranchId)) {
        return res.status(400).json({
            success: false,
            message: "A valid source branch is required."
        });
    }

    if (!validId(vehicleLocationId)) {
        return res.status(400).json({
            success: false,
            message: "A valid vehicle is required."
        });
    }

    if (
        !Array.isArray(requestedProducts) ||
        requestedProducts.length === 0
    ) {
        return res.status(400).json({
            success: false,
            message: "At least one product is required."
        });
    }

    if (requestedProducts.length > 100) {
        return res.status(400).json({
            success: false,
            message: "A maximum of 100 product lines can be loaded at once."
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Normalize and validate request
    |--------------------------------------------------------------------------
    */

    const normalizedProducts = [];

    const duplicateKeys = new Set();

    for (const item of requestedProducts) {
        const productId = Number(item.product_id);
        const stockId = validId(item.stock_id)
            ? Number(item.stock_id)
            : null;

        const quantity = Number(item.quantity);

        if (!validId(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID."
            });
        }

        if (!validQuantity(quantity)) {
            return res.status(400).json({
                success: false,
                message: "Every product must have a quantity greater than zero."
            });
        }

        const duplicateKey = stockId
            ? `stock:${stockId}`
            : `product:${productId}`;

        if (duplicateKeys.has(duplicateKey)) {
            return res.status(400).json({
                success: false,
                message: "Duplicate product/stock selection detected."
            });
        }

        duplicateKeys.add(duplicateKey);

        normalizedProducts.push({
            product_id: productId,
            stock_id: stockId,
            quantity: roundQuantity(quantity)
        });
    }

    let connection;

    try {
        connection = await db.getConnection();

        await connection.beginTransaction();

        /*
        |--------------------------------------------------------------------------
        | Validate source branch
        |--------------------------------------------------------------------------
        */

        const sourceBranch = await getBranch(
            connection,
            user.business_id,
            sourceBranchId
        );

        if (!sourceBranch) {
            throw new Error("SOURCE_BRANCH_NOT_FOUND");
        }

        /*
        |--------------------------------------------------------------------------
        | Validate vehicle
        |--------------------------------------------------------------------------
        */

        const vehicle = await getVehicleForLoad(
            connection,
            user.business_id,
            vehicleLocationId,
            true
        );

        if (!vehicle) {
            throw new Error("VEHICLE_NOT_FOUND");
        }

        if (!vehicle.active) {
            throw new Error("VEHICLE_INACTIVE");
        }

        /*
        |--------------------------------------------------------------------------
        | Prepare final batch allocations
        |--------------------------------------------------------------------------
        */

        const allocations = [];

        const executiveProducts = [];

        let totalQuantity = 0;
        let totalCost = 0;
        let totalRevenue = 0;

        for (const requested of normalizedProducts) {

            /*
            ------------------------------------------------------------------
            | Exact batch requested
            ------------------------------------------------------------------
            */

            if (requested.stock_id) {

                const [rows] = await connection.query(
                    `
                    SELECT
                        s.stock_id,
                        s.business_id,
                        s.product_id,
                        s.branch_id,
                        s.batch_number,
                        s.quantity_received,
                        s.quantity_available,
                        s.stock_date,
                        s.expiry_date,

                        p.product_name,
                        p.category,
                        p.cost_price,
                        p.selling_price

                    FROM stock s

                    INNER JOIN products p
                        ON p.product_id = s.product_id
                       AND p.business_id = s.business_id

                    WHERE s.stock_id = ?
                      AND s.business_id = ?
                      AND s.branch_id = ?
                      AND s.product_id = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        requested.stock_id,
                        user.business_id,
                        sourceBranchId,
                        requested.product_id
                    ]
                );

                if (!rows.length) {
                    throw new Error(
                        `STOCK_NOT_FOUND:${requested.stock_id}`
                    );
                }

                const stockRow = rows[0];

                if (
                    Number(stockRow.quantity_available) <
                    requested.quantity
                ) {
                    throw new Error(
                        `INSUFFICIENT_STOCK:${stockRow.product_name}`
                    );
                }

                const quantity = requested.quantity;

                const cost =
                    roundMoney(
                        quantity *
                        Number(stockRow.cost_price)
                    );

                const revenue =
                    roundMoney(
                        quantity *
                        Number(stockRow.selling_price)
                    );

                allocations.push({
                    stock_id: stockRow.stock_id,
                    product_id: stockRow.product_id,
                    product_name: stockRow.product_name,
                    batch_number: stockRow.batch_number,
                    stock_date: stockRow.stock_date,
                    expiry_date: stockRow.expiry_date,
                    quantity,
                    cost_price: Number(stockRow.cost_price),
                    selling_price: Number(stockRow.selling_price),
                    cost,
                    revenue
                });

                totalQuantity += quantity;
                totalCost += cost;
                totalRevenue += revenue;

                continue;
            }

            /*
            ------------------------------------------------------------------
            | No exact batch supplied.
            |
            | Allocate FIFO from the source branch.
            ------------------------------------------------------------------
            */

            const [stockRows] = await connection.query(
                `
                SELECT
                    s.stock_id,
                    s.business_id,
                    s.product_id,
                    s.branch_id,
                    s.batch_number,
                    s.quantity_received,
                    s.quantity_available,
                    s.stock_date,
                    s.expiry_date,

                    p.product_name,
                    p.category,
                    p.cost_price,
                    p.selling_price

                FROM stock s

                INNER JOIN products p
                    ON p.product_id = s.product_id
                   AND p.business_id = s.business_id

                WHERE s.business_id = ?
                  AND s.branch_id = ?
                  AND s.product_id = ?
                  AND s.quantity_available > 0

                ORDER BY
                    s.stock_date ASC,
                    s.stock_id ASC

                FOR UPDATE
                `,
                [
                    user.business_id,
                    sourceBranchId,
                    requested.product_id
                ]
            );

            let remaining = requested.quantity;

            for (const stockRow of stockRows) {

                if (remaining <= 0) {
                    break;
                }

                const available =
                    Number(stockRow.quantity_available);

                const allocatedQuantity =
                    Math.min(
                        remaining,
                        available
                    );

                const quantity =
                    roundQuantity(allocatedQuantity);

                const cost =
                    roundMoney(
                        quantity *
                        Number(stockRow.cost_price)
                    );

                const revenue =
                    roundMoney(
                        quantity *
                        Number(stockRow.selling_price)
                    );

                allocations.push({
                    stock_id: stockRow.stock_id,
                    product_id: stockRow.product_id,
                    product_name: stockRow.product_name,
                    batch_number: stockRow.batch_number,
                    stock_date: stockRow.stock_date,
                    expiry_date: stockRow.expiry_date,
                    quantity,
                    cost_price: Number(stockRow.cost_price),
                    selling_price: Number(stockRow.selling_price),
                    cost,
                    revenue
                });

                remaining =
                    roundQuantity(
                        remaining - quantity
                    );

                totalQuantity += quantity;
                totalCost += cost;
                totalRevenue += revenue;
            }

            if (remaining > 0) {
                throw new Error(
                    `INSUFFICIENT_STOCK:${requested.product_id}`
                );
            }
        }

        /*
        |--------------------------------------------------------------------------
        | Group executive figures by product
        |--------------------------------------------------------------------------
        */

        const productMap = new Map();

        for (const allocation of allocations) {

            if (!productMap.has(allocation.product_id)) {
                productMap.set(
                    allocation.product_id,
                    {
                        product_id: allocation.product_id,
                        product_name: allocation.product_name,
                        quantity: 0,
                        cost: 0,
                        revenue: 0,
                        profit: 0,
                        batches: []
                    }
                );
            }

            const product =
                productMap.get(allocation.product_id);

            product.quantity =
                roundQuantity(
                    product.quantity +
                    allocation.quantity
                );

            product.cost =
                roundMoney(
                    product.cost +
                    allocation.cost
                );

            product.revenue =
                roundMoney(
                    product.revenue +
                    allocation.revenue
                );

            product.profit =
                roundMoney(
                    product.revenue -
                    product.cost
                );

            product.batches.push({
                stock_id: allocation.stock_id,
                batch_number: allocation.batch_number,
                quantity: allocation.quantity,
                cost: allocation.cost,
                revenue: allocation.revenue,
                profit:
                    roundMoney(
                        allocation.revenue -
                        allocation.cost
                    )
            });
        }

        executiveProducts.push(
            ...Array.from(productMap.values())
        );

        totalQuantity = roundQuantity(totalQuantity);
        totalCost = roundMoney(totalCost);
        totalRevenue = roundMoney(totalRevenue);

        const totalProfit =
            roundMoney(
                totalRevenue -
                totalCost
            );

        /*
        |--------------------------------------------------------------------------
        | Create ONE inventory movement
        |--------------------------------------------------------------------------
        */

        const movementId = await createMovement(
            connection,
            {
                business_id: user.business_id,

                movement_type: "LOAD",

                source_type: "BRANCH",
                source_branch_id: sourceBranchId,

                destination_type: "VEHICLE",
                destination_location_id: vehicleLocationId,

                status: "COMPLETED",

                reference_type: "VEHICLE_LOAD",

                notes: notes || null,

                performed_by: user.UserID,

                completed_at: new Date()
            }
        );

        /*
        |--------------------------------------------------------------------------
        | Apply every stock allocation
        |--------------------------------------------------------------------------
        */

        const movementItems = [];

        for (const allocation of allocations) {

            /*
            ------------------------------------------------------------------
            | Decrease source branch stock
            ------------------------------------------------------------------
            */

            const [stockUpdate] = await connection.query(
                `
                UPDATE stock
                SET quantity_available =
                    quantity_available - ?
                WHERE stock_id = ?
                  AND business_id = ?
                  AND branch_id = ?
                  AND quantity_available >= ?
                `,
                [
                    allocation.quantity,
                    allocation.stock_id,
                    user.business_id,
                    sourceBranchId,
                    allocation.quantity
                ]
            );

            if (stockUpdate.affectedRows !== 1) {
                throw new Error(
                    `STOCK_UPDATE_FAILED:${allocation.stock_id}`
                );
            }

            /*
            ------------------------------------------------------------------
            | Find existing vehicle stock row.
            |
            | Unique key:
            | vehicle_location_id + product_id + source_stock_id
            ------------------------------------------------------------------
            */

            const [vehicleStockRows] = await connection.query(
                `
                SELECT
                    vehicle_stock_id,
                    quantity_available,
                    quantity_received
                FROM vehicle_stock
                WHERE business_id = ?
                  AND vehicle_location_id = ?
                  AND product_id = ?
                  AND source_stock_id = ?
                LIMIT 1
                FOR UPDATE
                `,
                [
                    user.business_id,
                    vehicleLocationId,
                    allocation.product_id,
                    allocation.stock_id
                ]
            );

            let vehicleStockId;

            if (vehicleStockRows.length) {

                vehicleStockId =
                    vehicleStockRows[0].vehicle_stock_id;

                await connection.query(
                    `
                    UPDATE vehicle_stock
                    SET
                        quantity_received =
                            quantity_received + ?,

                        quantity_available =
                            quantity_available + ?

                    WHERE vehicle_stock_id = ?
                      AND business_id = ?
                    `,
                    [
                        allocation.quantity,
                        allocation.quantity,
                        vehicleStockId,
                        user.business_id
                    ]
                );

            } else {

                const [vehicleStockInsert] =
                    await connection.query(
                        `
                        INSERT INTO vehicle_stock (
                            business_id,
                            vehicle_location_id,
                            product_id,
                            source_stock_id,
                            batch_number,
                            quantity_received,
                            stock_date,
                            expiry_date,
                            quantity_available
                        )
                        SELECT
                            ?,
                            ?,
                            s.product_id,
                            s.stock_id,
                            s.batch_number,
                            ?,
                            s.stock_date,
                            s.expiry_date,
                            ?
                        FROM stock s
                        WHERE s.stock_id = ?
                          AND s.business_id = ?
                        `,
                        [
                            user.business_id,
                            vehicleLocationId,
                            allocation.quantity,
                            allocation.quantity,
                            allocation.stock_id,
                            user.business_id
                        ]
                    );

                if (vehicleStockInsert.affectedRows !== 1) {
                    throw new Error(
                        `VEHICLE_STOCK_INSERT_FAILED:${allocation.stock_id}`
                    );
                }

                vehicleStockId =
                    vehicleStockInsert.insertId;
            }

            /*
            ------------------------------------------------------------------
            | Inventory movement item
            ------------------------------------------------------------------
            */

            const movementItemId =
                await createMovementItem(
                    connection,
                    {
                        movement_id: movementId,
                        business_id: user.business_id,
                        product_id: allocation.product_id,
                        source_stock_id: allocation.stock_id,
                        source_vehicle_stock_id: vehicleStockId,
                        quantity: allocation.quantity
                    }
                );

            movementItems.push({
                movement_item_id: movementItemId,
                vehicle_stock_id: vehicleStockId,
                stock_id: allocation.stock_id,
                product_id: allocation.product_id,
                product_name: allocation.product_name,
                batch_number: allocation.batch_number,
                quantity: allocation.quantity
            });

            /*
            ------------------------------------------------------------------
            | Existing stock movement audit ledger
            |--------------------------------------------------------------------------
            | stock_movements is the branch-side physical movement audit.
            | The authoritative vehicle destination remains in
            | inventory_movements + vehicle_stock.
            ------------------------------------------------------------------
            */

            await connection.query(
                `
                INSERT INTO stock_movements (
                    business_id,
                    product_id,
                    stock_id,
                    branch_id,
                    movement_type,
                    movement_reason,
                    quantity,
                    reference_type,
                    reference_id,
                    from_branch_id,
                    to_branch_id,
                    performed_by,
                    reason
                )
                VALUES (?, ?, ?, ?, 'OUT', 'TRANSFER', ?, ?, ?, ?, NULL, ?, ?)
                `,
                [
                    user.business_id,
                    allocation.product_id,
                    allocation.stock_id,
                    sourceBranchId,
                    allocation.quantity,
                    "VEHICLE_LOAD",
                    movementId,
                    sourceBranchId,
                    user.UserID,
                    notes || "Loaded into vehicle"
                ]
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Commit everything together
        |--------------------------------------------------------------------------
        */

        await connection.commit();

        return res.status(201).json({
            success: true,

            message: "Vehicle loaded successfully.",

            movement_id: movementId,

            vehicle: {
                location_id: vehicle.location_id,
                location_name: vehicle.location_name
            },

            source_branch: {
                branch_id: sourceBranch.branch_id,
                branch_name: sourceBranch.branch_name
            },

            summary: {
                products: executiveProducts.length,
                quantity: totalQuantity,
                total_cost: totalCost,
                potential_revenue: totalRevenue,
                potential_profit: totalProfit
            },

            products: executiveProducts,

            movement_items: movementItems
        });

    } catch (error) {

        if (connection) {
            await connection.rollback();
        }

        console.error("loadVehicle error:", error);

        if (error.message === "SOURCE_BRANCH_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "Source branch not found."
            });
        }

        if (error.message === "VEHICLE_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "Vehicle not found."
            });
        }

        if (error.message === "VEHICLE_INACTIVE") {
            return res.status(409).json({
                success: false,
                message: "The selected vehicle is inactive."
            });
        }

        if (error.message.startsWith("STOCK_NOT_FOUND:")) {
            return res.status(409).json({
                success: false,
                message: "One of the selected stock batches is no longer available."
            });
        }

        if (error.message.startsWith("INSUFFICIENT_STOCK:")) {
            return res.status(409).json({
                success: false,
                message:
                    "The requested quantity is greater than the available stock."
            });
        }

        return res.status(500).json({
            success: false,
            message:
                "The vehicle load could not be completed. No partial stock movement was saved."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};


/*
|--------------------------------------------------------------------------
| VEHICLE STOCK
|--------------------------------------------------------------------------
*/

exports.getVehicleStock = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    const vehicleId =
        req.query.vehicle_location_id ||
        req.query.vehicle_id;

    if (!validId(vehicleId)) {
        return res.status(400).json({
            success: false,
            message: "A valid vehicle is required."
        });
    }

    try {
        const [vehicleRows] = await db.query(
            `
            SELECT
                location_id,
                location_name,
                description,
                is_active AS active
            FROM movement_locations
            WHERE location_id = ?
              AND business_id = ?
              AND location_type = 'VEHICLE'
            LIMIT 1
            `,
            [
                vehicleId,
                user.business_id
            ]
        );

        if (!vehicleRows.length) {
            return res.status(404).json({
                success: false,
                message: "Vehicle not found."
            });
        }

        const [stockRows] = await db.query(
            `
            SELECT
                vs.vehicle_stock_id,
                vs.product_id,
                vs.source_stock_id,
                vs.batch_number,
                vs.quantity_received,
                vs.quantity_available,
                vs.stock_date,
                vs.expiry_date,

                p.product_name,
                p.category,
                p.unit,
                p.cost_price,
                p.selling_price

            FROM vehicle_stock vs

            INNER JOIN products p
                ON p.product_id = vs.product_id
               AND p.business_id = vs.business_id

            WHERE vs.business_id = ?
              AND vs.vehicle_location_id = ?
              AND vs.quantity_available > 0

            ORDER BY
                p.product_name ASC,
                vs.stock_date ASC,
                vs.vehicle_stock_id ASC
            `,
            [
                user.business_id,
                vehicleId
            ]
        );

        let totalQuantity = 0;
        let totalCost = 0;
        let totalSales = 0;

        const stock = stockRows.map(row => {

            const quantity =
                Number(row.quantity_available || 0);

            const cost =
                roundMoney(
                    quantity *
                    Number(row.cost_price || 0)
                );

            const sales =
                roundMoney(
                    quantity *
                    Number(row.selling_price || 0)
                );

            totalQuantity += quantity;
            totalCost += cost;
            totalSales += sales;

            return {
                ...row,
                value: cost,
                potential_revenue: sales,
                potential_profit:
                    roundMoney(sales - cost)
            };
        });

        return res.json({
            success: true,

            vehicle: vehicleRows[0],

            summary: {
                total_quantity:
                    roundQuantity(totalQuantity),

                total_cost:
                    roundMoney(totalCost),

                potential_sales:
                    roundMoney(totalSales),

                potential_profit:
                    roundMoney(totalSales - totalCost)
            },

            stock
        });

    } catch (error) {
        console.error("getVehicleStock error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load vehicle stock."
        });
    }
};


/*
|--------------------------------------------------------------------------
| LOAD HISTORY
|--------------------------------------------------------------------------
*/

exports.getVehicleLoadHistory = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    const vehicleId = validId(req.query.vehicle_location_id)
        ? Number(req.query.vehicle_location_id)
        : null;

    try {
        const params = [user.business_id];

        let sql = `
            SELECT
                im.movement_id,
                im.created_at,
                im.completed_at,
                im.status,
                im.notes,

                im.source_branch_id,
                b.branch_name AS source_branch_name,

                im.destination_location_id,
                ml.location_name AS vehicle_name,

                COUNT(DISTINCT imi.product_id) AS product_count,

                COALESCE(
                    SUM(imi.quantity),
                    0
                ) AS total_quantity

            FROM inventory_movements im

            LEFT JOIN branches b
                ON b.branch_id = im.source_branch_id
               AND b.business_id = im.business_id

            LEFT JOIN movement_locations ml
                ON ml.location_id = im.destination_location_id
               AND ml.business_id = im.business_id
               AND ml.location_type = 'VEHICLE'

            LEFT JOIN inventory_movement_items imi
                ON imi.movement_id = im.movement_id
               AND imi.business_id = im.business_id

            WHERE im.business_id = ?
              AND im.movement_type = 'LOAD'
              AND im.reference_type = 'VEHICLE_LOAD'
        `;

        if (vehicleId) {
            sql += `
                AND im.destination_location_id = ?
            `;

            params.push(vehicleId);
        }

        sql += `
            GROUP BY
                im.movement_id,
                im.created_at,
                im.completed_at,
                im.status,
                im.notes,
                im.source_branch_id,
                b.branch_name,
                im.destination_location_id,
                ml.location_name

            ORDER BY im.created_at DESC
        `;

        const [history] = await db.query(
            sql,
            params
        );

        /*
        |--------------------------------------------------------------------------
        | Get product details for each load
        |--------------------------------------------------------------------------
        */

        for (const row of history) {

            const [items] = await db.query(
                `
                SELECT
                    imi.movement_item_id,
                    imi.product_id,
                    imi.source_stock_id,
                    imi.source_vehicle_stock_id,
                    imi.quantity,

                    p.product_name,

                    s.batch_number,
                    s.expiry_date,

                    p.cost_price,
                    p.selling_price

                FROM inventory_movement_items imi

                INNER JOIN products p
                    ON p.product_id = imi.product_id
                   AND p.business_id = imi.business_id

                LEFT JOIN stock s
                    ON s.stock_id = imi.source_stock_id

                WHERE imi.movement_id = ?
                  AND imi.business_id = ?

                ORDER BY
                    p.product_name ASC,
                    imi.movement_item_id ASC
                `,
                [
                    row.movement_id,
                    user.business_id
                ]
            );

            row.items = items;

            row.total_cost = roundMoney(
                items.reduce(
                    (sum, item) =>
                        sum +
                        (
                            Number(item.quantity) *
                            Number(item.cost_price || 0)
                        ),
                    0
                )
            );

            row.potential_revenue = roundMoney(
                items.reduce(
                    (sum, item) =>
                        sum +
                        (
                            Number(item.quantity) *
                            Number(item.selling_price || 0)
                        ),
                    0
                )
            );

            row.potential_profit = roundMoney(
                row.potential_revenue -
                row.total_cost
            );
        }

        return res.json({
            success: true,
            history
        });

    } catch (error) {
        console.error("getVehicleLoadHistory error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load vehicle history."
        });
    }
};

/* ========================================================================
| UNLOAD VEHICLE BACKEND
| -------------------------------------------------------------------------
| Vehicle -> Destination Branch
|
| IMPORTANT:
| This is intentionally separate from Load Vehicle.
| Do not merge this logic into loadVehicle().
| ======================================================================== */


/*
|--------------------------------------------------------------------------
| GET UNLOAD VEHICLE BRANCHES
|--------------------------------------------------------------------------
| Returns active branches belonging ONLY to the authenticated business.
*/
exports.getUnloadVehicleBranches = async (req, res) => {

    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    try {

        const [rows] = await db.query(
            `
             SELECT
                branch_id,
                branch_name,
                location,
                is_active
            FROM branches
            WHERE business_id = ?
              AND is_active = 1
            ORDER BY branch_name ASC
            `,
            [user.business_id]
        );

        return res.json({
            success: true,
            branches: rows
        });

    } catch (error) {

        console.error(
            "getUnloadVehicleBranches error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load destination branches."
        });
    }
};


/*
|--------------------------------------------------------------------------
| GET PRODUCTS AVAILABLE IN VEHICLE FOR UNLOAD
|--------------------------------------------------------------------------
|
| Query:
|
| /unload-products?vehicle_location_id=1
| /unload-products?vehicle_location_id=1&search=coke
|
| Only stock physically available in the selected vehicle is returned.
*/
exports.getVehicleUnloadProducts = async (req, res) => {

    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    const vehicleLocationId =
        validId(req.query.vehicle_location_id)
            ? Number(req.query.vehicle_location_id)
            : null;

    const search =
        String(req.query.search || "").trim();

    if (!vehicleLocationId) {

        return res.status(400).json({
            success: false,
            message: "Vehicle is required."
        });
    }

    try {       
        const [vehicleRows] = await db.query(
            `
            SELECT
                location_id,
                location_name,
                location_type,
                is_active
            FROM movement_locations
            WHERE location_id = ?
              AND business_id = ?
              AND location_type = 'VEHICLE'
              AND is_active = 1
            LIMIT 1
            `,
            [
                vehicleLocationId,
                user.business_id
            ]
        );

        if (!vehicleRows.length) {
            return res.status(404).json();
        }

        /*
        |--------------------------------------------------------------------------
        | Search vehicle stock.
        |--------------------------------------------------------------------------
        */
        const params = [
            user.business_id,
            vehicleLocationId
        ];

        let searchCondition = "";

        if (search) {

            searchCondition = `
                AND (
                    p.product_name LIKE ?
                    OR p.category LIKE ?
                    OR p.brand LIKE ?
                    OR COALESCE(vs.batch_number, '') LIKE ?
                )
            `;

            const term = `%${search}%`;

            params.push(
                term,
                term,
                term,
                term
            );
        }

        const [rows] = await db.query(
            `
            SELECT

                vs.vehicle_stock_id,

                vs.vehicle_location_id,

                vs.product_id,

                vs.source_stock_id,

                vs.batch_number,

                vs.stock_date,

                vs.expiry_date,

                vs.quantity_received,

                vs.quantity_available,

                p.product_name,

                p.category,

                p.brand,

                p.cost_price,

                p.selling_price

            FROM vehicle_stock vs

            INNER JOIN products p
                ON p.product_id = vs.product_id
               AND p.business_id = vs.business_id

            WHERE vs.business_id = ?
              AND vs.vehicle_location_id = ?
              AND vs.quantity_available > 0

              ${searchCondition}

            ORDER BY
                p.product_name ASC,
                vs.stock_date ASC,
                vs.vehicle_stock_id ASC
            `,
            params
        );

        /*
        |--------------------------------------------------------------------------
        | Calculate values for the UI.
        |--------------------------------------------------------------------------
        */
        let totalQuantity = 0;
        let totalCost = 0;
        let totalRevenue = 0;

        const products = rows.map(row => {

            const quantity =
                Number(row.quantity_available || 0);

            const costPrice =
                Number(row.cost_price || 0);

            const sellingPrice =
                Number(row.selling_price || 0);

            const costValue =
                roundMoney(
                    quantity * costPrice
                );

            const potentialRevenue =
                roundMoney(
                    quantity * sellingPrice
                );

            totalQuantity += quantity;
            totalCost += costValue;
            totalRevenue += potentialRevenue;

            return {
                vehicle_stock_id:
                    row.vehicle_stock_id,

                vehicle_location_id:
                    row.vehicle_location_id,

                product_id:
                    row.product_id,

                source_stock_id:
                    row.source_stock_id,

                product_name:
                    row.product_name,

                category:
                    row.category,

                brand:
                    row.brand,

                batch_number:
                    row.batch_number,

                stock_date:
                    row.stock_date,

                expiry_date:
                    row.expiry_date,

                quantity_available:
                    quantity,

                cost_price:
                    costPrice,

                selling_price:
                    sellingPrice,

                value:
                    costValue,

                potential_revenue:
                    potentialRevenue,

                potential_profit:
                    roundMoney(
                        potentialRevenue -
                        costValue
                    )
            };
        });

        return res.json({

            success: true,

            vehicle: vehicleRows[0],

            summary: {

                total_products:
                    products.length,

                total_quantity:
                    roundQuantity(totalQuantity),

                total_cost:
                    roundMoney(totalCost),

                potential_revenue:
                    roundMoney(totalRevenue),

                potential_profit:
                    roundMoney(
                        totalRevenue -
                        totalCost
                    )
            },

            products
        });

    } catch (error) {

        console.error(
            "getVehicleUnloadProducts error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load vehicle stock."
        });
    }
};

/*
|--------------------------------------------------------------------------
| UNLOAD VEHICLE
|--------------------------------------------------------------------------
*/
exports.unloadVehicle = async (req, res) => {

    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    const {
        vehicle_location_id,
        destination_branch_id,
        products,
        notes
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Basic request validation
    |--------------------------------------------------------------------------
    */
    if (
        !validId(vehicle_location_id) ||
        !validId(destination_branch_id)
    ) {

        return res.status(400).json({
            success: false,
            message: "Vehicle and destination branch are required."
        });
    }

    if (
        !Array.isArray(products) ||
        products.length === 0
    ) {

        return res.status(400).json({
            success: false,
            message: "At least one product is required."
        });
    }

    const businessId =
        user.business_id;

    const vehicleLocationId =
        Number(vehicle_location_id);

    const destinationBranchId =
        Number(destination_branch_id);

    /*
    |--------------------------------------------------------------------------
    | Prevent duplicate vehicle-stock rows in one request.
    |--------------------------------------------------------------------------
    */
    const seenVehicleStockIds =
        new Set();

    for (const item of products) {

        if (
            !item ||
            !validId(item.vehicle_stock_id) ||
            !validId(item.product_id) ||
            !validQuantity(item.quantity)
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Every unload product must have a valid vehicle stock, product, and quantity."
            });
        }

        const vehicleStockId =
            Number(item.vehicle_stock_id);

        if (
            seenVehicleStockIds.has(
                vehicleStockId
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "The same vehicle stock cannot be selected more than once."
            });
        }

        seenVehicleStockIds.add(
            vehicleStockId
        );
    }

    const connection =
        await db.getConnection();

    try {

        await connection.beginTransaction();

        /*
        |--------------------------------------------------------------------------
        | 1. Verify vehicle
        |--------------------------------------------------------------------------
        */
        const [vehicleRows] =
            await connection.query(
                `
                SELECT
                    location_id,
                    business_id,
                    location_name,
                    location_type,
                    is_active
                FROM movement_locations
                WHERE location_id = ?
                  AND business_id = ?
                  AND location_type = 'VEHICLE'
                LIMIT 1
                FOR UPDATE
                `,
                [
                    vehicleLocationId,
                    businessId
                ]
            );

        if (!vehicleRows.length) {

            throw new Error(
                "VEHICLE_NOT_FOUND"
            );
        }

        const vehicle =
            vehicleRows[0];

        if (!Number(vehicle.is_active)) {

            throw new Error(
                "VEHICLE_INACTIVE"
            );
        }

        /*
        |--------------------------------------------------------------------------
        | 2. Verify destination branch
        |--------------------------------------------------------------------------
        */
        const [branchRows] =
            await connection.query(
                `
                SELECT
                    branch_id,
                    business_id,
                    branch_name,
                    is_active
                FROM branches
                WHERE branch_id = ?
                  AND business_id = ?
                  AND is_active = 1
                LIMIT 1
                FOR UPDATE
                `,
                [
                    destinationBranchId,
                    businessId
                ]
            );

        if (!branchRows.length) {

            throw new Error(
                "DESTINATION_BRANCH_NOT_FOUND"
            );
        }

        const destinationBranch =
            branchRows[0];

        /*
        |--------------------------------------------------------------------------
        | 3. Normalize selected products
        |--------------------------------------------------------------------------
        */
        const requestedProducts =
            products.map(item => ({
                vehicle_stock_id:
                    Number(item.vehicle_stock_id),

                product_id:
                    Number(item.product_id),

                quantity:
                    roundQuantity(
                        Number(item.quantity)
                    )
            }));

        const validatedProducts = [];

        let totalQuantity = 0;
        let totalCost = 0;
        let totalRevenue = 0;

        for (
            const requested
            of requestedProducts
        ) {

            const [vehicleStockRows] =
                await connection.query(
                    `
                    SELECT

                        vs.vehicle_stock_id,

                        vs.business_id,

                        vs.vehicle_location_id,

                        vs.product_id,

                        vs.source_stock_id,

                        vs.batch_number,

                        vs.stock_date,

                        vs.expiry_date,

                        vs.quantity_received,

                        vs.quantity_available,

                        p.product_name,

                        p.category,

                        p.brand,

                        p.cost_price,

                        p.selling_price

                    FROM vehicle_stock vs

                    INNER JOIN products p
                        ON p.product_id =
                           vs.product_id
                       AND p.business_id =
                           vs.business_id

                    WHERE vs.vehicle_stock_id = ?
                      AND vs.business_id = ?
                      AND vs.vehicle_location_id = ?
                      AND vs.product_id = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        requested.vehicle_stock_id,
                        businessId,
                        vehicleLocationId,
                        requested.product_id
                    ]
                );

            if (!vehicleStockRows.length) {

                throw new Error(
                    `VEHICLE_STOCK_NOT_FOUND:${requested.vehicle_stock_id}`
                );
            }

            const vehicleStock =
                vehicleStockRows[0];

            const available =
                Number(
                    vehicleStock.quantity_available || 0
                );

            /*
            |--------------------------------------------------------------------------
            | Quantity cannot exceed vehicle stock.
            |--------------------------------------------------------------------------
            */
            if (
                requested.quantity >
                available
            ) {

                throw new Error(
                    `INSUFFICIENT_VEHICLE_STOCK:${vehicleStock.product_name}:${available}`
                );
            }

            const costPrice =
                Number(
                    vehicleStock.cost_price || 0
                );

            const sellingPrice =
                Number(
                    vehicleStock.selling_price || 0
                );

            const cost =
                roundMoney(
                    requested.quantity *
                    costPrice
                );

            const revenue =
                roundMoney(
                    requested.quantity *
                    sellingPrice
                );

            totalQuantity +=
                requested.quantity;

            totalCost += cost;

            totalRevenue += revenue;

            validatedProducts.push({

                vehicle_stock_id:
                    vehicleStock.vehicle_stock_id,

                product_id:
                    vehicleStock.product_id,

                product_name:
                    vehicleStock.product_name,

                category:
                    vehicleStock.category,

                brand:
                    vehicleStock.brand,

                source_stock_id:
                    vehicleStock.source_stock_id,

                batch_number:
                    vehicleStock.batch_number,

                stock_date:
                    vehicleStock.stock_date,

                expiry_date:
                    vehicleStock.expiry_date,

                quantity:
                    requested.quantity,

                available_before:
                    available,

                cost_price:
                    costPrice,

                selling_price:
                    sellingPrice,

                cost,

                revenue,

                profit:
                    roundMoney(
                        revenue - cost
                    )
            });
        }

        /*
        |--------------------------------------------------------------------------
        | 5. Create ONE inventory movement
        |--------------------------------------------------------------------------
        |
        | Vehicle -> Branch
        |--------------------------------------------------------------------------
        */
        const movementId =
            await createMovement(
                connection,
                {
                    business_id:
                        businessId,

                    movement_type:
                        "UNLOAD",

                    source_type:
                        "VEHICLE",

                    source_location_id:
                        vehicleLocationId,

                    destination_type:
                        "BRANCH",

                    destination_branch_id:
                        destinationBranchId,

                    status:
                        "COMPLETED",

                    reference_type:
                        "VEHICLE_UNLOAD",

                    notes:
                        notes
                            ? String(notes).trim().slice(0, 255)
                            : null,

                    performed_by:
                        user.UserID,

                    completed_at:
                        new Date()
                }
            );

        /*
        |--------------------------------------------------------------------------
        | 6. Process every selected product
        |--------------------------------------------------------------------------
        */
        const movementItems = [];

        for (
            const item
            of validatedProducts
        ) {

            /*
            |--------------------------------------------------------------------------
            | Decrease vehicle stock.
            |
            | The row is already locked with FOR UPDATE.
            |--------------------------------------------------------------------------
            */
            const [vehicleUpdate] =
                await connection.query(
                    `
                    UPDATE vehicle_stock

                    SET quantity_available =
                        quantity_available - ?

                    WHERE vehicle_stock_id = ?

                      AND business_id = ?

                      AND vehicle_location_id = ?

                      AND product_id = ?

                      AND quantity_available >= ?
                    `,
                    [
                        item.quantity,
                        item.vehicle_stock_id,
                        businessId,
                        vehicleLocationId,
                        item.product_id,
                        item.quantity
                    ]
                );

            if (
                vehicleUpdate.affectedRows !== 1
            ) {

                throw new Error(
                    `VEHICLE_STOCK_UPDATE_FAILED:${item.vehicle_stock_id}`
                );
            }

            /*
            |--------------------------------------------------------------------------
            | Find destination branch stock with same product + batch.
            |--------------------------------------------------------------------------
            */
            const [destinationStockRows] =
                await connection.query(
                    `
                    SELECT
                        stock_id,
                        quantity_available
                    FROM stock

                    WHERE business_id = ?

                      AND branch_id = ?

                      AND product_id = ?

                      AND (
                            batch_number = ?

                            OR (
                                batch_number IS NULL
                                AND ? IS NULL
                            )
                          )

                    ORDER BY stock_id DESC

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        businessId,
                        destinationBranchId,
                        item.product_id,
                        item.batch_number,
                        item.batch_number
                    ]
                );

            let destinationStockId;

            /*
            |--------------------------------------------------------------------------
            | Existing destination batch
            |--------------------------------------------------------------------------
            */
            if (
                destinationStockRows.length
            ) {

                destinationStockId =
                    destinationStockRows[0].stock_id;

                const [destinationUpdate] =
                    await connection.query(
                        `
                        UPDATE stock

                        SET

                            quantity_received =
                                quantity_received + ?,

                            quantity_available =
                                quantity_available + ?

                        WHERE stock_id = ?

                          AND business_id = ?

                          AND branch_id = ?
                        `,
                        [
                            item.quantity,
                            item.quantity,
                            destinationStockId,
                            businessId,
                            destinationBranchId
                        ]
                    );

                if (
                    destinationUpdate.affectedRows !== 1
                ) {

                    throw new Error(
                        `DESTINATION_STOCK_UPDATE_FAILED:${item.product_id}`
                    );
                }

            } else 
                {

                const [destinationInsert] =
                    await connection.query(
                        `
                        INSERT INTO stock (

                            business_id,

                            product_id,

                            branch_id,

                            batch_number,

                            quantity_received,

                            quantity_available,

                            stock_date,

                            expiry_date

                        )

                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `,
                        [
                            businessId,
                            item.product_id,
                            destinationBranchId,
                            item.batch_number,
                            item.quantity,
                            item.quantity,
                            item.stock_date,
                            item.expiry_date
                        ]
                    );

                if (
                    destinationInsert.affectedRows !== 1
                ) {

                    throw new Error(
                        `DESTINATION_STOCK_INSERT_FAILED:${item.product_id}`
                    );
                }

                destinationStockId =
                    destinationInsert.insertId;
            }

            await createMovementItem(
                connection,
                {
                    movement_id:
                        movementId,

                    business_id:
                        businessId,

                    product_id:
                        item.product_id,

                    source_stock_id:
                        item.source_stock_id,

                    source_vehicle_stock_id:
                        item.vehicle_stock_id,

                    quantity:
                        item.quantity
                }
            );

            await connection.query(
                `
                INSERT INTO stock_movements (

                    business_id,

                    product_id,

                    stock_id,

                    branch_id,

                    movement_type,

                    movement_reason,

                    quantity,

                    reference_type,

                    reference_id,

                    from_branch_id,

                    to_branch_id,

                    performed_by,

                    reason

                )

                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    'IN',
                    'TRANSFER',
                    ?,
                    ?,
                    ?,
                    NULL,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    businessId,

                    item.product_id,

                    destinationStockId,

                    destinationBranchId,

                    item.quantity,

                    "VEHICLE_UNLOAD",

                    movementId,

                    destinationBranchId,

                    user.UserID,

                    notes
                        ? String(notes).trim().slice(0, 255)
                        : `Unloaded from ${vehicle.location_name}`
                ]
            );

            movementItems.push({

                vehicle_stock_id:
                    item.vehicle_stock_id,

                destination_stock_id:
                    destinationStockId,

                product_id:
                    item.product_id,

                product_name:
                    item.product_name,

                batch_number:
                    item.batch_number,

                quantity:
                    item.quantity,

                cost:
                    item.cost,

                revenue:
                    item.revenue,

                profit:
                    item.profit
            });
        }

        /*
        |--------------------------------------------------------------------------
        | 7. Commit everything together
        |--------------------------------------------------------------------------
        */
        await connection.commit();

        /*
        |--------------------------------------------------------------------------
        | 8. Executive response
        |--------------------------------------------------------------------------
        */
        return res.status(201).json({

            success: true,

            message:
                "Vehicle unloaded successfully.",

            movement_id:
                movementId,

            source_vehicle: {

                location_id:
                    vehicle.location_id,

                location_name:
                    vehicle.location_name
            },

            destination_branch: {

                branch_id:
                    destinationBranch.branch_id,

                branch_name:
                    destinationBranch.branch_name
            },

            summary: {

                products:
                    validatedProducts.length,

                quantity:
                    roundQuantity(
                        totalQuantity
                    ),

                total_cost:
                    roundMoney(
                        totalCost
                    ),

                potential_revenue:
                    roundMoney(
                        totalRevenue
                    ),

                potential_profit:
                    roundMoney(
                        totalRevenue -
                        totalCost
                    )
            },

            products:
                movementItems
        });

    } catch (error) {

        await connection.rollback();

        console.error(
            "unloadVehicle error:",
            error
        );

        /*
        |--------------------------------------------------------------------------
        | Friendly API errors
        |--------------------------------------------------------------------------
        */
        if (
            error.message ===
            "VEHICLE_NOT_FOUND"
        ) {

            return res.status(404).json({
                success: false,
                message:
                    "Vehicle not found."
            });
        }

        if (
            error.message ===
            "VEHICLE_INACTIVE"
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "The selected vehicle is inactive."
            });
        }

        if (
            error.message ===
            "DESTINATION_BRANCH_NOT_FOUND"
        ) {

            return res.status(404).json({
                success: false,
                message:
                    "Destination branch not found."
            });
        }

        if (
            error.message.startsWith(
                "VEHICLE_STOCK_NOT_FOUND:"
            )
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "One of the selected products is no longer available in this vehicle."
            });
        }

        if (
            error.message.startsWith(
                "INSUFFICIENT_VEHICLE_STOCK:"
            )
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "The requested quantity exceeds the available vehicle stock."
            });
        }

        if (
            error.message.startsWith(
                "VEHICLE_STOCK_UPDATE_FAILED:"
            )
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "Vehicle stock changed before the unload could be completed. Please refresh the vehicle stock and try again."
            });
        }

        console.error(
            "Unload transaction failed:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to unload vehicle. No stock changes were saved."
        });

    } finally {

        connection.release();
    }
};


/*
|--------------------------------------------------------------------------
| GET VEHICLE UNLOAD HISTORY
|--------------------------------------------------------------------------
*/
exports.getVehicleUnloadHistory = async (req, res) => {

    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    const vehicleId =
        validId(req.query.vehicle_location_id)
            ? Number(req.query.vehicle_location_id)
            : null;

    try {

        const params = [
            user.business_id
        ];

        let sql = `
            SELECT

                im.movement_id,

                im.created_at,

                im.completed_at,

                im.status,

                im.notes,

                im.source_location_id,

                vehicle.location_name
                    AS vehicle_name,

                im.destination_branch_id,

                b.branch_name
                    AS destination_branch_name,

                COUNT(
                    DISTINCT imi.product_id
                ) AS product_count,

                COALESCE(
                    SUM(imi.quantity),
                    0
                ) AS total_quantity

            FROM inventory_movements im

            LEFT JOIN movement_locations vehicle
                ON vehicle.location_id =
                   im.source_location_id

               AND vehicle.business_id =
                   im.business_id

               AND vehicle.location_type =
                   'VEHICLE'

            LEFT JOIN branches b
                ON b.branch_id =
                   im.destination_branch_id

               AND b.business_id =
                   im.business_id

            LEFT JOIN inventory_movement_items imi
                ON imi.movement_id =
                   im.movement_id

               AND imi.business_id =
                   im.business_id

            WHERE im.business_id = ?

              AND im.movement_type =
                  'UNLOAD'

              AND im.reference_type =
                  'VEHICLE_UNLOAD'
        `;

        if (vehicleId) {

            sql += `
                AND im.source_location_id = ?
            `;

            params.push(
                vehicleId
            );
        }

        sql += `
            GROUP BY

                im.movement_id,

                im.created_at,

                im.completed_at,

                im.status,

                im.notes,

                im.source_location_id,

                vehicle.location_name,

                im.destination_branch_id,

                b.branch_name

            ORDER BY
                im.created_at DESC
        `;

        const [rows] =
            await db.query(
                sql,
                params
            );

        /*
        |--------------------------------------------------------------------------
        | Load item details for every movement.
        |--------------------------------------------------------------------------
        */
        for (const movement of rows) {

            const [items] =
                await db.query(
                    `
                    SELECT

                        imi.movement_item_id,

                        imi.product_id,

                        imi.source_stock_id,

                        imi.source_vehicle_stock_id,

                        imi.quantity,

                        p.product_name,

                        p.category,

                        p.brand

                    FROM inventory_movement_items imi

                    INNER JOIN products p
                        ON p.product_id =
                           imi.product_id

                       AND p.business_id =
                           imi.business_id

                    WHERE imi.movement_id = ?

                      AND imi.business_id = ?

                    ORDER BY
                        p.product_name ASC
                    `,
                    [
                        movement.movement_id,
                        user.business_id
                    ]
                );

            movement.items =
                items;
        }

        return res.json({

            success: true,

            history: rows
        });

    } catch (error) {

        console.error(
            "getVehicleUnloadHistory error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load vehicle unload history."
        });
    }
};

/*
|--------------------------------------------------------------------------
| BRANCH TRANSFER
|--------------------------------------------------------------------------
| Moves branch-specific products and their stock from one branch
| to another branch within the authenticated user's business.
|
| Product identity:
|   product_master_id / product_code
|
| Stock identity:
|   stock_id / batch_number
|
| Source and destination branches may have different product_id values
| because products are branch-specific.
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| TRANSFER APPROVAL
|--------------------------------------------------------------------------
*/

function canApproveBranchTransferProduct(user) {
    const role = String(
        user?.RoleName || ""
    )
        .trim()
        .toLowerCase();

    return [
        "owner",
        "admin",
        "administrator"
    ].includes(role);
}


/*
|--------------------------------------------------------------------------
| GET BRANCHES
|--------------------------------------------------------------------------
*/

exports.getBranchTransferBranches = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) return;

    try {
        const [branches] = await db.query(`
            SELECT
                branch_id,
                branch_name,
                location
            FROM branches
            WHERE business_id = ?
              AND is_active = 1
            ORDER BY branch_name ASC
        `, [
            user.business_id
        ]);

        return res.json({
            success: true,
            branches
        });

    } catch (error) {
        console.error(
            "getBranchTransferBranches error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load branches."
        });
    }
};


/*
|--------------------------------------------------------------------------
| GET SOURCE PRODUCTS
|--------------------------------------------------------------------------
| Returns:
|   - product identity
|   - product master
|   - product code
|   - branch product details
|   - available quantity
|   - individual available batches
|--------------------------------------------------------------------------
*/

exports.getBranchTransferProducts = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) return;

    const sourceBranchId = Number(
        req.query.source_branch_id
    );

    const search = cleanText(
        req.query.search,
        100
    );

    if (!validId(sourceBranchId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid source branch."
        });
    }

    try {
        /*
        |--------------------------------------------------------------------------
        | Verify source branch belongs to authenticated business.
        |--------------------------------------------------------------------------
        */

        const [branches] = await db.query(`
            SELECT
                branch_id
            FROM branches
            WHERE branch_id = ?
              AND business_id = ?
              AND is_active = 1
            LIMIT 1
        `, [
            sourceBranchId,
            user.business_id
        ]);

        if (!branches.length) {
            return res.status(404).json({
                success: false,
                message:
                    "The selected source branch does not belong to your business."
            });
        }

        const params = [
            user.business_id,
            sourceBranchId
        ];

        let searchClause = "";

        if (search) {
            searchClause = `
                AND (
                    p.product_name LIKE ?
                    OR p.category LIKE ?
                    OR p.brand LIKE ?
                    OR pm.product_code LIKE ?
                )
            `;

            const searchValue = `%${search}%`;

            params.push(
                searchValue,
                searchValue,
                searchValue,
                searchValue
            );
        }

        const [products] = await db.query(`
            SELECT
                p.product_id,
                p.product_master_id,
                pm.product_code,
                p.product_name,
                p.category,
                p.brand,
                p.unit,
                p.description,
                p.product_image,
                p.cost_price,
                p.selling_price,
                p.msrp,
                p.supplier_name,
                p.branch_id,
                COALESCE(
                    SUM(
                        CASE
                            WHEN s.quantity_available > 0
                            THEN s.quantity_available
                            ELSE 0
                        END
                    ),
                    0
                ) AS quantity_available
            FROM products p

            INNER JOIN product_masters pm
                ON pm.product_master_id =
                    p.product_master_id
                AND pm.business_id =
                    p.business_id

            LEFT JOIN stock s
                ON s.product_id =
                    p.product_id
                AND s.business_id =
                    p.business_id
                AND s.branch_id =
                    p.branch_id

            WHERE p.business_id = ?
              AND p.branch_id = ?
              ${searchClause}

            GROUP BY
                p.product_id,
                p.product_master_id,
                pm.product_code,
                p.product_name,
                p.category,
                p.brand,
                p.unit,
                p.description,
                p.product_image,
                p.cost_price,
                p.selling_price,
                p.msrp,
                p.supplier_name,
                p.branch_id

            HAVING quantity_available > 0

            ORDER BY
                p.product_name ASC
        `, params);

        /*
        |--------------------------------------------------------------------------
        | Load actual batches separately.
        |--------------------------------------------------------------------------
        */

        const productIds =
            products.map(
                product => product.product_id
            );

        let batches = [];

        if (productIds.length) {
            const placeholders =
                productIds
                    .map(() => "?")
                    .join(",");

            const [batchRows] = await db.query(`
                SELECT
                    stock_id,
                    product_id,
                    batch_number,
                    quantity_received,
                    quantity_available,
                    stock_date,
                    expiry_date
                FROM stock
                WHERE business_id = ?
                  AND branch_id = ?
                  AND product_id IN (${placeholders})
                  AND quantity_available > 0
                ORDER BY
                    stock_date ASC,
                    stock_id ASC
            `, [
                user.business_id,
                sourceBranchId,
                ...productIds
            ]);

            batches = batchRows;
        }

        const batchesByProduct =
            new Map();

        for (const batch of batches) {
            const key =
                String(batch.product_id);

            if (!batchesByProduct.has(key)) {
                batchesByProduct.set(
                    key,
                    []
                );
            }

            batchesByProduct
                .get(key)
                .push(batch);
        }
const result =
    products.map(product => ({
        ...product,
        quantity_available:
            Number(
                product.quantity_available),
        cost_price:
            Number(
                product.cost_price),
        selling_price:
            Number(
                product.selling_price),
        msrp:
            product.msrp === null
                ? null
                : Number(product.msrp),
        batches:
            (
                batchesByProduct.get(
                    String(product.product_id)
                ) || []
            ).map(batch => ({
                stock_id:
                    Number(batch.stock_id),
                product_id:
                    Number(batch.product_id),
                batch_number:
                    batch.batch_number,
                quantity_received:
                    Number(
                        batch.quantity_received),
                quantity_available:
                    Number(
                        batch.quantity_available),
                stock_date:
                    batch.stock_date,
                expiry_date:
                    batch.expiry_date
            }))
    }));

        return res.json({
            success: true,
            products: result
        });

    } catch (error) {
        console.error(
            "getBranchTransferProducts error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load transfer products."
        });
    }
};


/*
|--------------------------------------------------------------------------
| FIND SIMILAR DESTINATION PRODUCTS
|--------------------------------------------------------------------------
| This is deliberately not used as automatic identity matching.
|
| product_master_id remains the authoritative identity.
|
| These candidates are only presented to an authorized user for review.
|--------------------------------------------------------------------------
*/

async function findSimilarDestinationProducts(
    connection,
    {
        businessId,
        destinationBranchId,
        sourceProduct
    }
) {
    const [rows] = await connection.query(`
        SELECT
            p.product_id,
            p.product_master_id,
            pm.product_code,
            p.product_name,
            p.category,
            p.brand,
            p.unit,
            p.description,
            p.product_image,
            p.cost_price,
            p.selling_price,
            p.msrp,
            p.supplier_name,
            p.branch_id
        FROM products p

        INNER JOIN product_masters pm
            ON pm.product_master_id =
                p.product_master_id
            AND pm.business_id =
                p.business_id

        WHERE p.business_id = ?
          AND p.branch_id = ?
          AND p.product_master_id <> ?

          AND (
                LOWER(TRIM(p.product_name))
                    = LOWER(TRIM(?))

                OR LOWER(TRIM(COALESCE(p.brand, '')))
                    = LOWER(TRIM(COALESCE(?, '')))

                OR LOWER(TRIM(COALESCE(p.category, '')))
                    = LOWER(TRIM(COALESCE(?, '')))

                OR LOWER(TRIM(COALESCE(p.unit, '')))
                    = LOWER(TRIM(COALESCE(?, '')))
          )

        ORDER BY
            CASE
                WHEN LOWER(TRIM(p.product_name))
                    = LOWER(TRIM(?))
                THEN 1

                WHEN LOWER(TRIM(COALESCE(p.brand, '')))
                    = LOWER(TRIM(COALESCE(?, '')))
                THEN 2

                WHEN LOWER(TRIM(COALESCE(p.category, '')))
                    = LOWER(TRIM(COALESCE(?, '')))
                THEN 3

                ELSE 4
            END,

            p.product_name ASC

        LIMIT 20
    `, [
        businessId,
        destinationBranchId,
        sourceProduct.product_master_id,

        sourceProduct.product_name,
        sourceProduct.brand,
        sourceProduct.category,
        sourceProduct.unit,

        sourceProduct.product_name,
        sourceProduct.brand,
        sourceProduct.category
    ]);

    return rows;
}


/*
|--------------------------------------------------------------------------
| RESOLVE DESTINATION PRODUCT
|--------------------------------------------------------------------------
|
| Possible outcomes:
|
| EXACT_MATCH
|     Same product_master_id already exists at destination.
|
| USE_EXISTING
|     Authorized user explicitly selected a destination product.
|
| CREATE_NEW
|     Authorized owner/admin creates a new destination product
|     using the source product's existing product_master_id.
|
| REVIEW_REQUIRED
|     Similar/no product exists and an authorized decision is required.
|--------------------------------------------------------------------------
*/

async function resolveBranchTransferDestinationProduct(
    connection,
    {
        user,
        destinationBranchId,
        sourceProduct,
        destinationAction,
        destinationProductId
    }
) {
    /*
    |--------------------------------------------------------------------------
    | First: exact master match.
    |--------------------------------------------------------------------------
    */

    const [
        exactRows
    ] = await connection.query(`
        SELECT
            p.product_id,
            p.product_master_id,
            pm.product_code,
            p.product_name,
            p.category,
            p.brand,
            p.unit,
            p.description,
            p.product_image,
            p.cost_price,
            p.selling_price,
            p.msrp,
            p.supplier_name,
            p.branch_id
        FROM products p

        INNER JOIN product_masters pm
            ON pm.product_master_id =
                p.product_master_id
            AND pm.business_id =
                p.business_id

        WHERE p.business_id = ?
          AND p.branch_id = ?
          AND p.product_master_id = ?
        LIMIT 1
        FOR UPDATE
    `, [
        user.business_id,
        destinationBranchId,
        sourceProduct.product_master_id
    ]);

    if (exactRows.length) {
        return {
            status: "EXACT_MATCH",
            product: exactRows[0],
            created: false
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Find possible similar products.
    |--------------------------------------------------------------------------
    */

    const candidates =
        await findSimilarDestinationProducts(
            connection,
            {
                businessId:
                    user.business_id,
                destinationBranchId,
                sourceProduct
            }
        );

    const action =
        String(
            destinationAction || "AUTO"
        )
            .trim()
            .toUpperCase();

    /*
    |--------------------------------------------------------------------------
    | CANCEL
    |--------------------------------------------------------------------------
    */

    if (action === "CANCEL") {
        throw new Error(
            `DESTINATION_PRODUCT_CANCELLED:${sourceProduct.product_id}`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | USE EXISTING
    |--------------------------------------------------------------------------
    */

    if (action === "USE_EXISTING") {
        if (!canApproveBranchTransferProduct(user)) {
            throw new Error(
                "DESTINATION_PRODUCT_APPROVAL_REQUIRED"
            );
        }

        const selectedProductId =
            Number(destinationProductId);

        if (!validId(selectedProductId)) {
            throw new Error(
                "INVALID_DESTINATION_PRODUCT"
            );
        }

        const selectedCandidate =
            candidates.find(
                candidate =>
                    Number(candidate.product_id) ===
                    selectedProductId
            );

        if (!selectedCandidate) {
            throw new Error(
                "INVALID_DESTINATION_PRODUCT"
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Lock selected destination product.
        |--------------------------------------------------------------------------
        */

        const [
            selectedRows
        ] = await connection.query(`
            SELECT
                p.product_id,
                p.product_master_id,
                pm.product_code,
                p.product_name,
                p.category,
                p.brand,
                p.unit,
                p.description,
                p.product_image,
                p.cost_price,
                p.selling_price,
                p.msrp,
                p.supplier_name,
                p.branch_id
            FROM products p

            INNER JOIN product_masters pm
                ON pm.product_master_id =
                    p.product_master_id
                AND pm.business_id =
                    p.business_id

            WHERE p.product_id = ?
              AND p.business_id = ?
              AND p.branch_id = ?
            LIMIT 1
            FOR UPDATE
        `, [
            selectedProductId,
            user.business_id,
            destinationBranchId
        ]);

        if (!selectedRows.length) {
            throw new Error(
                "INVALID_DESTINATION_PRODUCT"
            );
        }

        return {
            status: "USE_EXISTING",
            product:
                selectedRows[0],
            created: false
        };
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE NEW DESTINATION PRODUCT
    |--------------------------------------------------------------------------
    */

    if (action === "CREATE_NEW") {
        if (!canApproveBranchTransferProduct(user)) {
            throw new Error(
                "DESTINATION_PRODUCT_APPROVAL_REQUIRED"
            );
        }

        /*
        |----------------------------------------------------------------------
        | The master already exists.
        |
        | We deliberately DO NOT create another product master.
        |----------------------------------------------------------------------
        */

        const [
            productResult
        ] = await connection.query(`
            INSERT INTO products
            (
                product_master_id,
                business_id,
                branch_id,
                product_name,
                category,
                brand,
                unit,
                description,
                product_image,
                cost_price,
                selling_price,
                msrp,
                supplier_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            sourceProduct.product_master_id,
            user.business_id,
            destinationBranchId,
            sourceProduct.product_name,
            sourceProduct.category,
            sourceProduct.brand,
            sourceProduct.unit,
            sourceProduct.description,
            sourceProduct.product_image,
            sourceProduct.cost_price,
            sourceProduct.selling_price,
            sourceProduct.msrp,
            sourceProduct.supplier_name
        ]);

        const newProductId =
            productResult.insertId;

        /*
        |--------------------------------------------------------------------------
        | Create destination product discount row.
        |--------------------------------------------------------------------------
        */

        await connection.query(`
            INSERT INTO product_discount
            (
                business_id,
                branch_id,
                product_id,
                product_name,
                discount
            )
            VALUES (?, ?, ?, ?, 0)
        `, [
            user.business_id,
            destinationBranchId,
            newProductId,
            sourceProduct.product_name
        ]);

        const [
            createdRows
        ] = await connection.query(`
            SELECT
                p.product_id,
                p.product_master_id,
                pm.product_code,
                p.product_name,
                p.category,
                p.brand,
                p.unit,
                p.description,
                p.product_image,
                p.cost_price,
                p.selling_price,
                p.msrp,
                p.supplier_name,
                p.branch_id
            FROM products p

            INNER JOIN product_masters pm
                ON pm.product_master_id =
                    p.product_master_id
                AND pm.business_id =
                    p.business_id

            WHERE p.product_id = ?
              AND p.business_id = ?
              AND p.branch_id = ?
            LIMIT 1
            FOR UPDATE
        `, [
            newProductId,
            user.business_id,
            destinationBranchId
        ]);

        return {
            status: "CREATE_NEW",
            product:
                createdRows[0],
            created: true
        };
    }

    /*
    |--------------------------------------------------------------------------
    | AUTO / NO DECISION
    |--------------------------------------------------------------------------
    */

    throw new Error(
        `DESTINATION_PRODUCT_REVIEW_REQUIRED:${JSON.stringify({
            source_product_id:
                sourceProduct.product_id,
            source_product_master_id:
                sourceProduct.product_master_id,
            source_product_code:
                sourceProduct.product_code,
            source_product_name:
                sourceProduct.product_name,
            candidates
        })}`
    );
}


/*
|--------------------------------------------------------------------------
| CREATE / UPDATE DESTINATION STOCK
|--------------------------------------------------------------------------
| Batch identity is preserved.
|
| Source:
|     BATCH-000275
|
| Destination:
|     BATCH-000275
|
| We do NOT generate a new batch number during transfer.
|--------------------------------------------------------------------------
*/

async function createBranchTransferDestinationStock(
    connection,
    {
        businessId,
        destinationBranchId,
        destinationProductId,
        batchNumber,
        stockDate,
        expiryDate,
        quantity
    }
) {
    const [
        destinationStock
    ] = await connection.query(`
        SELECT
            stock_id,
            batch_number,
            quantity_available
        FROM stock
        WHERE business_id = ?
          AND branch_id = ?
          AND product_id = ?
          AND (
                batch_number = ?

                OR (
                    batch_number IS NULL
                    AND ? IS NULL
                )
          )
        ORDER BY stock_id DESC
        LIMIT 1
        FOR UPDATE
    `, [
        businessId,
        destinationBranchId,
        destinationProductId,
        batchNumber,
        batchNumber
    ]);

    if (destinationStock.length) {
        const destinationStockId =
            destinationStock[0].stock_id;

        await connection.query(`
            UPDATE stock
            SET
                quantity_received =
                    quantity_received + ?,

                quantity_available =
                    quantity_available + ?
            WHERE stock_id = ?
              AND business_id = ?
              AND branch_id = ?
              AND product_id = ?
        `, [
            quantity,
            quantity,
            destinationStockId,
            businessId,
            destinationBranchId,
            destinationProductId
        ]);

        return destinationStockId;
    }

    const [
        result
    ] = await connection.query(`
        INSERT INTO stock
        (
            business_id,
            product_id,
            branch_id,
            batch_number,
            quantity_received,
            quantity_available,
            stock_date,
            expiry_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        businessId,
        destinationProductId,
        destinationBranchId,
        batchNumber,
        quantity,
        quantity,
        stockDate,
        expiryDate
    ]);

    return result.insertId;
}


/*
|--------------------------------------------------------------------------
| PREVIEW / RESOLVE DESTINATION PRODUCTS
|--------------------------------------------------------------------------
| This endpoint does NOT modify stock.
|
| It allows the frontend to ask:
|
| "What will happen if I transfer these products?"
|
| The JS can then show:
|
|   Exact match
|   Similar product
|   No destination product
|
| and request the required owner/admin decision.
|--------------------------------------------------------------------------
*/
exports.resolveBranchTransferProducts = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) return;

    const sourceBranchId = Number(req.body.source_branch_id);
    const destinationBranchId = Number(req.body.destination_branch_id);
    const products = req.body.products;

    if (!validId(sourceBranchId) || !validId(destinationBranchId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid source or destination branch."
        });
    }

    if (sourceBranchId === destinationBranchId) {
        return res.status(400).json({
            success: false,
            message: "Source and destination branches must be different."
        });
    }

    if (!Array.isArray(products) || !products.length) {
        return res.status(400).json({
            success: false,
            message: "Add at least one product."
        });
    }

    if (products.length > 100) {
        return res.status(400).json({
            success: false,
            message: "You can resolve a maximum of 100 products at once."
        });
    }

    const connection = await db.getConnection();

    try {
        const sourceBranch = await getBranch(
            connection,
            user.business_id,
            sourceBranchId
        );

        const destinationBranch = await getBranch(
            connection,
            user.business_id,
            destinationBranchId
        );

        if (!sourceBranch || !destinationBranch) {
            return res.status(404).json({
                success: false,
                message: "One or both branches were not found."
            });
        }

        const resolutions = [];

        for (const item of products) {
            const productId = Number(item.product_id);

            if (!validId(productId)) {
                throw new Error("INVALID_PRODUCT_LINE");
            }

            const [sourceRows] = await connection.query(`
                SELECT
                    p.product_id,
                    p.product_master_id,
                    pm.product_code,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.description,
                    p.product_image,
                    p.cost_price,
                    p.selling_price,
                    p.msrp,
                    p.supplier_name,
                    p.branch_id
                FROM products p
                INNER JOIN product_masters pm
                    ON pm.product_master_id = p.product_master_id
                    AND pm.business_id = p.business_id
                WHERE p.product_id = ?
                  AND p.business_id = ?
                  AND p.branch_id = ?
                LIMIT 1
            `, [
                productId,
                user.business_id,
                sourceBranchId
            ]);

            if (!sourceRows.length) {
                throw new Error(
                    `PRODUCT_NOT_IN_SOURCE_BRANCH:${productId}`
                );
            }

            const sourceProduct = sourceRows[0];

            if (!validId(sourceProduct.product_master_id)) {
                throw new Error(
                    `PRODUCT_MASTER_MISSING:${productId}`
                );
            }

            const [exactRows] = await connection.query(`
                SELECT
                    p.product_id,
                    p.product_master_id,
                    pm.product_code,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.description,
                    p.product_image,
                    p.cost_price,
                    p.selling_price,
                    p.msrp,
                    p.supplier_name,
                    p.branch_id
                FROM products p
                INNER JOIN product_masters pm
                    ON pm.product_master_id = p.product_master_id
                    AND pm.business_id = p.business_id
                WHERE p.business_id = ?
                  AND p.branch_id = ?
                  AND p.product_master_id = ?
                LIMIT 1
            `, [
                user.business_id,
                destinationBranchId,
                sourceProduct.product_master_id
            ]);

            if (exactRows.length) {
                resolutions.push({
                    source_product: sourceProduct,
                    status: "EXACT_MATCH",
                    destination_product: exactRows[0],
                    candidates: []
                });

                continue;
            }

            const candidates = await findSimilarDestinationProducts(
                connection,
                {
                    businessId: user.business_id,
                    destinationBranchId,
                    sourceProduct
                }
            );

            resolutions.push({
                source_product: sourceProduct,
                status: candidates.length
                    ? "SIMILAR_MATCH"
                    : "NO_MATCH",
                destination_product: null,
                candidates
            });
        }

        return res.json({
            success: true,
            approver_required: resolutions.some(
                item => item.status !== "EXACT_MATCH"
            ),
            can_approve: canApproveBranchTransferProduct(user),
            resolutions
        });

    } catch (error) {
        console.error(
            "resolveBranchTransferProducts error:",
            error
        );

        if (error.message === "INVALID_PRODUCT_LINE") {
            return res.status(400).json({
                success: false,
                message: "One or more products are invalid."
            });
        }

        if (
            error.message.startsWith(
                "PRODUCT_NOT_IN_SOURCE_BRANCH:"
            )
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "One of the selected products does not belong to the source branch."
            });
        }

        if (
            error.message.startsWith(
                "PRODUCT_MASTER_MISSING:"
            )
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "One of the selected products does not have a valid product master."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to resolve destination products."
        });

    } finally {
        connection.release();
    }
};


/*
|--------------------------------------------------------------------------
| TRANSFER BRANCH STOCK
|--------------------------------------------------------------------------
| Supports multiple products in one atomic transaction.
|
| Each product may optionally contain:
|
|   stock_id
|
| to identify a specific batch.
|
| If stock_id is omitted:
|   FIFO is used.
|
| Each product may also contain:
|
|   destination_action:
|       AUTO
|       USE_EXISTING
|       CREATE_NEW
|       CANCEL
|
| Exact product_master matches are automatically accepted.
|--------------------------------------------------------------------------
*/

exports.transferBranchStock = async (
    req,
    res
) => {
    const user =
        requireProductManager(req, res);

    if (!user) return;

    const {
        source_branch_id,
        destination_branch_id,
        products,
        notes
    } = req.body;

    const sourceBranchId =
        Number(source_branch_id);

    const destinationBranchId =
        Number(destination_branch_id);

    const cleanNotes =
        cleanText(notes, 255);

    if (
        !validId(sourceBranchId) ||
        !validId(destinationBranchId)
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Invalid source or destination branch."
        });
    }

    if (
        sourceBranchId ===
        destinationBranchId
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Source and destination branches must be different."
        });
    }

    if (
        !Array.isArray(products) ||
        !products.length
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Add at least one product to the transfer."
        });
    }

    if (products.length > 100) {
        return res.status(400).json({
            success: false,
            message:
                "A maximum of 100 products can be transferred at once."
        });
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        const firstBranchId =
            Math.min(
                sourceBranchId,
                destinationBranchId
            );

        const secondBranchId =
            Math.max(
                sourceBranchId,
                destinationBranchId
            );

        const firstBranch =
            await getBranch(
                connection,
                user.business_id,
                firstBranchId
            );

        const secondBranch =
            await getBranch(
                connection,
                user.business_id,
                secondBranchId
            );

        if (
            !firstBranch ||
            !secondBranch
        ) {
            throw new Error(
                "BRANCH_NOT_FOUND"
            );
        }

        const sourceBranch =
            sourceBranchId === firstBranchId
                ? firstBranch
                : secondBranch;

        const destinationBranch =
            destinationBranchId === firstBranchId
                ? firstBranch
                : secondBranch;

        const normalizedProducts = [];

        for (const item of products) {
            const productId =
                Number(item.product_id);

            const quantity =
                Number(item.quantity);

            const stockId =
                item.stock_id !== undefined &&
                item.stock_id !== null &&
                item.stock_id !== ""
                    ? Number(item.stock_id)
                    : null;

            const destinationAction =
                String(
                    item.destination_action ||
                    "AUTO"
                )
                    .trim()
                    .toUpperCase();

            const destinationProductId =
                item.destination_product_id
                    ? Number(
                        item.destination_product_id
                    )
                    : null;

            if (
                !validId(productId) ||
                !validQuantity(quantity)
            ) {
                throw new Error(
                    "INVALID_PRODUCT_LINE"
                );
            }

            if (
                stockId !== null &&
                !validId(stockId)
            ) {
                throw new Error(
                    "INVALID_STOCK_ID"
                );
            }

            if (
                ![
                    "AUTO",
                    "USE_EXISTING",
                    "CREATE_NEW",
                    "CANCEL"
                ].includes(
                    destinationAction
                )
            ) {
                throw new Error(
                    "INVALID_DESTINATION_ACTION"
                );
            }

            const [
                productRows
            ] = await connection.query(`
                SELECT
                    p.product_id,
                    p.product_master_id,
                    pm.product_code,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.description,
                    p.product_image,
                    p.cost_price,
                    p.selling_price,
                    p.msrp,
                    p.supplier_name,
                    p.branch_id
                FROM products p

                INNER JOIN product_masters pm
                    ON pm.product_master_id =
                        p.product_master_id
                    AND pm.business_id =
                        p.business_id

                WHERE p.product_id = ?
                  AND p.business_id = ?
                  AND p.branch_id = ?
                LIMIT 1
                FOR UPDATE
            `, [
                productId,
                user.business_id,
                sourceBranchId
            ]);

            if (!productRows.length) {
                throw new Error(
                    `PRODUCT_NOT_IN_SOURCE_BRANCH:${productId}`
                );
            }

            normalizedProducts.push({
                product_id:
                    productId,

                product_master_id:
                    productRows[0]
                        .product_master_id,

                product_code:
                    productRows[0]
                        .product_code,

                product_name:
                    productRows[0]
                        .product_name,

                category:
                    productRows[0]
                        .category,

                brand:
                    productRows[0]
                        .brand,

                unit:
                    productRows[0]
                        .unit,

                description:
                    productRows[0]
                        .description,

                product_image:
                    productRows[0]
                        .product_image,

                supplier_name:
                    productRows[0]
                        .supplier_name,

                cost_price:
                    Number(
                        productRows[0]
                            .cost_price
                    ),

                selling_price:
                    Number(
                        productRows[0]
                            .selling_price
                    ),

                msrp:
                    productRows[0].msrp === null
                        ? null
                        : Number(
                            productRows[0]
                                .msrp
                        ),

                requested_quantity:
                    roundQuantity(
                        quantity
                    ),

                stock_id:
                    stockId,

                destination_action:
                    destinationAction,

                destination_product_id:
                    destinationProductId
            });
        }

        for (
            const item of normalizedProducts
        ) {
            const resolution =
                await resolveBranchTransferDestinationProduct(
                    connection,
                    {
                        user,
                        destinationBranchId,
                        sourceProduct: item,
                        destinationAction:
                            item.destination_action,
                        destinationProductId:
                            item.destination_product_id
                    }
                );

            item.destination_product_id =
                resolution.product.product_id;

            item.destination_product =
                resolution.product;

            item.destination_resolution =
                resolution.status;
        }

        const [
            transferResult
        ] = await connection.query(`
            INSERT INTO stock_transfers
            (
                business_id,
                from_branch_id,
                to_branch_id,
                initiated_by,
                status,
                notes,
                completed_at
            )
            VALUES (
                ?, ?, ?, ?, 'COMPLETED', ?, NOW()
            )
        `, [
            user.business_id,
            sourceBranchId,
            destinationBranchId,
            user.UserID,
            cleanNotes || null
        ]);

        const transferId =
            transferResult.insertId;

        const movementId =
            await createMovement(
                connection,
                {
                    business_id:
                        user.business_id,

                    movement_type:
                        "TRANSFER",

                    source_type:
                        "BRANCH",

                    source_branch_id:
                        sourceBranchId,

                    destination_type:
                        "BRANCH",

                    destination_branch_id:
                        destinationBranchId,

                    status:
                        "COMPLETED",

                    reference_type:
                        "BRANCH_TRANSFER",

                    reference_id:
                        transferId,

                    notes:
                        cleanNotes ||
                        `Stock transferred from ${sourceBranch.branch_name} to ${destinationBranch.branch_name}`,

                    performed_by:
                        user.UserID,

                    completed_at:
                        new Date()
                }
            );

        const movementItems = [];
        const transferItems = [];

        let totalQuantity = 0;
        let totalCost = 0;
        let totalRevenue = 0;

        for (
            const item of normalizedProducts
        ) {
            let remaining =
                item.requested_quantity;

            let sourceStocks = [];

            if (item.stock_id) {
                const [
                    rows
                ] = await connection.query(`
                    SELECT
                        stock_id,
                        product_id,
                        branch_id,
                        batch_number,
                        quantity_received,
                        quantity_available,
                        stock_date,
                        expiry_date
                    FROM stock
                    WHERE stock_id = ?
                      AND business_id = ?
                      AND branch_id = ?
                      AND product_id = ?
                      AND quantity_available > 0
                    LIMIT 1
                    FOR UPDATE
                `, [
                    item.stock_id,
                    user.business_id,
                    sourceBranchId,
                    item.product_id
                ]);

                sourceStocks = rows;

            } else {

                const [
                    rows
                ] = await connection.query(`
                    SELECT
                        stock_id,
                        product_id,
                        branch_id,
                        batch_number,
                        quantity_received,
                        quantity_available,
                        stock_date,
                        expiry_date
                    FROM stock
                    WHERE business_id = ?
                      AND branch_id = ?
                      AND product_id = ?
                      AND quantity_available > 0
                    ORDER BY
                        stock_date ASC,
                        stock_id ASC
                    FOR UPDATE
                `, [
                    user.business_id,
                    sourceBranchId,
                    item.product_id
                ]);

                sourceStocks = rows;
            }

            if (!sourceStocks.length) {
                throw new Error(
                    `SOURCE_STOCK_NOT_FOUND:${item.product_id}`
                );
            }

            const availableTotal =
                sourceStocks.reduce(
                    (
                        total,
                        stock
                    ) =>
                        total +
                        Number(
                            stock.quantity_available
                        ),
                    0
                );

            if (
                availableTotal <
                item.requested_quantity
            ) {
                throw new Error(
                    `INSUFFICIENT_STOCK:${item.product_id}`
                );
            }

            for (
                const stock of sourceStocks
            ) {
                if (remaining <= 0) {
                    break;
                }

                const available =
                    Number(
                        stock.quantity_available
                    );

                const moved =
                    roundQuantity(
                        Math.min(
                            available,
                            remaining
                        )
                    );

                if (moved <= 0) {
                    continue;
                }

                await connection.query(`
                    UPDATE stock
                    SET
                        quantity_available =
                            quantity_available - ?
                    WHERE stock_id = ?
                      AND business_id = ?
                      AND branch_id = ?
                      AND product_id = ?
                      AND quantity_available >= ?
                `, [
                    moved,
                    stock.stock_id,
                    user.business_id,
                    sourceBranchId,
                    item.product_id,
                    moved
                ]);

                const destinationStockId =
                    await createBranchTransferDestinationStock(
                        connection,
                        {
                            businessId:
                                user.business_id,

                            destinationBranchId,

                            destinationProductId:
                                item.destination_product_id,

                            batchNumber:
                                stock.batch_number,

                            stockDate:
                                stock.stock_date,

                            expiryDate:
                                stock.expiry_date,

                            quantity:
                                moved
                        }
                    );

                const [
                    transferItemResult
                ] = await connection.query(`
                    INSERT INTO stock_transfer_items
                    (
                        business_id,
                        transfer_id,
                        product_id,
                        source_product_id,
                        destination_product_id,
                        product_master_id,
                        source_stock_id,
                        destination_stock_id,
                        quantity
                    )
                    VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )
                `, [
                    user.business_id,
                    transferId,

                    item.product_id,

                    item.product_id,

                    item.destination_product_id,

                    item.product_master_id,

                    stock.stock_id,

                    destinationStockId,

                    moved
                ]);

                transferItems.push({
                    transfer_item_id:
                        transferItemResult.insertId,

                    product_id:
                        item.product_id,

                    source_product_id:
                        item.product_id,

                    destination_product_id:
                        item.destination_product_id,

                    product_master_id:
                        item.product_master_id,

                    product_code:
                        item.product_code,

                    product_name:
                        item.product_name,

                    source_stock_id:
                        stock.stock_id,

                    destination_stock_id:
                        destinationStockId,

                    batch_number:
                        stock.batch_number,

                    quantity:
                        moved,

                    destination_resolution:
                        item.destination_resolution
                });

                const movementItemId =
                    await createMovementItem(
                        connection,
                        {
                            movement_id:
                                movementId,

                            business_id:
                                user.business_id,

                            product_id:
                                item.product_id,

                            source_stock_id:
                                stock.stock_id,

                            source_vehicle_stock_id:
                                null,

                            quantity:
                                moved
                        }
                    );

                movementItems.push({
                    movement_item_id:
                        movementItemId,

                    product_id:
                        item.product_id,

                    source_product_id:
                        item.product_id,

                    destination_product_id:
                        item.destination_product_id,

                    product_master_id:
                        item.product_master_id,

                    product_code:
                        item.product_code,

                    product_name:
                        item.product_name,

                    source_stock_id:
                        stock.stock_id,

                    destination_stock_id:
                        destinationStockId,

                    batch_number:
                        stock.batch_number,

                    quantity:
                        moved
                });


                await connection.query(`
                    INSERT INTO stock_movements
                    (
                        business_id,
                        product_id,
                        stock_id,
                        branch_id,
                        movement_type,
                        movement_reason,
                        quantity,
                        reference_type,
                        reference_id,
                        from_branch_id,
                        to_branch_id,
                        performed_by,
                        reason
                    )
                    VALUES (
                        ?, ?, ?, ?, 'OUT', 'TRANSFER',
                        ?, 'BRANCH_TRANSFER', ?,
                        ?, ?, ?, ?
                    )
                `, [
                    user.business_id,

                    item.product_id,

                    stock.stock_id,

                    sourceBranchId,

                    moved,

                    transferId,

                    sourceBranchId,

                    destinationBranchId,

                    user.UserID,

                    cleanNotes ||
                    `Transfer to ${destinationBranch.branch_name}`
                ]);


                await connection.query(`
                    INSERT INTO stock_movements
                    (
                        business_id,
                        product_id,
                        stock_id,
                        branch_id,
                        movement_type,
                        movement_reason,
                        quantity,
                        reference_type,
                        reference_id,
                        from_branch_id,
                        to_branch_id,
                        performed_by,
                        reason
                    )
                    VALUES (
                        ?, ?, ?, ?, 'IN', 'TRANSFER',
                        ?, 'BRANCH_TRANSFER', ?,
                        ?, ?, ?, ?
                    )
                `, [
                    user.business_id,

                    item.destination_product_id,

                    destinationStockId,

                    destinationBranchId,

                    moved,

                    transferId,

                    sourceBranchId,

                    destinationBranchId,

                    user.UserID,

                    cleanNotes ||
                    `Transfer from ${sourceBranch.branch_name}`
                ]);

                totalQuantity =
                    roundQuantity(
                        totalQuantity +
                        moved
                    );

                totalCost =
                    roundMoney(
                        totalCost +
                        (
                            moved *
                            item.cost_price
                        )
                    );

                totalRevenue =
                    roundMoney(
                        totalRevenue +
                        (
                            moved *
                            item.selling_price
                        )
                    );

                remaining =
                    roundQuantity(
                        remaining -
                        moved
                    );
            }

            if (remaining > 0) {
                throw new Error(
                    `TRANSFER_QUANTITY_NOT_COMPLETED:${item.product_id}`
                );
            }
        }

        await connection.commit();

        return res.status(201).json({
            success: true,

            message:
                "Branch stock transferred successfully.",

            transfer_id:
                transferId,

            movement_id:
                movementId,

            source_branch: {
                branch_id:
                    sourceBranch.branch_id,

                branch_name:
                    sourceBranch.branch_name
            },

            destination_branch: {
                branch_id:
                    destinationBranch.branch_id,

                branch_name:
                    destinationBranch.branch_name
            },

            summary: {
                products:
                    normalizedProducts.length,

                quantity:
                    totalQuantity,

                total_cost:
                    totalCost,

                potential_revenue:
                    totalRevenue,

                potential_profit:
                    roundMoney(
                        totalRevenue -
                        totalCost
                    )
            },

            transfer_items:
                transferItems,

            movement_items:
                movementItems
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "transferBranchStock error:",
            error
        );

        if (
            error.message === "BRANCH_NOT_FOUND"
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "One or both branches were not found."
            });
        }

        if (
            error.message === "INVALID_PRODUCT_LINE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "One or more transfer products are invalid."
            });
        }

        if (
            error.message === "INVALID_STOCK_ID"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "An invalid stock batch was supplied."
            });
        }

        if (
            error.message === "INVALID_DESTINATION_ACTION"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid destination product decision."
            });
        }

        if (
            error.message === "INVALID_DESTINATION_PRODUCT"
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "The selected destination product is not a valid approved candidate."
            });
        }

        if (
            error.message ===
            "DESTINATION_PRODUCT_APPROVAL_REQUIRED"
        ) {
            return res.status(403).json({
                success: false,
                code:
                    "DESTINATION_PRODUCT_APPROVAL_REQUIRED",
                message:
                    "Owner or administrator approval is required for this destination product decision."
            });
        }

        if (
            error.message.startsWith(
                "DESTINATION_PRODUCT_CANCELLED:"
            )
        ) {
            return res.status(409).json({
                success: false,
                code:
                    "DESTINATION_PRODUCT_CANCELLED",
                message:
                    "The transfer was cancelled because the destination product decision was cancelled."
            });
        }

        if (
            error.message.startsWith(
                "DESTINATION_PRODUCT_REVIEW_REQUIRED:"
            )
        ) {
            let details = null;

            try {
                details =
                    JSON.parse(
                        error.message.substring(
                            "DESTINATION_PRODUCT_REVIEW_REQUIRED:"
                                .length
                        )
                    );
            } catch (_) {
                details = null;
            }

            return res.status(409).json({
                success: false,

                code:
                    "DESTINATION_PRODUCT_REVIEW_REQUIRED",

                message:
                    "A destination product decision is required before this transfer can continue.",

                resolution:
                    details
            });
        }

        if (
            error.message.startsWith(
                "PRODUCT_NOT_IN_SOURCE_BRANCH:"
            )
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "One of the selected products does not belong to the source branch."
            });
        }

        if (
            error.message.startsWith(
                "SOURCE_STOCK_NOT_FOUND:"
            )
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "No available stock was found for one of the selected products."
            });
        }

        if (
            error.message.startsWith(
                "INSUFFICIENT_STOCK:"
            )
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "The requested quantity exceeds available source stock."
            });
        }

        if (
            error.message.startsWith(
                "TRANSFER_QUANTITY_NOT_COMPLETED:"
            )
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "The requested transfer quantity could not be completed."
            });
        }

        return res.status(500).json({
            success: false,
            message:
                "Failed to complete branch transfer."
        });

    } finally {
        connection.release();
    }
};

/* BRANCH TRANSFER HISTORY*/
exports.getBranchTransferHistory = async (
    req,
    res
) => {
    const user =
        requireBusinessUser(req, res);

    if (!user) return;

    try {
        const [rows] = await db.query(`
            SELECT
                st.transfer_id,

                st.from_branch_id,

                source.branch_name
                    AS source_branch_name,

                st.to_branch_id,

                destination.branch_name
                    AS destination_branch_name,

                st.status,

                st.notes,

                st.initiated_by,

                CONCAT(
                    u.FirstName,
                    ' ',
                    u.LastName
                ) AS performed_by_name,

                st.completed_at,

                COUNT(
                    sti.transfer_item_id
                ) AS item_count,

                COALESCE(
                    SUM(sti.quantity),
                    0
                ) AS total_quantity

            FROM stock_transfers st

            INNER JOIN branches source
                ON source.branch_id =
                    st.from_branch_id
                AND source.business_id =
                    st.business_id

            INNER JOIN branches destination
                ON destination.branch_id =
                    st.to_branch_id
                AND destination.business_id =
                    st.business_id

            LEFT JOIN users u
                ON u.UserID =
                    st.initiated_by
                AND u.business_id =
                    st.business_id

            LEFT JOIN stock_transfer_items sti
                ON sti.transfer_id =
                    st.transfer_id
                AND sti.business_id =
                    st.business_id

            WHERE st.business_id = ?

            GROUP BY
                st.transfer_id,
                st.from_branch_id,
                source.branch_name,
                st.to_branch_id,
                destination.branch_name,
                st.status,
                st.notes,
                st.initiated_by,
                u.FirstName,
                u.LastName,
                st.completed_at

            ORDER BY
                st.transfer_id DESC

            LIMIT 100
        `, [
            user.business_id
        ]);

        return res.json({
            success: true,
            transfers: rows
        });

    } catch (error) {
        console.error(
            "getBranchTransferHistory error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load branch transfer history."
        });
    }
};

/*
|--------------------------------------------------------------------------
| ADJUST BRANCH STOCK
|--------------------------------------------------------------------------
| Manually increase or decrease stock for a product in a branch.
|
| IN:
|   OTHER -> BRANCH
|   Creates a new stock batch.
|
| OUT:
|   BRANCH -> OTHER
|   Deducts existing stock using FIFO.
|
| All operations are restricted to the authenticated user's business.
|--------------------------------------------------------------------------
*/

exports.adjustBranchStock = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) return;

    const {
        branch_id,
        product_id,
        direction,
        quantity,
        reason
    } = req.body;

    const branchId = Number(branch_id);
    const productId = Number(product_id);
    const requestedQuantity = Number(quantity);

    const adjustmentDirection = String(direction || "")
        .trim()
        .toUpperCase();

    const cleanReason = cleanText(reason, 255);

    /*
    |--------------------------------------------------------------------------
    | VALIDATION
    |--------------------------------------------------------------------------
    */

    if (!validId(branchId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid branch."
        });
    }

    if (!validId(productId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid product."
        });
    }

    if (!["IN", "OUT"].includes(adjustmentDirection)) {
        return res.status(400).json({
            success: false,
            message: "Direction must be IN or OUT."
        });
    }

    if (!validQuantity(requestedQuantity)) {
        return res.status(400).json({
            success: false,
            message: "Quantity must be greater than zero."
        });
    }

    if (!cleanReason) {
        return res.status(400).json({
            success: false,
            message: "A reason is required for a stock adjustment."
        });
    }

    const adjustedQuantity = roundQuantity(requestedQuantity);

    /*
    |--------------------------------------------------------------------------
    | IMPORTANT
    |--------------------------------------------------------------------------
    | Validate again after rounding.
    |--------------------------------------------------------------------------
    */

    if (!Number.isFinite(adjustedQuantity) || adjustedQuantity <= 0) {
        return res.status(400).json({
            success: false,
            message: "Quantity must be greater than zero."
        });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        /*
        |--------------------------------------------------------------------------
        | 1. VERIFY BRANCH
        |--------------------------------------------------------------------------
        */

        const [branchRows] = await connection.query(`
            SELECT
                branch_id,
                business_id,
                branch_name,
                is_active
            FROM branches
            WHERE branch_id = ?
              AND business_id = ?
            LIMIT 1
            FOR UPDATE
        `, [
            branchId,
            user.business_id
        ]);

        if (!branchRows.length) {
            throw new Error("BRANCH_NOT_FOUND");
        }

        const branch = branchRows[0];

        if (Number(branch.is_active) !== 1) {
            throw new Error("BRANCH_INACTIVE");
        }

        /*
        |--------------------------------------------------------------------------
        | 2. VERIFY PRODUCT BELONGS TO THIS BUSINESS AND BRANCH
        |--------------------------------------------------------------------------
        */

        const [productRows] = await connection.query(`
            SELECT
                p.product_id,
                p.business_id,
                p.branch_id,
                p.product_master_id,
                p.product_name,
                p.category,
                p.brand,
                p.unit,
                p.description,
                p.product_image,
                p.cost_price,
                p.selling_price,
                p.msrp,
                p.supplier_name,
                pm.product_code
            FROM products p

            INNER JOIN product_masters pm
                ON pm.product_master_id = p.product_master_id
                AND pm.business_id = p.business_id

            WHERE p.product_id = ?
              AND p.business_id = ?
              AND p.branch_id = ?

            LIMIT 1

            FOR UPDATE
        `, [
            productId,
            user.business_id,
            branchId
        ]);

        if (!productRows.length) {
            throw new Error("PRODUCT_NOT_IN_BRANCH");
        }

        const product = productRows[0];

        /*
        |--------------------------------------------------------------------------
        | 3. DETERMINE MOVEMENT SOURCE / DESTINATION
        |--------------------------------------------------------------------------
        |
        | IN:
        |   OTHER -> BRANCH
        |
        | OUT:
        |   BRANCH -> OTHER
        |--------------------------------------------------------------------------
        */

        const sourceType =
            adjustmentDirection === "IN"
                ? "OTHER"
                : "BRANCH";

        const destinationType =
            adjustmentDirection === "IN"
                ? "BRANCH"
                : "OTHER";

        const sourceBranchId =
            adjustmentDirection === "IN"
                ? null
                : branchId;

        const destinationBranchId =
            adjustmentDirection === "IN"
                ? branchId
                : null;

        /*
        |--------------------------------------------------------------------------
        | 4. CREATE INVENTORY MOVEMENT
        |--------------------------------------------------------------------------
        */

        const [movementResult] = await connection.query(`
            INSERT INTO inventory_movements
            (
                business_id,
                movement_type,
                source_type,
                source_branch_id,
                source_location_id,
                destination_type,
                destination_branch_id,
                destination_location_id,
                status,
                reference_type,
                reference_id,
                notes,
                performed_by,
                completed_at
            )
            VALUES
            (
                ?,
                'ADJUSTMENT',
                ?,
                ?,
                NULL,
                ?,
                ?,
                NULL,
                'COMPLETED',
                'STOCK_ADJUSTMENT',
                NULL,
                ?,
                ?,
                NOW()
            )
        `, [
            user.business_id,
            sourceType,
            sourceBranchId,
            destinationType,
            destinationBranchId,
            cleanReason,
            user.UserID
        ]);

        const movementId = movementResult.insertId;

        const movementItems = [];
        const stockMovements = [];

        let totalAdjustedQuantity = 0;

        /*
        |--------------------------------------------------------------------------
        | 5. STOCK IN
        |--------------------------------------------------------------------------
        |
        | OTHER -> BRANCH
        |
        | A new stock batch is created.
        |--------------------------------------------------------------------------
        */

        if (adjustmentDirection === "IN") {

            const now = new Date();

            const batchNumber =
                `ADJ-${now.getTime()}-${movementId}`;

            /*
            |--------------------------------------------------------------------------
            | CREATE NEW STOCK BATCH
            |--------------------------------------------------------------------------
            */

            const [stockResult] = await connection.query(`
                INSERT INTO stock
                (
                    business_id,
                    product_id,
                    branch_id,
                    batch_number,
                    quantity_received,
                    quantity_available,
                    stock_date,
                    expiry_date
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    CURDATE(),
                    NULL
                )
            `, [
                user.business_id,
                productId,
                branchId,
                batchNumber,
                adjustedQuantity,
                adjustedQuantity
            ]);

            const adjustmentStockId = stockResult.insertId;

            /*
            |--------------------------------------------------------------------------
            | INVENTORY MOVEMENT ITEM
            |--------------------------------------------------------------------------
            |
            | There is no source stock for an IN adjustment.
            |
            | Therefore source_stock_id remains NULL.
            |--------------------------------------------------------------------------
            */

            const [movementItemResult] = await connection.query(`
                INSERT INTO inventory_movement_items
                (
                    movement_id,
                    business_id,
                    product_id,
                    source_stock_id,
                    source_vehicle_stock_id,
                    quantity
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    NULL,
                    NULL,
                    ?
                )
            `, [
                movementId,
                user.business_id,
                productId,
                adjustedQuantity
            ]);

            movementItems.push({
                movement_item_id: movementItemResult.insertId,
                product_id: productId,
                stock_id: adjustmentStockId,
                batch_number: batchNumber,
                quantity: adjustedQuantity
            });

            /*
            |--------------------------------------------------------------------------
            | STOCK MOVEMENT LEDGER
            |--------------------------------------------------------------------------
            */

            const [stockMovementResult] = await connection.query(`
                INSERT INTO stock_movements
                (
                    business_id,
                    product_id,
                    stock_id,
                    branch_id,
                    movement_type,
                    movement_reason,
                    quantity,
                    reference_type,
                    reference_id,
                    from_branch_id,
                    to_branch_id,
                    performed_by,
                    reason
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    'IN',
                    'ADJUSTMENT',
                    ?,
                    'STOCK_ADJUSTMENT',
                    ?,
                    NULL,
                    ?,
                    ?,
                    ?
                )
            `, [
                user.business_id,
                productId,
                adjustmentStockId,
                branchId,
                adjustedQuantity,
                movementId,
                branchId,
                user.UserID,
                cleanReason
            ]);

            stockMovements.push({
                stock_movement_id: stockMovementResult.insertId,
                stock_id: adjustmentStockId,
                movement_type: "IN",
                quantity: adjustedQuantity
            });

            totalAdjustedQuantity = adjustedQuantity;
        }

        /*
        |--------------------------------------------------------------------------
        | 6. STOCK OUT
        |--------------------------------------------------------------------------
        |
        | BRANCH -> OTHER
        |
        | Existing stock is deducted using FIFO.
        |--------------------------------------------------------------------------
        */

        if (adjustmentDirection === "OUT") {

            /*
            |--------------------------------------------------------------------------
            | LOCK AVAILABLE STOCK BATCHES
            |--------------------------------------------------------------------------
            */

            const [sourceStocks] = await connection.query(`
                SELECT
                    stock_id,
                    product_id,
                    branch_id,
                    batch_number,
                    quantity_received,
                    quantity_available,
                    stock_date,
                    expiry_date
                FROM stock
                WHERE business_id = ?
                  AND branch_id = ?
                  AND product_id = ?
                  AND quantity_available > 0
                ORDER BY
                    stock_date ASC,
                    stock_id ASC
                FOR UPDATE
            `, [
                user.business_id,
                branchId,
                productId
            ]);

            if (!sourceStocks.length) {
                throw new Error("NO_AVAILABLE_STOCK");
            }

            /*
            |--------------------------------------------------------------------------
            | CALCULATE TOTAL AVAILABLE STOCK
            |--------------------------------------------------------------------------
            */

            const availableTotal = roundQuantity(
                sourceStocks.reduce(
                    (total, stock) =>
                        total + Number(stock.quantity_available),
                    0
                )
            );

            if (availableTotal < adjustedQuantity) {
                throw new Error("INSUFFICIENT_STOCK");
            }

            let remaining = adjustedQuantity;

            /*
            |--------------------------------------------------------------------------
            | FIFO DEDUCTION
            |--------------------------------------------------------------------------
            */

            for (const stock of sourceStocks) {

                if (remaining <= 0) {
                    break;
                }

                const available =
                    roundQuantity(
                        Number(stock.quantity_available)
                    );

                if (available <= 0) {
                    continue;
                }

                const moved =
                    roundQuantity(
                        Math.min(
                            available,
                            remaining
                        )
                    );

                if (moved <= 0) {
                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | DEDUCT STOCK
                |--------------------------------------------------------------------------
                */

                const [updateResult] = await connection.query(`
                    UPDATE stock
                    SET
                        quantity_available =
                            quantity_available - ?
                    WHERE stock_id = ?
                      AND business_id = ?
                      AND branch_id = ?
                      AND product_id = ?
                      AND quantity_available >= ?
                `, [
                    moved,
                    stock.stock_id,
                    user.business_id,
                    branchId,
                    productId,
                    moved
                ]);

                if (updateResult.affectedRows !== 1) {
                    throw new Error("STOCK_UPDATE_FAILED");
                }

                /*
                |--------------------------------------------------------------------------
                | INVENTORY MOVEMENT ITEM
                |--------------------------------------------------------------------------
                |
                | Here source_stock_id is correct because stock is
                | actually being removed from this batch.
                |--------------------------------------------------------------------------
                */

                const [movementItemResult] = await connection.query(`
                    INSERT INTO inventory_movement_items
                    (
                        movement_id,
                        business_id,
                        product_id,
                        source_stock_id,
                        source_vehicle_stock_id,
                        quantity
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        NULL,
                        ?
                    )
                `, [
                    movementId,
                    user.business_id,
                    productId,
                    stock.stock_id,
                    moved
                ]);

                movementItems.push({
                    movement_item_id:
                        movementItemResult.insertId,

                    product_id:
                        productId,

                    stock_id:
                        stock.stock_id,

                    batch_number:
                        stock.batch_number,

                    quantity:
                        moved
                });

                /*
                |--------------------------------------------------------------------------
                | STOCK MOVEMENT LEDGER
                |--------------------------------------------------------------------------
                */

                const [stockMovementResult] =
                    await connection.query(`
                        INSERT INTO stock_movements
                        (
                            business_id,
                            product_id,
                            stock_id,
                            branch_id,
                            movement_type,
                            movement_reason,
                            quantity,
                            reference_type,
                            reference_id,
                            from_branch_id,
                            to_branch_id,
                            performed_by,
                            reason
                        )
                        VALUES
                        (
                            ?,
                            ?,
                            ?,
                            ?,
                            'OUT',
                            'ADJUSTMENT',
                            ?,
                            'STOCK_ADJUSTMENT',
                            ?,
                            ?,
                            NULL,
                            ?,
                            ?
                        )
                    `, [
                        user.business_id,
                        productId,
                        stock.stock_id,
                        branchId,
                        moved,
                        movementId,
                        branchId,
                        user.UserID,
                        cleanReason
                    ]);

                stockMovements.push({
                    stock_movement_id:
                        stockMovementResult.insertId,

                    stock_id:
                        stock.stock_id,

                    movement_type:
                        "OUT",

                    quantity:
                        moved
                });

                totalAdjustedQuantity =
                    roundQuantity(
                        totalAdjustedQuantity + moved
                    );

                remaining =
                    roundQuantity(
                        remaining - moved
                    );
            }

            /*
            |--------------------------------------------------------------------------
            | FINAL SAFETY CHECK
            |--------------------------------------------------------------------------
            */

            if (remaining > 0) {
                throw new Error("ADJUSTMENT_NOT_COMPLETED");
            }
        }

        /*
        |--------------------------------------------------------------------------
        | 7. LINK INVENTORY MOVEMENT TO ITSELF
        |--------------------------------------------------------------------------
        |
        | reference_id = movement_id
        |--------------------------------------------------------------------------
        */

        await connection.query(`
            UPDATE inventory_movements
            SET
                reference_id = ?
            WHERE movement_id = ?
              AND business_id = ?
        `, [
            movementId,
            movementId,
            user.business_id
        ]);

        /*
        |--------------------------------------------------------------------------
        | 8. GET CURRENT AVAILABLE STOCK
        |--------------------------------------------------------------------------
        */

        const [balanceRows] = await connection.query(`
            SELECT
                COALESCE(
                    SUM(quantity_available),
                    0
                ) AS quantity_available
            FROM stock
            WHERE business_id = ?
              AND branch_id = ?
              AND product_id = ?
        `, [
            user.business_id,
            branchId,
            productId
        ]);

        const currentAvailableStock =
            roundQuantity(
                Number(
                    balanceRows[0].quantity_available
                )
            );

        /*
        |--------------------------------------------------------------------------
        | 9. COMMIT
        |--------------------------------------------------------------------------
        */

        await connection.commit();

        /*
        |--------------------------------------------------------------------------
        | 10. RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.status(201).json({
            success: true,
            message: "Stock adjusted successfully.",

            adjustment: {
                movement_id: movementId,

                branch_id: branchId,
                branch_name: branch.branch_name,

                product_id: productId,
                product_name: product.product_name,
                product_code: product.product_code,

                direction: adjustmentDirection,

                quantity: totalAdjustedQuantity,

                reason: cleanReason,

                performed_by: user.UserID,

                current_available_stock:
                    currentAvailableStock
            },

            movement_items:
                movementItems,

            stock_movements:
                stockMovements
        });

    } catch (error) {

        await connection.rollback();

        console.error(
            "adjustBranchStock error:",
            error
        );

        /*
        |--------------------------------------------------------------------------
        | ERROR HANDLING
        |--------------------------------------------------------------------------
        */

        if (error.message === "BRANCH_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "The selected branch was not found."
            });
        }

        if (error.message === "BRANCH_INACTIVE") {
            return res.status(409).json({
                success: false,
                message: "The selected branch is inactive."
            });
        }

        if (error.message === "PRODUCT_NOT_IN_BRANCH") {
            return res.status(409).json({
                success: false,
                message:
                    "The selected product does not belong to this branch."
            });
        }

        if (error.message === "NO_AVAILABLE_STOCK") {
            return res.status(409).json({
                success: false,
                message:
                    "No available stock exists for this product."
            });
        }

        if (error.message === "INSUFFICIENT_STOCK") {
            return res.status(409).json({
                success: false,
                message:
                    "The requested quantity exceeds available stock."
            });
        }

        if (error.message === "STOCK_UPDATE_FAILED") {
            return res.status(409).json({
                success: false,
                message:
                    "Stock could not be updated because it changed during the adjustment. Please try again."
            });
        }

        if (error.message === "ADJUSTMENT_NOT_COMPLETED") {
            return res.status(409).json({
                success: false,
                message:
                    "The requested stock adjustment could not be completed."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to adjust stock."
        });

    } finally {

        connection.release();
    }
};

/*
|--------------------------------------------------------------------------
| STOCK LOSS
|--------------------------------------------------------------------------
|
| Removes stock from a branch because of:
|
|   DAMAGE
|   SPOILED
|   EXPIRED
|   LOST
|   THEFT
|   OTHER
|
|--------------------------------------------------------------------------
| STOCK FLOW
|--------------------------------------------------------------------------
|
| Branch -> Other
|
| No new stock is created.
|
| Existing stock is deducted using FIFO.
|
|--------------------------------------------------------------------------
| SECURITY
|--------------------------------------------------------------------------
|
| The authenticated user's business_id is ALWAYS used.
|
| branch_id and product_id from the request are never trusted
| without verifying that they belong to the authenticated business.
|
|--------------------------------------------------------------------------
*/

exports.recordStockLoss = async (req, res) => {

    /*
    |--------------------------------------------------------------------------
    | AUTHORIZATION
    |--------------------------------------------------------------------------
    */

    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | REQUEST DATA
    |--------------------------------------------------------------------------
    */

    const {
        branch_id,
        product_id,
        movement_type,
        quantity,
        reason
    } = req.body;


    const branchId =
        Number(branch_id);

    const productId =
        Number(product_id);

    const requestedQuantity =
        Number(quantity);

    const lossType =
        String(movement_type || "")
            .trim()
            .toUpperCase();

    const cleanReason =
        cleanText(reason, 255);


    /*
    |--------------------------------------------------------------------------
    | ALLOWED LOSS TYPES
    |--------------------------------------------------------------------------
    */

    const allowedLossTypes = [
        "DAMAGE",
        "SPOILED",
        "EXPIRED",
        "LOST",
        "THEFT",
        "OTHER"
    ];


    /*
    |--------------------------------------------------------------------------
    | VALIDATION
    |--------------------------------------------------------------------------
    */

    if (!validId(branchId)) {

        return res.status(400).json({
            success: false,
            message: "Invalid branch."
        });
    }


    if (!validId(productId)) {

        return res.status(400).json({
            success: false,
            message: "Invalid product."
        });
    }


    if (!allowedLossTypes.includes(lossType)) {

        return res.status(400).json({
            success: false,
            message:
                "Invalid stock loss reason."
        });
    }


    if (!validQuantity(requestedQuantity)) {

        return res.status(400).json({
            success: false,
            message:
                "Quantity must be greater than zero."
        });
    }


    const lossQuantity =
        roundQuantity(requestedQuantity);


    if (
        !Number.isFinite(lossQuantity) ||
        lossQuantity <= 0
    ) {

        return res.status(400).json({
            success: false,
            message:
                "Quantity must be greater than zero."
        });
    }


    /*
    |--------------------------------------------------------------------------
    | OPTIONAL NOTES
    |--------------------------------------------------------------------------
    |
    | The HBS currently sends `reason`.
    |
    | Since reason is now the selected option, the controller
    | uses it as the official loss type.
    |
    | If you later add a separate `notes` field, it can be
    | stored in inventory_movements.notes.
    |
    */

    const notes =
        `${lossType} stock loss`;


    /*
    |--------------------------------------------------------------------------
    | DATABASE CONNECTION
    |--------------------------------------------------------------------------
    */

    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
        |--------------------------------------------------------------------------
        | VERIFY BRANCH
        |--------------------------------------------------------------------------
        |
        | IMPORTANT:
        |
        | branch_id must belong to the authenticated business.
        |
        */

        const [branchRows] =
            await connection.query(`
                SELECT
                    branch_id,
                    business_id,
                    branch_name,
                    is_active
                FROM branches
                WHERE branch_id = ?
                  AND business_id = ?
                LIMIT 1
                FOR UPDATE
            `, [
                branchId,
                user.business_id
            ]);


        if (!branchRows.length) {

            throw new Error(
                "BRANCH_NOT_FOUND"
            );
        }


        const branch =
            branchRows[0];


        /*
        |--------------------------------------------------------------------------
        | CHECK BRANCH STATUS
        |--------------------------------------------------------------------------
        */

        if (
            Number(branch.is_active) !== 1
        ) {

            throw new Error(
                "BRANCH_INACTIVE"
            );
        }


        const [productRows] =
            await connection.query(`
                SELECT
                    p.product_id,
                    p.business_id,
                    p.branch_id,
                    p.product_master_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.description,
                    p.product_image,
                    p.cost_price,
                    p.selling_price,
                    p.msrp,
                    p.supplier_name,
                    pm.product_code
                FROM products p

                INNER JOIN product_masters pm
                    ON pm.product_master_id =
                       p.product_master_id

                    AND pm.business_id =
                        p.business_id

                WHERE p.product_id = ?
                  AND p.business_id = ?
                  AND p.branch_id = ?

                LIMIT 1

                FOR UPDATE
            `, [
                productId,
                user.business_id,
                branchId
            ]);


        if (!productRows.length) {

            throw new Error(
                "PRODUCT_NOT_IN_BRANCH"
            );
        }


        const product =
            productRows[0];



        const [sourceStocks] =
            await connection.query(`
                SELECT
                    stock_id,
                    business_id,
                    product_id,
                    branch_id,
                    batch_number,
                    quantity_received,
                    quantity_available,
                    stock_date,
                    expiry_date

                FROM stock

                WHERE business_id = ?
                  AND branch_id = ?
                  AND product_id = ?
                  AND quantity_available > 0

                ORDER BY
                    stock_date ASC,
                    stock_id ASC

                FOR UPDATE
            `, [
                user.business_id,
                branchId,
                productId
            ]);


        if (!sourceStocks.length) {

            throw new Error(
                "NO_AVAILABLE_STOCK"
            );
        }

        const availableTotal =
            roundQuantity(
                sourceStocks.reduce(
                    (total, stock) => {

                        return (
                            total +
                            Number(
                                stock.quantity_available
                            )
                        );

                    },
                    0
                )
            );


        if (
            availableTotal <
            lossQuantity
        ) {

            throw new Error(
                "INSUFFICIENT_STOCK"
            );
        }

        const [movementResult] =
            await connection.query(`
                INSERT INTO inventory_movements
                (
                    business_id,
                    movement_type,
                    source_type,
                    source_branch_id,
                    source_location_id,
                    destination_type,
                    destination_branch_id,
                    destination_location_id,
                    status,
                    reference_type,
                    reference_id,
                    notes,
                    performed_by,
                    completed_at
                )

                VALUES
                (
                    ?,
                    ?,
                    'BRANCH',
                    ?,
                    NULL,
                    'OTHER',
                    NULL,
                    NULL,
                    'COMPLETED',
                    'STOCK_LOSS',
                    NULL,
                    ?,
                    ?,
                    NOW()
                )
            `, [
                user.business_id,
                lossType,
                branchId,
                notes,
                user.UserID
            ]);


        const movementId =
            movementResult.insertId;

        await connection.query(`
            UPDATE inventory_movements

            SET reference_id = ?

            WHERE movement_id = ?
              AND business_id = ?
        `, [
            movementId,
            movementId,
            user.business_id
        ]);

        let remaining =
            lossQuantity;

        let totalRemoved =
            0;

        const movementItems =
            [];

        const stockMovements =
            [];

        for (const stock of sourceStocks) {

            if (remaining <= 0) {
                break;
            }


            const available =
                roundQuantity(
                    Number(
                        stock.quantity_available
                    )
                );


            if (available <= 0) {
                continue;
            }

            const removedQuantity =
                roundQuantity(
                    Math.min(
                        available,
                        remaining
                    )
                );


            if (removedQuantity <= 0) {
                continue;
            }

            const [updateResult] =
                await connection.query(`
                    UPDATE stock

                    SET
                        quantity_available =
                            quantity_available - ?

                    WHERE stock_id = ?
                      AND business_id = ?
                      AND branch_id = ?
                      AND product_id = ?
                      AND quantity_available >= ?
                `, [
                    removedQuantity,
                    stock.stock_id,
                    user.business_id,
                    branchId,
                    productId,
                    removedQuantity
                ]);


            if (
                updateResult.affectedRows !== 1
            ) {

                throw new Error(
                    "STOCK_UPDATE_FAILED"
                );
            }

            const [movementItemResult] =
                await connection.query(`
                    INSERT INTO inventory_movement_items
                    (
                        movement_id,
                        business_id,
                        product_id,
                        source_stock_id,
                        source_vehicle_stock_id,
                        quantity
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        NULL,
                        ?
                    )
                `, [
                    movementId,
                    user.business_id,
                    productId,
                    stock.stock_id,
                    removedQuantity
                ]);


            movementItems.push({

                movement_item_id:
                    movementItemResult.insertId,

                product_id:
                    productId,

                stock_id:
                    stock.stock_id,

                batch_number:
                    stock.batch_number,

                quantity:
                    removedQuantity
            });

            const [stockMovementResult] =
                await connection.query(`
                    INSERT INTO stock_movements
                    (
                        business_id,
                        product_id,
                        stock_id,
                        branch_id,
                        movement_type,
                        movement_reason,
                        quantity,
                        reference_type,
                        reference_id,
                        from_branch_id,
                        to_branch_id,
                        performed_by,
                        reason
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        'OUT',
                        ?,
                        ?,
                        'STOCK_LOSS',
                        ?,
                        ?,
                        NULL,
                        ?,
                        ?
                    )
                `, [
                    user.business_id,
                    productId,
                    stock.stock_id,
                    branchId,
                    lossType,
                    removedQuantity,
                    movementId,
                    branchId,
                    user.UserID,
                    notes
                ]);


            stockMovements.push({

                stock_movement_id:
                    stockMovementResult.insertId,

                stock_id:
                    stock.stock_id,

                movement_type:
                    "OUT",

                movement_reason:
                    lossType,

                quantity:
                    removedQuantity
            });


            totalRemoved =
                roundQuantity(
                    totalRemoved +
                    removedQuantity
                );


            remaining =
                roundQuantity(
                    remaining -
                    removedQuantity
                );
        }

        if (remaining > 0) {

            throw new Error(
                "LOSS_NOT_COMPLETED"
            );
        }

        const [balanceRows] =
            await connection.query(`
                SELECT
                    COALESCE(
                        SUM(quantity_available),
                        0
                    ) AS quantity_available

                FROM stock

                WHERE business_id = ?
                  AND branch_id = ?
                  AND product_id = ?
            `, [
                user.business_id,
                branchId,
                productId
            ]);


        const currentAvailableStock =
            roundQuantity(
                Number(
                    balanceRows[0]
                        .quantity_available
                )
            );

        await connection.commit();

        return res.status(201).json({

            success: true,

            message:
                "Stock loss recorded successfully.",

            loss: {

                movement_id:
                    movementId,

                branch_id:
                    branchId,

                branch_name:
                    branch.branch_name,

                product_id:
                    productId,

                product_name:
                    product.product_name,

                product_code:
                    product.product_code,

                movement_type:
                    lossType,

                quantity:
                    totalRemoved,

                notes:
                    cleanReason || null,

                performed_by:
                    user.UserID,

                current_available_stock:
                    currentAvailableStock
            },

            movement_items:
                movementItems,

            stock_movements:
                stockMovements
        });


    } catch (error) {

        await connection.rollback();


        console.error(
            "recordStockLoss error:",
            error
        );


        if (
            error.message ===
            "BRANCH_NOT_FOUND"
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "The selected branch was not found."
            });
        }


        if (
            error.message ===
            "BRANCH_INACTIVE"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "The selected branch is inactive."
            });
        }


        if (
            error.message ===
            "PRODUCT_NOT_IN_BRANCH"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "The selected product does not belong to this branch."
            });
        }


        if (
            error.message ===
            "NO_AVAILABLE_STOCK"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "No available stock exists for this product."
            });
        }


        if (
            error.message ===
            "INSUFFICIENT_STOCK"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "The requested loss quantity exceeds available stock."
            });
        }


        if (
            error.message ===
            "STOCK_UPDATE_FAILED"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "Stock could not be updated because it changed during the loss operation. Please try again."
            });
        }


        if (
            error.message ===
            "LOSS_NOT_COMPLETED"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "The stock loss could not be completed."
            });
        }

        return res.status(500).json({
            success: false,
            message:
                "Failed to record stock loss."
        });

    } finally {

        connection.release();
    }
};

exports.recordStockReturn = async (req, res) => {
    let connection;

    try {
        const { branch_id, product_id, return_type, quantity, reason } = req.body;

        if (!req.user || !req.user.UserID || !req.user.business_id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const businessId = Number(req.user.business_id);
        const userId = Number(req.user.UserID);
        const branchId = Number(branch_id);
        const productId = Number(product_id);
        const returnType = String(return_type || "").trim().toUpperCase();
        const returnQuantity = Number(quantity);
        const cleanReason = reason ? String(reason).trim().substring(0, 255) : null;

        if (!Number.isInteger(branchId) || branchId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid branch."
            });
        }

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid product."
            });
        }

        if (!["CUSTOMER_RETURN", "SUPPLIER_RETURN"].includes(returnType)) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid return type."
            });
        }

        if (!Number.isFinite(returnQuantity) || returnQuantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be greater than zero."
            });
        }

        const roundedQuantity =
            Math.round(returnQuantity * 1000) / 1000;

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [branchRows] = await connection.query(
            `
            SELECT branch_id, branch_name, is_active
            FROM branches
            WHERE branch_id = ?
              AND business_id = ?
            FOR UPDATE
            `,
            [branchId, businessId]
        );

        if (!branchRows.length) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Branch not found."
            });
        }

        if (!branchRows[0].is_active) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "The selected branch is inactive."
            });
        }

        const [productRows] = await connection.query(
            `
            SELECT
                p.product_id,
                p.product_name,
                p.cost_price,
                p.selling_price
            FROM products p
            INNER JOIN product_masters pm
                ON pm.product_master_id = p.product_master_id
            WHERE p.product_id = ?
              AND p.business_id = ?
              AND p.branch_id = ?
            FOR UPDATE
            `,
            [productId, businessId, branchId]
        );

        if (!productRows.length) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Product not found in the selected branch."
            });
        }

        const product = productRows[0];

        if (returnType === "CUSTOMER_RETURN") {
            const [movementResult] = await connection.query(
                `
                INSERT INTO inventory_movements (
                    business_id,
                    movement_type,
                    source_type,
                    source_branch_id,
                    destination_type,
                    destination_branch_id,
                    status,
                    reference_type,
                    reference_id,
                    notes,
                    performed_by,
                    completed_at
                )
                VALUES (
                    ?,
                    'CUSTOMER_RETURN',
                    'OTHER',
                    NULL,
                    'BRANCH',
                    ?,
                    'COMPLETED',
                    'STOCK_RETURN',
                    NULL,
                    ?,
                    ?,
                    NOW()
                )
                `,
                [
                    businessId,
                    branchId,
                    cleanReason,
                    userId
                ]
            );

            const movementId = movementResult.insertId;

            await connection.query(
                `
                UPDATE inventory_movements
                SET reference_id = ?
                WHERE movement_id = ?
                  AND business_id = ?
                `,
                [movementId, movementId, businessId]
            );

            const batchNumber =
                `RETURN-${movementId}-${productId}`;

            const [stockResult] = await connection.query(
                `
                INSERT INTO stock (
                    business_id,
                    product_id,
                    branch_id,
                    batch_number,
                    quantity_received,
                    quantity_available,
                    stock_date
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    CURDATE()
                )
                `,
                [
                    businessId,
                    productId,
                    branchId,
                    batchNumber,
                    roundedQuantity,
                    roundedQuantity
                ]
            );

            const stockId = stockResult.insertId;

            const [itemResult] = await connection.query(
                `
                INSERT INTO inventory_movement_items (
                    movement_id,
                    business_id,
                    product_id,
                    source_stock_id,
                    quantity
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    NULL,
                    ?
                )
                `,
                [
                    movementId,
                    businessId,
                    productId,
                    roundedQuantity
                ]
            );

            const [stockMovementResult] = await connection.query(
                `
                INSERT INTO stock_movements (
                    business_id,
                    product_id,
                    stock_id,
                    branch_id,
                    movement_type,
                    movement_reason,
                    quantity,
                    reference_type,
                    reference_id,
                    from_branch_id,
                    to_branch_id,
                    performed_by,
                    reason
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    'IN',
                    'CUSTOMER_RETURN',
                    ?,
                    'STOCK_RETURN',
                    ?,
                    NULL,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    businessId,
                    productId,
                    stockId,
                    branchId,
                    roundedQuantity,
                    movementId,
                    branchId,
                    userId,
                    cleanReason || "Customer return"
                ]
            );

            const [balanceRows] = await connection.query(
                `
                SELECT COALESCE(SUM(quantity_available), 0) AS total_available
                FROM stock
                WHERE business_id = ?
                  AND branch_id = ?
                  AND product_id = ?
                `,
                [businessId, branchId, productId]
            );

            const totalAvailable =
                Number(balanceRows[0].total_available || 0);

            await connection.commit();

            return res.status(201).json({
                success: true,
                message: "Customer return processed successfully.",
                return: {
                    movement_id: movementId,
                    movement_item_id: itemResult.insertId,
                    stock_movement_id: stockMovementResult.insertId,
                    stock_id: stockId,
                    return_type: returnType,
                    branch_id: branchId,
                    product_id: productId,
                    product_name: product.product_name,
                    quantity: roundedQuantity,
                    reason: cleanReason,
                    movement_type: "IN",
                    total_available: Number(totalAvailable.toFixed(3))
                }
            });
        }

        const [stockRows] = await connection.query(
            `
            SELECT
                stock_id,
                batch_number,
                quantity_available,
                stock_date
            FROM stock
            WHERE business_id = ?
              AND product_id = ?
              AND branch_id = ?
              AND quantity_available > 0
            ORDER BY stock_date ASC, stock_id ASC
            FOR UPDATE
            `,
            [businessId, productId, branchId]
        );

        if (!stockRows.length) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "There is no available stock for this product."
            });
        }

        const totalAvailableBefore = stockRows.reduce(
            (total, row) =>
                total + Number(row.quantity_available || 0),
            0
        );

        const available =
            Math.round(totalAvailableBefore * 1000) / 1000;

        if (roundedQuantity > available) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    `Cannot return ${roundedQuantity.toFixed(3)} units. ` +
                    `Only ${available.toFixed(3)} units are available.`
            });
        }

        const [movementResult] = await connection.query(
            `
            INSERT INTO inventory_movements (
                business_id,
                movement_type,
                source_type,
                source_branch_id,
                destination_type,
                destination_branch_id,
                status,
                reference_type,
                reference_id,
                notes,
                performed_by,
                completed_at
            )
            VALUES (
                ?,
                'SUPPLIER_RETURN',
                'BRANCH',
                ?,
                'OTHER',
                NULL,
                'COMPLETED',
                'STOCK_RETURN',
                NULL,
                ?,
                ?,
                NOW()
            )
            `,
            [
                businessId,
                branchId,
                cleanReason,
                userId
            ]
        );

        const movementId = movementResult.insertId;

        await connection.query(
            `
            UPDATE inventory_movements
            SET reference_id = ?
            WHERE movement_id = ?
              AND business_id = ?
            `,
            [movementId, movementId, businessId]
        );

        let remainingQuantity = roundedQuantity;
        const returnedItems = [];

        for (const stockRow of stockRows) {
            if (remainingQuantity <= 0) {
                break;
            }

            const availableInBatch =
                Number(stockRow.quantity_available || 0);

            const quantityFromBatch =
                Math.min(remainingQuantity, availableInBatch);

            const batchQuantity =
                Math.round(quantityFromBatch * 1000) / 1000;

            if (batchQuantity <= 0) {
                continue;
            }

            const [updateResult] = await connection.query(
                `
                UPDATE stock
                SET quantity_available =
                    quantity_available - ?
                WHERE stock_id = ?
                  AND business_id = ?
                  AND product_id = ?
                  AND branch_id = ?
                  AND quantity_available >= ?
                `,
                [
                    batchQuantity,
                    stockRow.stock_id,
                    businessId,
                    productId,
                    branchId,
                    batchQuantity
                ]
            );

            if (updateResult.affectedRows !== 1) {
                throw new Error(
                    "Stock changed while processing the return. Please try again."
                );
            }

            const [itemResult] = await connection.query(
                `
                INSERT INTO inventory_movement_items (
                    movement_id,
                    business_id,
                    product_id,
                    source_stock_id,
                    quantity
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    movementId,
                    businessId,
                    productId,
                    stockRow.stock_id,
                    batchQuantity
                ]
            );

            const [stockMovementResult] = await connection.query(
                `
                INSERT INTO stock_movements (
                    business_id,
                    product_id,
                    stock_id,
                    branch_id,
                    movement_type,
                    movement_reason,
                    quantity,
                    reference_type,
                    reference_id,
                    from_branch_id,
                    to_branch_id,
                    performed_by,
                    reason
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    'OUT',
                    'SUPPLIER_RETURN',
                    ?,
                    'STOCK_RETURN',
                    ?,
                    ?,
                    NULL,
                    ?,
                    ?
                )
                `,
                [
                    businessId,
                    productId,
                    stockRow.stock_id,
                    branchId,
                    batchQuantity,
                    movementId,
                    branchId,
                    userId,
                    cleanReason || "Supplier return"
                ]
            );

            returnedItems.push({
                movement_item_id: itemResult.insertId,
                stock_movement_id: stockMovementResult.insertId,
                stock_id: stockRow.stock_id,
                batch_number: stockRow.batch_number,
                quantity: batchQuantity
            });

            remainingQuantity =
                Math.round(
                    (remainingQuantity - batchQuantity) * 1000
                ) / 1000;
        }

        if (remainingQuantity > 0) {
            throw new Error(
                "Unable to complete the supplier return."
            );
        }

        const [balanceRows] = await connection.query(
            `
            SELECT COALESCE(SUM(quantity_available), 0) AS total_available
            FROM stock
            WHERE business_id = ?
              AND branch_id = ?
              AND product_id = ?
            `,
            [businessId, branchId, productId]
        );

        const totalAvailable =
            Number(balanceRows[0].total_available || 0);

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Supplier return processed successfully.",
            return: {
                movement_id: movementId,
                return_type: returnType,
                branch_id: branchId,
                product_id: productId,
                product_name: product.product_name,
                quantity: roundedQuantity,
                reason: cleanReason,
                movement_type: "OUT",
                total_available: Number(totalAvailable.toFixed(3)),
                stock_items: returnedItems
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Return rollback error:", rollbackError);
            }
        }

        console.error("Stock return error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Unable to process stock return."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};

