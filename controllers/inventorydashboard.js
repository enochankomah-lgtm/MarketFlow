const db = require("../Database/db");

/* ============================================================
   INVENTORY SCOPE
   ============================================================ */

const normalizeMode = value =>
    String(value || "").trim().toLowerCase() === "branch"
        ? "branch"
        : "business";

const getSessionScope = req =>
    req.session?.inventoryScope || null;

async function resolveInventoryScope(req) {
    const user = req.user || req.session?.user;

    if (!user?.business_id) {
        const error = new Error("Missing authenticated business context.");
        error.statusCode = 403;
        throw error;
    }

    const businessId = Number(user.business_id);

    if (!Number.isInteger(businessId) || businessId <= 0) {
        const error = new Error("Invalid business context.");
        error.statusCode = 403;
        throw error;
    }

    const sessionScope = getSessionScope(req);

    const requestedMode =
        req.query?.scope ??
        req.query?.mode ??
        sessionScope?.mode;

    const mode = normalizeMode(requestedMode);

    let branchId = null;

    if (mode === "branch") {
        const requestedBranch =
            req.query?.branch_id ??
            req.query?.branchId ??
            sessionScope?.branch_id;

        branchId = Number(requestedBranch);

        if (!Number.isInteger(branchId) || branchId <= 0) {
            const error = new Error("A valid branch must be selected.");
            error.statusCode = 400;
            throw error;
        }

        const [branches] = await db.query(
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
            `,
            [branchId, businessId]
        );

        if (!branches.length) {
            const error = new Error(
                "The selected branch does not belong to your business or is inactive."
            );

            error.statusCode = 403;
            throw error;
        }

        return {
            businessId,
            branchId,
            mode: "branch",
            businessName: user.Business_name || null,
            branchName: branches[0].branch_name,
            branchLocation: branches[0].location || null
        };
    }

    return {
        businessId,
        branchId: null,
        mode: "business",
        businessName: user.Business_name || null,
        branchName: null,
        branchLocation: null
    };
}


/* ============================================================
   SCOPE SQL HELPERS
   ============================================================ */

function scopeCte(scope) {
    return {
        sql: `
            scope AS (
                SELECT
                    ? AS business_id,
                    ? AS branch_id,
                    ? AS mode
            )
        `,
        params: [
            scope.businessId,
            scope.branchId,
            scope.mode
        ]
    };
}

function scopedStock(alias = "st", scopeAlias = "sc") {
    return `
        ${alias}.business_id = ${scopeAlias}.business_id
        AND (
            ${scopeAlias}.mode = "business"
            OR ${alias}.branch_id = ${scopeAlias}.branch_id
        )
    `;
}

function scopedProducts(alias = "p", scopeAlias = "sc") {
    return `
        ${alias}.business_id = ${scopeAlias}.business_id
        AND (
            ${scopeAlias}.mode = "business"
            OR ${alias}.branch_id = ${scopeAlias}.branch_id
        )
    `;
}

function scopedSales(alias = "s", scopeAlias = "sc") {
    return `
        ${alias}.business_id = ${scopeAlias}.business_id
        AND (
            ${scopeAlias}.mode = "business"
            OR ${alias}.branch_id = ${scopeAlias}.branch_id
        )
    `;
}

function scopedSalesItem(alias = "si", scopeAlias = "sc") {
    return `
        ${alias}.business_id = ${scopeAlias}.business_id
        AND (
            ${scopeAlias}.mode = "business"
            OR ${alias}.branch_id = ${scopeAlias}.branch_id
        )
    `;
}

async function execute(scope, query) {
    return db.query(
        query.sql,
        query.params || []
    );
}
/* ============================================================
   INVENTORY DASHBOARD
   ============================================================ */

exports.inventoryDashboard = async (req, res) => {
    try {
        const scope = await resolveInventoryScope(req);

        const [branchRows] = await db.query(
            `
            SELECT
                branch_id,
                branch_name,
                location
            FROM branches
            WHERE business_id = ?
              AND is_active = 1
            ORDER BY branch_name ASC
            `,
            [scope.businessId]
        );

        const [
            [summaryRows],
            [byUnit],
            [byCategory],
            [bySupplier],
            [products],
            [stockoutRisk],
            [reorderPoint],
            [overstock],
            [deadStock],
            [aging],
            [agingSummary],
            [expired],
            [expiring],
            [expirySummary],
            [abc],
            [turnover],
            [salesByDate],
            [stockReceivedByDate],
            [movement],
            [neverSoldProducts]
        ] = await Promise.all([
            execute(scope, summaryQuery(scope)),
            execute(scope, byUnitQuery(scope)),
            execute(scope, byCategoryQuery(scope)),
            execute(scope, bySupplierQuery(scope)),
            execute(scope, masterProductQuery(scope)),
            execute(scope, stockoutRiskQuery(scope)),
            execute(scope, reorderPointQuery(scope)),
            execute(scope, overstockQuery(scope)),
            execute(scope, deadStockQuery(scope)),
            execute(scope, agingQuery(scope)),
            execute(scope, agingSummaryQuery(scope)),
            execute(scope, expiredQuery(scope)),
            execute(scope, expiringQuery(scope)),
            execute(scope, expirySummaryQuery(scope)),
            execute(scope, abcQuery(scope)),
            execute(scope, turnoverQuery(scope)),
            execute(scope, salesByDateQuery(scope)),
            execute(scope, stockReceivedByDateQuery(scope)),
            execute(scope, movementQuery(scope)),
            execute(scope, neverSoldQuery(scope))
        ]);

        return res.render("inventoryanalyst", {
            scope,

            branches: branchRows,

            summary: summaryRows[0] || {},

            byUnit,
            byCategory,
            bySupplier,

            products,

            stockoutRisk,
            reorderPoint,
            overstock,

            deadStock,

            aging,
            agingSummary,

            expired,
            expiring,
            expirySummary,

            abc,
            turnover,

            salesByDate,
            stockReceivedByDate,
            movement,

            neverSoldProducts
        });

    } catch (error) {
        console.error("Inventory analysis error:", error);

        return res.status(error.statusCode || 500).send(
            error.statusCode
                ? error.message
                : "Unable to load inventory analysis."
        );
    }
};


/* ============================================================
   INVENTORY SUMMARY QUERY
   ============================================================ */

function summaryQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.cost_price,
                    p.selling_price,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN st.quantity_available > 0
                                THEN st.quantity_available
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_available

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.cost_price,
                    p.selling_price
            )

            SELECT
                COUNT(*) AS total_products,

                SUM(
                    CASE
                        WHEN quantity_available > 0
                        THEN 1
                        ELSE 0
                    END
                ) AS products_in_stock,

                SUM(
                    CASE
                        WHEN quantity_available <= 0
                        THEN 1
                        ELSE 0
                    END
                ) AS out_of_stock_products,

                ROUND(
                    SUM(
                        quantity_available * cost_price
                    ),
                    2
                ) AS inventory_cost_value,

                ROUND(
                    SUM(
                        quantity_available * selling_price
                    ),
                    2
                ) AS potential_sales_value,

                ROUND(
                    SUM(
                        quantity_available *
                        (selling_price - cost_price)
                    ),
                    2
                ) AS potential_gross_profit

            FROM inventory
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   INVENTORY BY UNIT
   ============================================================ */

function byUnitQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql}

            SELECT
                p.unit,

                SUM(
                    CASE
                        WHEN st.quantity_available > 0
                        THEN st.quantity_available
                        ELSE 0
                    END
                ) AS total_quantity,

                COUNT(
                    DISTINCT CASE
                        WHEN st.quantity_available > 0
                        THEN p.product_id
                    END
                ) AS products_with_stock,

                ROUND(
                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available * p.cost_price
                            ELSE 0
                        END
                    ),
                    2
                ) AS inventory_cost_value,

                ROUND(
                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available * p.selling_price
                            ELSE 0
                        END
                    ),
                    2
                ) AS potential_sales_value

            FROM products p

            CROSS JOIN scope sc

            LEFT JOIN stock st
                ON st.product_id = p.product_id
               AND ${scopedStock("st", "sc")}

            WHERE ${scopedProducts("p", "sc")}

            GROUP BY p.unit

            ORDER BY inventory_cost_value DESC
        `,
        params: scopeDefinition.params
    };
}
/* ============================================================
   INVENTORY BY CATEGORY
   ============================================================ */

function byCategoryQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    st.product_id,

                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available
                            ELSE 0
                        END
                    ) AS quantity_available,

                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available * p2.cost_price
                            ELSE 0
                        END
                    ) AS inventory_cost_value,

                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available * p2.selling_price
                            ELSE 0
                        END
                    ) AS potential_sales_value,

                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available *
                                 (p2.selling_price - p2.cost_price)
                            ELSE 0
                        END
                    ) AS potential_gross_profit

                FROM stock st

                INNER JOIN products p2
                    ON p2.product_id = st.product_id

                CROSS JOIN scope sc

                WHERE ${scopedStock("st", "sc")}
                  AND ${scopedProducts("p2", "sc")}

                GROUP BY st.product_id
            )

            SELECT
                p.category,

                COUNT(DISTINCT p.product_id)
                    AS total_products,

                COUNT(
                    DISTINCT CASE
                        WHEN COALESCE(i.quantity_available, 0) > 0
                        THEN p.product_id
                    END
                ) AS products_in_stock,

                COUNT(
                    DISTINCT CASE
                        WHEN COALESCE(i.quantity_available, 0) <= 0
                        THEN p.product_id
                    END
                ) AS out_of_stock_products,

                COALESCE(
                    SUM(i.quantity_available),
                    0
                ) AS quantity_available,

                ROUND(
                    COALESCE(
                        SUM(i.inventory_cost_value),
                        0
                    ),
                    2
                ) AS inventory_cost_value,

                ROUND(
                    COALESCE(
                        SUM(i.potential_sales_value),
                        0
                    ),
                    2
                ) AS potential_sales_value,

                ROUND(
                    COALESCE(
                        SUM(i.potential_gross_profit),
                        0
                    ),
                    2
                ) AS potential_gross_profit

            FROM products p

            CROSS JOIN scope sc

            LEFT JOIN inventory i
                ON i.product_id = p.product_id

            WHERE ${scopedProducts("p", "sc")}

            GROUP BY p.category

            ORDER BY inventory_cost_value DESC
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   INVENTORY BY SUPPLIER
   ============================================================ */

function bySupplierQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    st.product_id,

                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available
                            ELSE 0
                        END
                    ) AS quantity_available,

                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available * p2.cost_price
                            ELSE 0
                        END
                    ) AS inventory_cost_value,

                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available * p2.selling_price
                            ELSE 0
                        END
                    ) AS potential_sales_value,

                    SUM(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.quantity_available *
                                 (p2.selling_price - p2.cost_price)
                            ELSE 0
                        END
                    ) AS potential_gross_profit

                FROM stock st

                INNER JOIN products p2
                    ON p2.product_id = st.product_id

                CROSS JOIN scope sc

                WHERE ${scopedStock("st", "sc")}
                  AND ${scopedProducts("p2", "sc")}

                GROUP BY st.product_id
            )

            SELECT
                COALESCE(
                    p.supplier_name,
                    'Unknown'
                ) AS supplier,

                COUNT(
                    DISTINCT p.product_id
                ) AS total_products,

                COUNT(
                    DISTINCT CASE
                        WHEN COALESCE(
                            i.quantity_available,
                            0
                        ) > 0
                        THEN p.product_id
                    END
                ) AS products_in_stock,

                COALESCE(
                    SUM(i.quantity_available),
                    0
                ) AS quantity_available,

                ROUND(
                    COALESCE(
                        SUM(i.inventory_cost_value),
                        0
                    ),
                    2
                ) AS inventory_cost_value,

                ROUND(
                    COALESCE(
                        SUM(i.potential_sales_value),
                        0
                    ),
                    2
                ) AS potential_sales_value,

                ROUND(
                    COALESCE(
                        SUM(i.potential_gross_profit),
                        0
                    ),
                    2
                ) AS potential_gross_profit

            FROM products p

            CROSS JOIN scope sc

            LEFT JOIN inventory i
                ON i.product_id = p.product_id

            WHERE ${scopedProducts("p", "sc")}

            GROUP BY
                p.supplier_name

            ORDER BY
                inventory_cost_value DESC
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   MASTER PRODUCT ANALYSIS
   ============================================================ */

function masterProductQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.supplier_name,
                    p.cost_price,
                    p.selling_price,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN st.quantity_available > 0
                                THEN st.quantity_available
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_available,

                    ROUND(
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN st.quantity_available > 0
                                    THEN st.quantity_available * p.cost_price
                                    ELSE 0
                                END
                            ),
                            0
                        ),
                        2
                    ) AS inventory_cost_value,

                    ROUND(
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN st.quantity_available > 0
                                    THEN st.quantity_available * p.selling_price
                                    ELSE 0
                                END
                            ),
                            0
                        ),
                        2
                    ) AS potential_sales_value,

                    ROUND(
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN st.quantity_available > 0
                                    THEN st.quantity_available *
                                         (p.selling_price - p.cost_price)
                                    ELSE 0
                                END
                            ),
                            0
                        ),
                        2
                    ) AS potential_gross_profit

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.supplier_name,
                    p.cost_price,
                    p.selling_price
            ),

            velocity AS (
                SELECT
                    p.product_id,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN s.sale_id IS NOT NULL
                                 AND s.created_at >= DATE_SUB(
                                     CURDATE(),
                                     INTERVAL 30 DAY
                                 )
                                THEN si.quantity
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_sold_30d

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND s.sale_status = 'Completed'
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY p.product_id
            ),

            last_sale AS (
                SELECT
                    p.product_id,

                    MAX(
                        CASE
                            WHEN s.sale_status = 'Completed'
                            THEN s.created_at
                        END
                    ) AS last_sale_date

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY p.product_id
            ),

            cogs_12m AS (
                SELECT
                    p.product_id,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN s.sale_status = 'Completed'
                                 AND s.created_at >= DATE_SUB(
                                     CURDATE(),
                                     INTERVAL 12 MONTH
                                 )
                                THEN si.quantity * si.cost_price
                                ELSE 0
                            END
                        ),
                        0
                    ) AS cogs_12m

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY p.product_id
            ),

            abc_base AS (
                SELECT
                    c.product_id,
                    c.cogs_12m,

                    SUM(c.cogs_12m) OVER ()
                        AS total_cogs_12m,

                    SUM(c.cogs_12m) OVER (
                        ORDER BY
                            c.cogs_12m DESC,
                            c.product_id ASC
                        ROWS BETWEEN
                            UNBOUNDED PRECEDING
                            AND CURRENT ROW
                    ) AS cumulative_cogs

                FROM cogs_12m c
            ),

            abc AS (
                SELECT
                    product_id,

                    ROUND(
                        cogs_12m,
                        2
                    ) AS cogs_12m,

                    ROUND(
                        cogs_12m /
                        NULLIF(total_cogs_12m, 0) * 100,
                        2
                    ) AS cogs_contribution_percent,

                    ROUND(
                        cumulative_cogs /
                        NULLIF(total_cogs_12m, 0) * 100,
                        2
                    ) AS cumulative_cogs_percent,

                    CASE
                        WHEN total_cogs_12m <= 0
                            THEN 'C'

                        WHEN cumulative_cogs /
                             total_cogs_12m <= 0.80
                            THEN 'A'

                        WHEN cumulative_cogs /
                             total_cogs_12m <= 0.95
                            THEN 'B'

                        ELSE 'C'
                    END AS abc_class

                FROM abc_base
            ),

            base AS (
                SELECT
                    i.*,

                    COALESCE(
                        v.quantity_sold_30d,
                        0
                    ) AS quantity_sold_30d,

                    ROUND(
                        COALESCE(
                            v.quantity_sold_30d,
                            0
                        ) / 30,
                        4
                    ) AS average_daily_quantity_sold,

                    l.last_sale_date,

                    COALESCE(
                        a.cogs_12m,
                        0
                    ) AS cogs_12m,

                    COALESCE(
                        a.cogs_contribution_percent,
                        0
                    ) AS cogs_contribution_percent,

                    COALESCE(
                        a.cumulative_cogs_percent,
                        0
                    ) AS cumulative_cogs_percent,

                    COALESCE(
                        a.abc_class,
                        'C'
                    ) AS abc_class

                FROM inventory i

                LEFT JOIN velocity v
                    ON v.product_id = i.product_id

                LEFT JOIN last_sale l
                    ON l.product_id = i.product_id

                LEFT JOIN abc a
                    ON a.product_id = i.product_id
            ),

            calculated AS (
                SELECT
                    b.*,

                    CASE
                        WHEN b.average_daily_quantity_sold > 0
                        THEN ROUND(
                            b.quantity_available /
                            b.average_daily_quantity_sold,
                            2
                        )
                        ELSE NULL
                    END AS days_of_inventory,

                    CASE
                        WHEN b.quantity_available <= 0
                            THEN 'OUT OF STOCK'

                        WHEN b.average_daily_quantity_sold <= 0
                            THEN 'NO RECENT SALES'

                        WHEN (
                            b.quantity_available /
                            b.average_daily_quantity_sold
                        ) <= 3
                            THEN 'CRITICAL'

                        WHEN (
                            b.quantity_available /
                            b.average_daily_quantity_sold
                        ) <= 7
                            THEN 'HIGH'

                        WHEN (
                            b.quantity_available /
                            b.average_daily_quantity_sold
                        ) <= 14
                            THEN 'MEDIUM'

                        ELSE 'LOW'
                    END AS stockout_risk,

                    ROUND(
                        b.average_daily_quantity_sold * 7,
                        2
                    ) AS lead_time_demand,

                    ROUND(
                        b.average_daily_quantity_sold * 7 * 0.20,
                        2
                    ) AS safety_stock,

                    CEILING(
                        b.average_daily_quantity_sold * 7 * 1.20
                    ) AS reorder_point,

                    CASE
                        WHEN b.quantity_available <= 0
                            THEN 'NORMAL'

                        WHEN b.average_daily_quantity_sold <= 0
                            THEN 'OVERSTOCK'

                        WHEN (
                            b.quantity_available /
                            b.average_daily_quantity_sold
                        ) > 90
                            THEN 'OVERSTOCK'

                        WHEN (
                            b.quantity_available /
                            b.average_daily_quantity_sold
                        ) > 60
                            THEN 'WATCH'

                        ELSE 'NORMAL'
                    END AS overstock_status,

                    CASE
                        WHEN b.quantity_available <= 0
                            THEN 'NO STOCK'

                        WHEN b.average_daily_quantity_sold <= 0
                            THEN 'DEAD STOCK'

                        WHEN b.average_daily_quantity_sold < 0.10
                            THEN 'VERY SLOW'

                        WHEN b.average_daily_quantity_sold < 0.50
                            THEN 'SLOW'

                        ELSE 'ACTIVE'
                    END AS stock_movement_status,

                    CASE
                        WHEN b.inventory_cost_value > 0
                        THEN ROUND(
                            b.cogs_12m /
                            b.inventory_cost_value,
                            2
                        )
                        ELSE 0
                    END AS inventory_turnover_proxy

                FROM base b
            ),

            health AS (
                SELECT
                    c.*,

                    CASE
                        WHEN c.quantity_available <= 0
                            THEN 0

                        ELSE ROUND(
                            (
                                CASE
                                    WHEN c.stockout_risk = 'CRITICAL'
                                        THEN 20

                                    WHEN c.stockout_risk = 'HIGH'
                                        THEN 40

                                    WHEN c.stockout_risk = 'MEDIUM'
                                        THEN 60

                                    WHEN c.stockout_risk = 'NO RECENT SALES'
                                        THEN 100

                                    ELSE 100
                                END

                                +

                                CASE
                                    WHEN c.overstock_status = 'OVERSTOCK'
                                        THEN 0

                                    WHEN c.overstock_status = 'WATCH'
                                        THEN 50

                                    ELSE 100
                                END

                                +

                                CASE
                                    WHEN c.stock_movement_status = 'DEAD STOCK'
                                        THEN 0

                                    WHEN c.stock_movement_status = 'VERY SLOW'
                                        THEN 40

                                    WHEN c.stock_movement_status = 'SLOW'
                                        THEN 60

                                    WHEN c.stock_movement_status = 'NO STOCK'
                                        THEN 0

                                    ELSE 100
                                END

                            ) / 3,
                            2
                        )
                    END AS health_score

                FROM calculated c
            )

            SELECT
                h.product_id,
                h.product_name,
                h.category,
                h.brand,
                h.unit,
                h.supplier_name,
                h.cost_price,
                h.selling_price,

                h.quantity_available,
                h.inventory_cost_value,
                h.potential_sales_value,
                h.potential_gross_profit,

                h.quantity_sold_30d,
                h.average_daily_quantity_sold,

                h.days_of_inventory,

                h.stockout_risk,

                h.lead_time_demand,
                h.safety_stock,
                h.reorder_point,

                CASE
                    WHEN h.quantity_available <= 0
                        THEN 'REORDER NOW'

                    WHEN h.quantity_available <= h.reorder_point
                        THEN 'REORDER SOON'

                    ELSE 'SUFFICIENT STOCK'
                END AS reorder_status,

                h.overstock_status,
                h.stock_movement_status,
                h.last_sale_date,

                h.cogs_12m,
                h.cogs_contribution_percent,
                h.cumulative_cogs_percent,

                h.abc_class,

                h.inventory_turnover_proxy,

                h.health_score,

                CASE
                    WHEN h.quantity_available <= 0
                        THEN 'CRITICAL'

                    WHEN h.health_score >= 80
                        THEN 'HEALTHY'

                    WHEN h.health_score >= 60
                        THEN 'FAIR'

                    WHEN h.health_score >= 40
                        THEN 'NEEDS ATTENTION'

                    ELSE 'CRITICAL'
                END AS health_status,

                CASE
                    WHEN h.quantity_available <= 0
                        THEN 'Reorder immediately. Product is currently out of stock.'

                    WHEN h.stockout_risk = 'CRITICAL'
                        THEN 'Urgent reorder required. Current stock may run out within 3 days.'

                    WHEN h.stockout_risk = 'HIGH'
                        THEN 'Reorder soon. Inventory is projected to last 7 days or less.'

                    WHEN h.overstock_status = 'OVERSTOCK'
                        THEN 'Review purchasing levels. Inventory is significantly above current sales velocity.'

                    WHEN h.stock_movement_status = 'DEAD STOCK'
                        THEN 'No recent sales. Consider reducing future purchases or reviewing future purchases.'

                    WHEN h.stock_movement_status = 'VERY SLOW'
                        THEN 'Sales velocity is very low. Monitor inventory and avoid unnecessary replenishment.'

                    WHEN h.stock_movement_status = 'SLOW'
                        THEN 'Product is moving slowly. Review demand before placing another order.'

                    WHEN h.abc_class = 'A'
                        THEN 'High-value inventory item. Monitor stock closely and prioritize availability.'

                    ELSE 'Inventory position appears normal.'
                END AS management_recommendation

            FROM health h
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   STOCK-OUT RISK
   ============================================================ */

function stockoutRiskQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.unit,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN st.quantity_available > 0
                                THEN st.quantity_available
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_available

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.unit
            ),

            velocity AS (
                SELECT
                    p.product_id,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN s.sale_id IS NOT NULL
                                 AND s.created_at >= DATE_SUB(
                                     CURDATE(),
                                     INTERVAL 30 DAY
                                 )
                                THEN si.quantity
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_sold_30d

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND s.sale_status = 'Completed'
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id
            )

            SELECT
                i.product_id,
                i.product_name,
                i.category,
                i.unit,

                i.quantity_available,

                v.quantity_sold_30d,

                ROUND(
                    v.quantity_sold_30d / 30,
                    4
                ) AS average_daily_quantity_sold,

                CASE
                    WHEN i.quantity_available <= 0
                        THEN 0

                    WHEN v.quantity_sold_30d <= 0
                        THEN NULL

                    ELSE ROUND(
                        i.quantity_available /
                        (v.quantity_sold_30d / 30),
                        1
                    )
                END AS days_of_inventory,

                CASE
                    WHEN i.quantity_available <= 0
                        THEN 'OUT OF STOCK'

                    WHEN v.quantity_sold_30d <= 0
                        THEN 'NO RECENT SALES'

                    WHEN i.quantity_available /
                         (v.quantity_sold_30d / 30) <= 3
                        THEN 'CRITICAL'

                    WHEN i.quantity_available /
                         (v.quantity_sold_30d / 30) <= 7
                        THEN 'HIGH'

                    WHEN i.quantity_available /
                         (v.quantity_sold_30d / 30) <= 14
                        THEN 'MEDIUM'

                    ELSE 'LOW'
                END AS stockout_risk

            FROM inventory i

            LEFT JOIN velocity v
                ON v.product_id = i.product_id

            ORDER BY
                CASE
                    WHEN i.quantity_available <= 0
                        THEN 1

                    WHEN v.quantity_sold_30d > 0
                     AND i.quantity_available /
                         (v.quantity_sold_30d / 30) <= 3
                        THEN 2

                    WHEN v.quantity_sold_30d > 0
                     AND i.quantity_available /
                         (v.quantity_sold_30d / 30) <= 7
                        THEN 3

                    WHEN v.quantity_sold_30d > 0
                     AND i.quantity_available /
                         (v.quantity_sold_30d / 30) <= 14
                        THEN 4

                    ELSE 5
                END,

                i.product_name
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   REORDER POINT
   ============================================================ */

function reorderPointQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.unit,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN st.quantity_available > 0
                                THEN st.quantity_available
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_available

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.unit
            ),

            velocity AS (
                SELECT
                    p.product_id,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN s.sale_id IS NOT NULL
                                 AND s.created_at >= DATE_SUB(
                                     CURDATE(),
                                     INTERVAL 30 DAY
                                 )
                                THEN si.quantity
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_sold_30d

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND s.sale_status = 'Completed'
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id
            ),

            calculated AS (
                SELECT
                    i.product_id,
                    i.product_name,
                    i.category,
                    i.unit,
                    i.quantity_available,

                    v.quantity_sold_30d,

                    ROUND(
                        v.quantity_sold_30d / 30,
                        4
                    ) AS average_daily_quantity_sold,

                    ROUND(
                        (v.quantity_sold_30d / 30) * 7,
                        2
                    ) AS lead_time_demand,

                    ROUND(
                        ((v.quantity_sold_30d / 30) * 7) * 0.20,
                        2
                    ) AS safety_stock,

                    CEILING(
                        ((v.quantity_sold_30d / 30) * 7) * 1.20
                    ) AS reorder_point

                FROM inventory i

                LEFT JOIN velocity v
                    ON v.product_id = i.product_id
            )

            SELECT
                product_id,
                product_name,
                category,
                unit,

                quantity_available,

                quantity_sold_30d,
                average_daily_quantity_sold,

                lead_time_demand,
                safety_stock,
                reorder_point,

                CASE
                    WHEN quantity_available <= 0
                        THEN 'REORDER NOW'

                    WHEN quantity_available <= reorder_point
                        THEN 'REORDER SOON'

                    ELSE 'SUFFICIENT STOCK'
                END AS reorder_status,

                CASE
                    WHEN quantity_available <= 0
                        THEN GREATEST(
                            reorder_point - quantity_available,
                            0
                        )

                    WHEN quantity_available < reorder_point
                        THEN reorder_point - quantity_available

                    ELSE 0
                END AS recommended_order_quantity

            FROM calculated

            ORDER BY
                CASE
                    WHEN quantity_available <= 0
                        THEN 1

                    WHEN quantity_available <= reorder_point
                        THEN 2

                    ELSE 3
                END,

                reorder_point DESC,

                product_name
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   OVERSTOCK
   ============================================================ */

function overstockQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.unit,
                    p.cost_price,
                    p.selling_price,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN st.quantity_available > 0
                                THEN st.quantity_available
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_available

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.unit,
                    p.cost_price,
                    p.selling_price
            ),

            velocity AS (
                SELECT
                    p.product_id,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN s.sale_id IS NOT NULL
                                 AND s.created_at >= DATE_SUB(
                                     CURDATE(),
                                     INTERVAL 30 DAY
                                 )
                                THEN si.quantity
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_sold_30d

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND s.sale_status = 'Completed'
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id
            ),

            calculated AS (
                SELECT
                    i.product_id,
                    i.product_name,
                    i.category,
                    i.unit,
                    i.cost_price,
                    i.selling_price,
                    i.quantity_available,

                    v.quantity_sold_30d,

                    ROUND(
                        v.quantity_sold_30d / 30,
                        4
                    ) AS average_daily_quantity_sold,

                    CASE
                        WHEN v.quantity_sold_30d > 0
                        THEN ROUND(
                            i.quantity_available /
                            (v.quantity_sold_30d / 30),
                            2
                        )

                        ELSE NULL
                    END AS days_of_inventory

                FROM inventory i

                LEFT JOIN velocity v
                    ON v.product_id = i.product_id
            )

            SELECT
                product_id,
                product_name,
                category,
                unit,

                quantity_available,

                quantity_sold_30d,
                average_daily_quantity_sold,

                days_of_inventory,

                ROUND(
                    quantity_available * cost_price,
                    2
                ) AS inventory_cost_value,

                ROUND(
                    quantity_available * selling_price,
                    2
                ) AS potential_sales_value,

                ROUND(
                    quantity_available *
                    (selling_price - cost_price),
                    2
                ) AS potential_gross_profit,

                CASE
                    WHEN quantity_available <= 0
                        THEN 'NO STOCK'

                    WHEN quantity_sold_30d <= 0
                        THEN 'OVERSTOCK'

                    WHEN days_of_inventory > 90
                        THEN 'OVERSTOCK'

                    WHEN days_of_inventory > 60
                        THEN 'WATCH'

                    ELSE 'NORMAL'
                END AS overstock_status,

                CASE
                    WHEN quantity_available <= 0
                        THEN 0

                    WHEN quantity_sold_30d <= 0
                        THEN quantity_available

                    WHEN days_of_inventory > 90
                        THEN GREATEST(
                            quantity_available -
                            CEIL(
                                average_daily_quantity_sold * 60
                            ),
                            0
                        )

                    WHEN days_of_inventory > 60
                        THEN GREATEST(
                            quantity_available -
                            CEIL(
                                average_daily_quantity_sold * 60
                            ),
                            0
                        )

                    ELSE 0
                END AS excess_quantity

            FROM calculated

            ORDER BY
                CASE
                    WHEN quantity_available <= 0
                        THEN 3

                    WHEN quantity_sold_30d <= 0
                        THEN 1

                    WHEN days_of_inventory > 90
                        THEN 1

                    WHEN days_of_inventory > 60
                        THEN 2

                    ELSE 4
                END,

                days_of_inventory DESC,

                product_name
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   DEAD STOCK
   ============================================================ */

function deadStockQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.cost_price,
                    p.selling_price,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN st.quantity_available > 0
                                THEN st.quantity_available
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_available,

                    ROUND(
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN st.quantity_available > 0
                                    THEN st.quantity_available *
                                         p.cost_price
                                    ELSE 0
                                END
                            ),
                            0
                        ),
                        2
                    ) AS inventory_cost_value

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.cost_price,
                    p.selling_price
            ),

            sales_activity AS (
                SELECT
                    p.product_id,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN s.sale_id IS NOT NULL
                                 AND s.created_at >= DATE_SUB(
                                     CURDATE(),
                                     INTERVAL 30 DAY
                                 )
                                THEN si.quantity
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_sold_30d,

                    MAX(
                        CASE
                            WHEN s.sale_status = 'Completed'
                            THEN s.created_at
                        END
                    ) AS last_sale_date

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id
            )

            SELECT
                i.product_id,
                i.product_name,
                i.category,
                i.brand,
                i.unit,

                i.quantity_available,

                i.inventory_cost_value,

                COALESCE(
                    s.quantity_sold_30d,
                    0
                ) AS quantity_sold_30d,

                s.last_sale_date,

                CASE
                    WHEN s.last_sale_date IS NULL
                        THEN NULL

                    ELSE DATEDIFF(
                        CURDATE(),
                        DATE(s.last_sale_date)
                    )
                END AS days_since_last_sale,

                CASE
                    WHEN i.quantity_available <= 0
                        THEN 'NO STOCK'

                    WHEN COALESCE(
                        s.quantity_sold_30d,
                        0
                    ) <= 0
                        THEN 'DEAD STOCK'

                    ELSE 'ACTIVE'
                END AS stock_status

            FROM inventory i

            LEFT JOIN sales_activity s
                ON s.product_id = i.product_id

            WHERE i.quantity_available > 0
              AND COALESCE(
                  s.quantity_sold_30d,
                  0
              ) <= 0

            ORDER BY
                i.inventory_cost_value DESC,
                i.product_name
        `,
        params: scopeDefinition.params
    };
}
/* ============================================================
   AGING
   ============================================================ */

function agingQuery(scope) {

    const cte = scopeCte(scope);

    return {
        sql: `
            WITH

            ${cte.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.cost_price,

                    st.stock_id,
                    st.batch_number,
                    st.stock_date,
                    st.quantity_available

                FROM products p

                CROSS JOIN scope sc

                INNER JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}
                  AND st.quantity_available > 0
            ),

            aging AS (
                SELECT
                    product_id,
                    product_name,
                    category,
                    brand,
                    unit,
                    cost_price,
                    stock_id,
                    batch_number,
                    stock_date,
                    quantity_available,

                    DATEDIFF(
                        CURDATE(),
                        stock_date
                    ) AS stock_age_days

                FROM inventory

                WHERE stock_date IS NOT NULL
            )

            SELECT
                product_id,
                product_name,
                category,
                brand,
                unit,
                quantity_available,
                stock_date AS oldest_stock_date,
                stock_age_days,

                ROUND(
                    quantity_available * cost_price,
                    2
                ) AS inventory_cost_value,

                batch_number,

                CASE
                    WHEN stock_age_days <= 30
                        THEN '0-30 DAYS'

                    WHEN stock_age_days <= 60
                        THEN '31-60 DAYS'

                    WHEN stock_age_days <= 90
                        THEN '61-90 DAYS'

                    ELSE '90+ DAYS'
                END AS aging_bucket

            FROM aging

            ORDER BY
                stock_age_days DESC,
                product_name ASC
        `,

        params: cte.params
    };
}

/* ============================================================
   AGING SUMMARY
   ============================================================ */
function agingSummaryQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.cost_price,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN st.quantity_available > 0
                                THEN st.quantity_available
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_available,

                    MIN(
                        CASE
                            WHEN st.quantity_available > 0
                            THEN st.stock_date
                        END
                    ) AS oldest_stock_date

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.cost_price
            ),

            aging AS (
                SELECT
                    product_id,
                    cost_price,
                    quantity_available,

                    DATEDIFF(
                        CURDATE(),
                        DATE(oldest_stock_date)
                    ) AS stock_age_days

                FROM inventory

                WHERE quantity_available > 0
                  AND oldest_stock_date IS NOT NULL
            )

            SELECT
                CASE
                    WHEN stock_age_days <= 30
                        THEN '0-30 DAYS'

                    WHEN stock_age_days <= 60
                        THEN '31-60 DAYS'

                    WHEN stock_age_days <= 90
                        THEN '61-90 DAYS'

                    ELSE '90+ DAYS'
                END AS aging_bucket,

                COUNT(*) AS product_count,

                SUM(quantity_available) AS quantity_available,

                ROUND(
                    SUM(
                        quantity_available * cost_price
                    ),
                    2
                ) AS inventory_cost_value

            FROM aging

            GROUP BY
                CASE
                    WHEN stock_age_days <= 30
                        THEN '0-30 DAYS'

                    WHEN stock_age_days <= 60
                        THEN '31-60 DAYS'

                    WHEN stock_age_days <= 90
                        THEN '61-90 DAYS'

                    ELSE '90+ DAYS'
                END

            ORDER BY
                CASE
                    WHEN aging_bucket = '0-30 DAYS'
                        THEN 1
                    WHEN aging_bucket = '31-60 DAYS'
                        THEN 2
                    WHEN aging_bucket = '61-90 DAYS'
                        THEN 3
                    WHEN aging_bucket = '90+ DAYS'
                        THEN 4
                    ELSE 5
                END
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   EXPIRED STOCK
   ============================================================ */

function expiredQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql}

            SELECT
                p.product_id,
                p.product_name,
                p.category,
                p.brand,
                p.unit,

                st.quantity_available,

                st.expiry_date,

                DATEDIFF(
                    CURDATE(),
                    DATE(st.expiry_date)
                ) AS days_expired,

                ROUND(
                    st.quantity_available * p.cost_price,
                    2
                ) AS inventory_cost_value,

                ROUND(
                    st.quantity_available * p.selling_price,
                    2
                ) AS potential_sales_value

            FROM stock st

            INNER JOIN products p
                ON p.product_id = st.product_id

            CROSS JOIN scope sc

            WHERE ${scopedStock("st", "sc")}
              AND ${scopedProducts("p", "sc")}

              AND st.quantity_available > 0

              AND st.expiry_date IS NOT NULL

              AND DATE(st.expiry_date) < CURDATE()

            ORDER BY
                days_expired DESC,
                inventory_cost_value DESC,
                p.product_name
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   EXPIRING STOCK
   ============================================================ */

function expiringQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql}

            SELECT
                p.product_id,
                p.product_name,
                p.category,
                p.brand,
                p.unit,

                st.quantity_available,

                st.expiry_date,

                DATEDIFF(
                    DATE(st.expiry_date),
                    CURDATE()
                ) AS days_until_expiry,

                ROUND(
                    st.quantity_available * p.cost_price,
                    2
                ) AS inventory_cost_value,

                ROUND(
                    st.quantity_available * p.selling_price,
                    2
                ) AS potential_sales_value,

                CASE
                    WHEN DATEDIFF(
                        DATE(st.expiry_date),
                        CURDATE()
                    ) <= 7
                        THEN 'CRITICAL'

                    WHEN DATEDIFF(
                        DATE(st.expiry_date),
                        CURDATE()
                    ) <= 30
                        THEN 'HIGH'

                    WHEN DATEDIFF(
                        DATE(st.expiry_date),
                        CURDATE()
                    ) <= 60
                        THEN 'MEDIUM'

                    WHEN DATEDIFF(
                        DATE(st.expiry_date),
                        CURDATE()
                    ) <= 90
                        THEN 'LOW'

                    ELSE 'NORMAL'
                END AS expiry_risk

            FROM stock st

            INNER JOIN products p
                ON p.product_id = st.product_id

            CROSS JOIN scope sc

            WHERE ${scopedStock("st", "sc")}
              AND ${scopedProducts("p", "sc")}

              AND st.quantity_available > 0

              AND st.expiry_date IS NOT NULL

              AND DATE(st.expiry_date) >= CURDATE()

              AND DATE(st.expiry_date) <= DATE_ADD(
                  CURDATE(),
                  INTERVAL 90 DAY
              )

            ORDER BY
                days_until_expiry ASC,
                inventory_cost_value DESC,
                p.product_name
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   EXPIRY SUMMARY
   ============================================================ */

function expirySummaryQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            expiry AS (
                SELECT
                    st.product_id,
                    st.quantity_available,
                    p.cost_price,
                    st.expiry_date,

                    DATEDIFF(
                        DATE(st.expiry_date),
                        CURDATE()
                    ) AS days_until_expiry

                FROM stock st

                INNER JOIN products p
                    ON p.product_id = st.product_id

                CROSS JOIN scope sc

                WHERE ${scopedStock("st", "sc")}
                  AND ${scopedProducts("p", "sc")}

                  AND st.quantity_available > 0

                  AND st.expiry_date IS NOT NULL
            )

            SELECT
                CASE
                    WHEN days_until_expiry < 0
                        THEN 'EXPIRED'

                    WHEN days_until_expiry <= 7
                        THEN '0-7 DAYS'

                    WHEN days_until_expiry <= 30
                        THEN '8-30 DAYS'

                    WHEN days_until_expiry <= 60
                        THEN '31-60 DAYS'

                    WHEN days_until_expiry <= 90
                        THEN '61-90 DAYS'

                    ELSE '90+ DAYS'
                END AS expiry_bucket,

                COUNT(
                    DISTINCT product_id
                ) AS product_count,

                SUM(
                    quantity_available
                ) AS quantity_available,

                ROUND(
                    SUM(
                        quantity_available * cost_price
                    ),
                    2
                ) AS inventory_cost_value

            FROM expiry

            GROUP BY
                CASE
                    WHEN days_until_expiry < 0
                        THEN 'EXPIRED'

                    WHEN days_until_expiry <= 7
                        THEN '0-7 DAYS'

                    WHEN days_until_expiry <= 30
                        THEN '8-30 DAYS'

                    WHEN days_until_expiry <= 60
                        THEN '31-60 DAYS'

                    WHEN days_until_expiry <= 90
                        THEN '61-90 DAYS'

                    ELSE '90+ DAYS'
                END

            ORDER BY
                CASE
                    WHEN expiry_bucket = 'EXPIRED'
                        THEN 1

                    WHEN expiry_bucket = '0-7 DAYS'
                        THEN 2

                    WHEN expiry_bucket = '8-30 DAYS'
                        THEN 3

                    WHEN expiry_bucket = '31-60 DAYS'
                        THEN 4

                    WHEN expiry_bucket = '61-90 DAYS'
                        THEN 5

                    ELSE 6
                END
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   ABC ANALYSIS
   ============================================================ */

function abcQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            sales_value AS (
                SELECT
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN s.sale_status = 'Completed'
                                 AND s.created_at >= DATE_SUB(
                                     CURDATE(),
                                     INTERVAL 12 MONTH
                                 )
                                THEN si.quantity * si.cost_price
                                ELSE 0
                            END
                        ),
                        0
                    ) AS cogs_12m

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit
            ),

            ranked AS (
                SELECT
                    product_id,
                    product_name,
                    category,
                    brand,
                    unit,
                    cogs_12m,

                    SUM(cogs_12m) OVER ()
                        AS total_cogs_12m,

                    SUM(cogs_12m) OVER (
                        ORDER BY
                            cogs_12m DESC,
                            product_id ASC
                        ROWS BETWEEN
                            UNBOUNDED PRECEDING
                            AND CURRENT ROW
                    ) AS cumulative_cogs

                FROM sales_value
            )

            SELECT
                product_id,
                product_name,
                category,
                brand,
                unit,

                ROUND(
                    cogs_12m,
                    2
                ) AS cogs_12m,

                ROUND(
                    CASE
                        WHEN total_cogs_12m > 0
                        THEN (
                            cogs_12m /
                            total_cogs_12m
                        ) * 100
                        ELSE 0
                    END,
                    2
                ) AS cogs_contribution_percent,

                ROUND(
                    CASE
                        WHEN total_cogs_12m > 0
                        THEN (
                            cumulative_cogs /
                            total_cogs_12m
                        ) * 100
                        ELSE 0
                    END,
                    2
                ) AS cumulative_cogs_percent,

                CASE
                    WHEN total_cogs_12m <= 0
                        THEN 'C'

                    WHEN (
                        cumulative_cogs /
                        total_cogs_12m
                    ) <= 0.80
                        THEN 'A'

                    WHEN (
                        cumulative_cogs /
                        total_cogs_12m
                    ) <= 0.95
                        THEN 'B'

                    ELSE 'C'
                END AS abc_class

            FROM ranked

            ORDER BY
                cogs_12m DESC,
                product_name
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   INVENTORY TURNOVER
   ============================================================ */

function turnoverQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            inventory AS (
                SELECT
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.cost_price,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN st.quantity_available > 0
                                THEN st.quantity_available
                                ELSE 0
                            END
                        ),
                        0
                    ) AS quantity_available,

                    ROUND(
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN st.quantity_available > 0
                                    THEN st.quantity_available *
                                         p.cost_price
                                    ELSE 0
                                END
                            ),
                            0
                        ),
                        2
                    ) AS inventory_cost_value

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN stock st
                    ON st.product_id = p.product_id
                   AND ${scopedStock("st", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.cost_price
            ),

            cogs AS (
                SELECT
                    p.product_id,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN s.sale_status = 'Completed'
                                 AND s.created_at >= DATE_SUB(
                                     CURDATE(),
                                     INTERVAL 12 MONTH
                                 )
                                THEN si.quantity * si.cost_price
                                ELSE 0
                            END
                        ),
                        0
                    ) AS cogs_12m

                FROM products p

                CROSS JOIN scope sc

                LEFT JOIN sales_item si
                    ON si.product_id = p.product_id
                   AND ${scopedSalesItem("si", "sc")}

                LEFT JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND ${scopedSales("s", "sc")}

                WHERE ${scopedProducts("p", "sc")}

                GROUP BY
                    p.product_id
            )

            SELECT
                i.product_id,
                i.product_name,
                i.category,
                i.brand,
                i.unit,

                i.quantity_available,

                i.inventory_cost_value,

                ROUND(
                    COALESCE(
                        c.cogs_12m,
                        0
                    ),
                    2
                ) AS cogs_12m,

                CASE
                    WHEN i.inventory_cost_value > 0
                        THEN ROUND(
                            COALESCE(
                                c.cogs_12m,
                                0
                            ) /
                            i.inventory_cost_value,
                            2
                        )

                    ELSE 0
                END AS inventory_turnover,

                CASE
                    WHEN i.inventory_cost_value <= 0
                        THEN 'NO INVENTORY'

                    WHEN COALESCE(
                        c.cogs_12m,
                        0
                    ) <= 0
                        THEN 'NO SALES'

                    WHEN (
                        c.cogs_12m /
                        i.inventory_cost_value
                    ) >= 12
                        THEN 'VERY HIGH'

                    WHEN (
                        c.cogs_12m /
                        i.inventory_cost_value
                    ) >= 6
                        THEN 'HIGH'

                    WHEN (
                        c.cogs_12m /
                        i.inventory_cost_value
                    ) >= 3
                        THEN 'NORMAL'

                    WHEN (
                        c.cogs_12m /
                        i.inventory_cost_value
                    ) >= 1
                        THEN 'LOW'

                    ELSE 'VERY LOW'
                END AS turnover_status

            FROM inventory i

            LEFT JOIN cogs c
                ON c.product_id = i.product_id

            ORDER BY
                CASE
                    WHEN i.inventory_cost_value <= 0
                        THEN 6

                    WHEN COALESCE(
                        c.cogs_12m,
                        0
                    ) <= 0
                        THEN 5

                    ELSE 1
                END,

                inventory_turnover DESC,

                i.product_name
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   SALES BY DATE
   ============================================================ */

function salesByDateQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            item_sales AS (
                SELECT
                    DATE(s.created_at) AS sale_date,

                    si.quantity,
                    si.total_price,

                    s.subtotal,
                    COALESCE(
                        s.discount,
                        0
                    ) AS discount,

                    p.cost_price,

                    CASE
                        WHEN COALESCE(
                            s.subtotal,
                            0
                        ) > 0
                        THEN
                            si.total_price
                            -
                            (
                                (
                                    si.total_price /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )
                            )

                        ELSE si.total_price
                    END AS net_item_revenue

                FROM sales_item si

                CROSS JOIN scope sc

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                INNER JOIN products p
                    ON p.product_id = si.product_id

                WHERE s.sale_status = 'Completed'

                  AND ${scopedSales("s", "sc")}

                  AND ${scopedSalesItem("si", "sc")}

                  AND ${scopedProducts("p", "sc")}
            )

            SELECT
                sale_date,

                SUM(
                    quantity
                ) AS quantity_sold,

                ROUND(
                    SUM(
                        net_item_revenue
                    ),
                    2
                ) AS sales_revenue,

                ROUND(
                    SUM(
                        quantity * cost_price
                    ),
                    2
                ) AS cogs,

                ROUND(
                    SUM(
                        net_item_revenue
                    )
                    -
                    SUM(
                        quantity * cost_price
                    ),
                    2
                ) AS gross_profit

            FROM item_sales

            GROUP BY
                sale_date

            ORDER BY
                sale_date ASC
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   STOCK RECEIVED BY DATE
   ============================================================ */

function stockReceivedByDateQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql}

            SELECT
                DATE(st.stock_date) AS stock_date,

                SUM(
                    st.quantity_received
                ) AS quantity_received,

                COUNT(*) AS stock_batches_received

            FROM stock st

            CROSS JOIN scope sc

            WHERE ${scopedStock("st", "sc")}

            GROUP BY
                DATE(st.stock_date)

            ORDER BY
                stock_date ASC
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   DAILY INVENTORY MOVEMENT
   ============================================================ */

function movementQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql},

            sales_daily AS (
                SELECT
                    DATE(s.created_at) AS movement_date,

                    SUM(
                        si.quantity
                    ) AS quantity_sold,

                    ROUND(
                        SUM(
                            CASE
                                WHEN COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0
                                THEN
                                    si.total_price
                                    -
                                    (
                                        (
                                            si.total_price /
                                            s.subtotal
                                        )
                                        *
                                        (
                                            s.subtotal *
                                            (
                                                COALESCE(
                                                    s.discount,
                                                    0
                                                ) / 100
                                            )
                                        )
                                    )
                                ELSE si.total_price
                            END
                        ),
                        2
                    ) AS sales_revenue,

                    ROUND(
                        SUM(
                            si.quantity * si.cost_price
                        ),
                        2
                    ) AS cogs

                FROM sales s

                CROSS JOIN scope sc

                INNER JOIN sales_item si
                    ON si.sale_id = s.sale_id

                INNER JOIN products p
                    ON p.product_id = si.product_id

                WHERE s.sale_status = 'Completed'

                  AND ${scopedSales("s", "sc")}

                  AND ${scopedSalesItem("si", "sc")}

                  AND ${scopedProducts("p", "sc")}

                GROUP BY
                    DATE(s.created_at)
            ),

            stock_daily AS (
                SELECT
                    DATE(st.stock_date) AS movement_date,

                    SUM(
                        st.quantity_received
                    ) AS quantity_received

                FROM stock st

                CROSS JOIN scope sc

                WHERE ${scopedStock("st", "sc")}

                GROUP BY
                    DATE(st.stock_date)
            ),

            dates AS (
                SELECT movement_date
                FROM sales_daily

                UNION

                SELECT movement_date
                FROM stock_daily
            )

            SELECT
                d.movement_date,

                COALESCE(
                    st.quantity_received,
                    0
                ) AS quantity_received,

                COALESCE(
                    sd.quantity_sold,
                    0
                ) AS quantity_sold,

                COALESCE(
                    st.quantity_received,
                    0
                )
                -
                COALESCE(
                    sd.quantity_sold,
                    0
                ) AS net_quantity_movement,

                COALESCE(
                    sd.sales_revenue,
                    0
                ) AS sales_revenue,

                ROUND(
                    COALESCE(
                        sd.sales_revenue,
                        0
                    )
                    -
                    COALESCE(
                        sd.cogs,
                        0
                    ),
                    2
                ) AS gross_profit

            FROM dates d

            LEFT JOIN sales_daily sd
                ON sd.movement_date = d.movement_date

            LEFT JOIN stock_daily st
                ON st.movement_date = d.movement_date

            ORDER BY
                d.movement_date ASC
        `,
        params: scopeDefinition.params
    };
}

/* ============================================================
   PRODUCTS NEVER SOLD
   ============================================================ */

function neverSoldQuery(scope) {
    const scopeDefinition = scopeCte(scope);

    return {
        sql: `
            WITH
            ${scopeDefinition.sql}

            SELECT
                p.product_id,
                p.product_name,
                p.category,
                p.unit,
                p.selling_price,
                p.cost_price

            FROM products p

            CROSS JOIN scope sc

            WHERE ${scopedProducts("p", "sc")}

              AND NOT EXISTS (
                  SELECT 1

                  FROM sales_item si

                  INNER JOIN sales s
                      ON s.sale_id = si.sale_id

                  WHERE si.product_id = p.product_id

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                    AND s.sale_status = 'Completed'
              )

            ORDER BY
                p.product_name ASC
        `,
        params: scopeDefinition.params
    };
}