const db = require("../Database/db");

/*
 * MARKETFLOW DASHBOARD CONTROLLER
 *
 * Scope:
 * - Business mode = authenticated business across all branches.
 * - Branch mode = authenticated business + selected active branch.
 *
 * Sales:
 * - Only Completed sales.
 * - Discount is stored as a percentage.
 * - Net Revenue = Subtotal - Discount Amount.
 * - Tax is calculated after discount.
 * - Historical COGS = sales_item.quantity * sales_item.cost_price.
 * - Gross Profit = Net Revenue - Historical COGS.
 *
 * Inventory:
 * - Uses current products.cost_price and products.selling_price.
 * - Business mode aggregates stock across the business.
 * - Branch mode uses stock.branch_id for the selected branch.
 */

const getAuthenticatedBusinessId = req => {
    return (
        req.session?.user?.business_id ??
        req.session?.business_id ??
        req.user?.business_id ??
        null
    );
};

const normalizeMode = value => {
    return String(value || "").toLowerCase() === "branch"
        ? "branch"
        : "business";
};

const getRequestedBranchId = req => {
    return (
        req.query?.branch_id ??
        req.query?.branchId ??
        null
    );
};

exports.getDashboard = async (req, res) => {

    try {

        const businessId = getAuthenticatedBusinessId(req);

        if (!businessId) {
            return res.status(401).send("Unable to determine authenticated business.");
        }

        const mode = normalizeMode(
            req.query?.scope ??
            req.query?.mode ??
            (req.query?.branch_id || req.query?.branchId ? "branch" : null)
        );

        let branchId = null;
        let branchName = null;
        let branchLocation = null;
        let businessName = null;

        const [[business]] = await db.query(
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

        if (!business) {
            return res.status(403).send("Business access denied.");
        }

        businessName = business.business_name;

        const [branches] = await db.query(
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
            [businessId]
        );

        if (mode === "branch") {

            branchId = getRequestedBranchId(req);

            if (!branchId) {
                return res.status(400).send("A branch must be selected.");
            }

            const [[branch]] = await db.query(
                `
                    SELECT
                        branch_id,
                        branch_name,
                        location
                    FROM branches
                    WHERE branch_id = ?
                      AND business_id = ?
                      AND is_active = 1
                    LIMIT 1
                `,
                [branchId, businessId]
            );

            if (!branch) {
                return res.status(403).send("Selected branch is not available.");
            }

            branchName = branch.branch_name;
            branchLocation = branch.location;
        }

        const branchOptions = branches.map(branch => ({
                branch_id: branch.branch_id,
                branch_name: branch.branch_name,
                location: branch.location,
                selected:
                    mode === "branch" &&
                    String(branch.branch_id) === String(branchId)
            }));

        const salesScope = mode === "branch"
            ? "s.business_id = ? AND s.branch_id = ?"
            : "s.business_id = ?";

        const salesItemScope = mode === "branch"
            ? "si.business_id = ? AND si.branch_id = ?"
            : "si.business_id = ?";

        const productScope = mode === "branch"
            ? "p.business_id = ? AND p.branch_id = ?"
            : "p.business_id = ?";

        const paymentScope = mode === "branch"
            ? "pm.business_id = ? AND pm.branch_id = ?"
            : "pm.business_id = ?";

        const userScope = mode === "branch"
            ? "u.business_id = ? AND u.branch_id = ?"
            : "u.business_id = ?";

        const stockScope = mode === "branch"
            ? "st.business_id = ? AND st.branch_id = ?"
            : "st.business_id = ?";

        const scopeParams = mode === "branch"
            ? [businessId, branchId]
            : [businessId];

        const [summaryRows] = await db.query(`

            WITH sales_summary AS (

                SELECT

                    COUNT(*) AS completed_sales,

                    COALESCE(
                        SUM(s.subtotal),
                        0.00
                    ) AS gross_subtotal,

                    COALESCE(
                        SUM(
                            s.subtotal *
                            (s.discount / 100)
                        ),
                        0.00
                    ) AS total_discount,

                    COALESCE(
                        SUM(
                            (
                                s.subtotal -
                                (
                                    s.subtotal *
                                    (s.discount / 100)
                                )
                            ) *
                            (s.tax / 100)
                        ),
                        0.00
                    ) AS total_tax,

                    COALESCE(
                        SUM(s.GrandTotal),
                        0.00
                    ) AS grand_total,

                    COALESCE(
                        SUM(
                            s.subtotal -
                            (
                                s.subtotal *
                                (s.discount / 100)
                            )
                        ),
                        0.00
                    ) AS net_revenue

                FROM sales s

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
            ),

            item_summary AS (

                SELECT

                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS units_sold,

                    COALESCE(
                        SUM(
                            si.quantity *
                            si.cost_price
                        ),
                        0.00
                    ) AS historical_cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id
                   AND s.business_id = si.business_id
                   AND s.branch_id <=> si.branch_id

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
                  AND ${salesItemScope}
            )

            SELECT

                ss.completed_sales,

                ROUND(
                    ss.net_revenue,
                    2
                ) AS total_revenue,

                isummary.units_sold,

                ROUND(
                    isummary.historical_cogs,
                    2
                ) AS estimated_cost,

                ROUND(
                    ss.net_revenue -
                    isummary.historical_cogs,
                    2
                ) AS estimated_gross_profit,

                ROUND(
                    COALESCE(
                        (
                            (
                                ss.net_revenue -
                                isummary.historical_cogs
                            )
                            /
                            NULLIF(
                                ss.net_revenue,
                                0
                            )
                        ) * 100,
                        0.00
                    ),
                    2
                ) AS estimated_profit_margin_percent,

                ROUND(
                    ss.gross_subtotal,
                    2
                ) AS gross_subtotal,

                ROUND(
                    ss.total_discount,
                    2
                ) AS total_discount,

                ROUND(
                    ss.total_tax,
                    2
                ) AS total_tax,

                ROUND(
                    ss.grand_total,
                    2
                ) AS total_grand_total,

                ROUND(
                    COALESCE(
                        ss.net_revenue /
                        NULLIF(
                            ss.completed_sales,
                            0
                        ),
                        0.00
                    ),
                    2
                ) AS average_transaction_value

            FROM sales_summary ss

            CROSS JOIN item_summary isummary;

        `, [
            ...scopeParams,
            ...scopeParams,
            ...scopeParams
        ]);


        const [monthlyRevenue] = await db.query(`

            SELECT

                YEAR(s.created_at) AS sale_year,

                MONTH(s.created_at) AS sale_month,

                DATE_FORMAT(
                    s.created_at,
                    '%Y-%m'
                ) AS month,

                ROUND(
                    SUM(
                        s.subtotal -
                        (
                            s.subtotal *
                            (s.discount / 100)
                        )
                    ),
                    2
                ) AS revenue

            FROM sales s

            WHERE s.sale_status = 'Completed'
              AND ${salesScope}

            GROUP BY
                YEAR(s.created_at),
                MONTH(s.created_at),
                DATE_FORMAT(
                    s.created_at,
                    '%Y-%m'
                )

            ORDER BY
                sale_year,
                sale_month;

        `, scopeParams);


        const [monthlyPerformance] = await db.query(`

            WITH RECURSIVE months AS (

                SELECT
                    DATE_SUB(
                        DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                        INTERVAL 11 MONTH
                    ) AS month_start

                UNION ALL

                SELECT
                    DATE_ADD(
                        month_start,
                        INTERVAL 1 MONTH
                    )
                FROM months
                WHERE month_start <
                    DATE_FORMAT(CURDATE(), '%Y-%m-01')
            ),

            monthly_sales_base AS (

                SELECT
                    DATE_FORMAT(
                        s.created_at,
                        '%Y-%m'
                    ) AS month,

                    COUNT(*) AS completed_sales,

                    ROUND(
                        SUM(
                            s.subtotal -
                            (
                                s.subtotal *
                                (s.discount / 100)
                            )
                        ),
                        2
                    ) AS revenue

                FROM sales s

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}

                GROUP BY
                    DATE_FORMAT(
                        s.created_at,
                        '%Y-%m'
                    )
            ),

            monthly_items_base AS (

                SELECT
                    DATE_FORMAT(
                        s.created_at,
                        '%Y-%m'
                    ) AS month,

                    ROUND(
                        COALESCE(
                            SUM(si.quantity),
                            0
                        ),
                        3
                    ) AS units_sold,

                    ROUND(
                        COALESCE(
                            SUM(
                                si.quantity *
                                si.cost_price
                            ),
                            0
                        ),
                        2
                    ) AS total_cost

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id = s.sale_id
                   AND si.business_id = s.business_id
                   AND si.branch_id <=> s.branch_id

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
                  AND ${salesItemScope}

                GROUP BY
                    DATE_FORMAT(
                        s.created_at,
                        '%Y-%m'
                    )
            )

            SELECT

                DATE_FORMAT(
                    m.month_start,
                    '%Y-%m'
                ) AS month,

                COALESCE(
                    ms.revenue,
                    0.00
                ) AS revenue,

                COALESCE(
                    mi.total_cost,
                    0.00
                ) AS total_cost,

                COALESCE(
                    mi.total_cost,
                    0.00
                ) AS estimated_cost,

                ROUND(
                    COALESCE(ms.revenue, 0.00)
                    -
                    COALESCE(mi.total_cost, 0.00),
                    2
                ) AS gross_profit,

                CASE
                    WHEN COALESCE(ms.revenue, 0.00) > 0
                    THEN ROUND(
                        (
                            (
                                COALESCE(
                                    ms.revenue,
                                    0.00
                                )
                                -
                                COALESCE(
                                    mi.total_cost,
                                    0.00
                                )
                            )
                            /
                            ms.revenue
                        ) * 100,
                        2
                    )
                    ELSE 0
                END AS profit_margin,

                COALESCE(
                    ms.completed_sales,
                    0
                ) AS completed_sales,

                COALESCE(
                    mi.units_sold,
                    0.000
                ) AS units_sold

            FROM months m

            LEFT JOIN monthly_sales_base ms
                ON ms.month =
                    DATE_FORMAT(
                        m.month_start,
                        '%Y-%m'
                    )

            LEFT JOIN monthly_items_base mi
                ON mi.month =
                    DATE_FORMAT(
                        m.month_start,
                        '%Y-%m'
                    )

            ORDER BY m.month_start ASC;

        `, [
            ...scopeParams,
            ...scopeParams,
            ...scopeParams
        ]);


        const [dailyTrend] = await db.query(`

            WITH RECURSIVE dates AS (

                SELECT
                    DATE_SUB(
                        CURDATE(),
                        INTERVAL 6 DAY
                    ) AS sale_date

                UNION ALL

                SELECT
                    DATE_ADD(
                        sale_date,
                        INTERVAL 1 DAY
                    )
                FROM dates
                WHERE sale_date < CURDATE()
            ),

            daily_sales AS (

                SELECT

                    DATE(s.created_at) AS sale_date,

                    COUNT(*) AS completed_sales,

                    ROUND(
                        SUM(
                            s.subtotal -
                            (
                                s.subtotal *
                                (s.discount / 100)
                            )
                        ),
                        2
                    ) AS revenue

                FROM sales s

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}

                  AND DATE(s.created_at) >=
                      DATE_SUB(
                          CURDATE(),
                          INTERVAL 6 DAY
                      )

                  AND DATE(s.created_at) <= CURDATE()

                GROUP BY DATE(s.created_at)
            ),

            daily_items AS (

                SELECT

                    DATE(s.created_at) AS sale_date,

                    ROUND(
                        COALESCE(
                            SUM(si.quantity),
                            0
                        ),
                        3
                    ) AS units_sold,

                    ROUND(
                        COALESCE(
                            SUM(
                                si.quantity *
                                si.cost_price
                            ),
                            0
                        ),
                        2
                    ) AS cost

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id = s.sale_id
                   AND si.business_id = s.business_id
                   AND si.branch_id <=> s.branch_id

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
                  AND ${salesItemScope}

                  AND DATE(s.created_at) >=
                      DATE_SUB(
                          CURDATE(),
                          INTERVAL 6 DAY
                      )

                  AND DATE(s.created_at) <= CURDATE()

                GROUP BY DATE(s.created_at)
            )

            SELECT

                d.sale_date,

                COALESCE(
                    ds.revenue,
                    0.00
                ) AS revenue,

                COALESCE(
                    di.cost,
                    0.00
                ) AS cost,

                COALESCE(
                    ds.completed_sales,
                    0
                ) AS completed_sales,

                COALESCE(
                    di.units_sold,
                    0.000
                ) AS units_sold,

                ROUND(
                    COALESCE(ds.revenue, 0.00)
                    -
                    COALESCE(di.cost, 0.00),
                    2
                ) AS gross_profit,

                CASE
                    WHEN COALESCE(ds.revenue, 0.00) > 0
                    THEN ROUND(
                        (
                            (
                                COALESCE(
                                    ds.revenue,
                                    0.00
                                )
                                -
                                COALESCE(
                                    di.cost,
                                    0.00
                                )
                            )
                            /
                            ds.revenue
                        ) * 100,
                        2
                    )
                    ELSE 0
                END AS profit_margin

            FROM dates d

            LEFT JOIN daily_sales ds
                ON ds.sale_date = d.sale_date

            LEFT JOIN daily_items di
                ON di.sale_date = d.sale_date

            ORDER BY d.sale_date ASC;

        `, [
            ...scopeParams,
            ...scopeParams,
            ...scopeParams
        ]);


        dailyTrend.forEach(row => {

            const revenue =
                Number(row.revenue) || 0;

            const cost =
                Number(row.cost) || 0;

            row.gross_profit =
                Number(
                    (revenue - cost).toFixed(2)
                );

            row.profit_margin =
                revenue > 0
                    ? Number(
                        (
                            (
                                (revenue - cost) /
                                revenue
                            ) * 100
                        ).toFixed(2)
                    )
                    : 0;
        });


        const [weeklyTrend] = await db.query(`

            WITH RECURSIVE weeks AS (

                SELECT
                    DATE_SUB(
                        CURDATE(),
                        INTERVAL WEEKDAY(CURDATE()) DAY
                    ) AS week_start

                UNION ALL

                SELECT
                    DATE_SUB(
                        week_start,
                        INTERVAL 1 WEEK
                    )
                FROM weeks
                WHERE week_start >
                    DATE_SUB(
                        DATE_SUB(
                            CURDATE(),
                            INTERVAL WEEKDAY(CURDATE()) DAY
                        ),
                        INTERVAL 6 WEEK
                    )
            ),

            weekly_sales AS (

                SELECT

                    DATE_SUB(
                        DATE(s.created_at),
                        INTERVAL WEEKDAY(
                            s.created_at
                        ) DAY
                    ) AS week_start,

                    COUNT(*) AS completed_sales,

                    ROUND(
                        SUM(
                            s.subtotal -
                            (
                                s.subtotal *
                                (s.discount / 100)
                            )
                        ),
                        2
                    ) AS revenue

                FROM sales s

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
                  

                GROUP BY
                    DATE_SUB(
                        DATE(s.created_at),
                        INTERVAL WEEKDAY(
                            s.created_at
                        ) DAY
                    )
            ),

            weekly_items AS (

                SELECT

                    DATE_SUB(
                        DATE(s.created_at),
                        INTERVAL WEEKDAY(
                            s.created_at
                        ) DAY
                    ) AS week_start,

                    ROUND(
                        COALESCE(
                            SUM(si.quantity),
                            0
                        ),
                        3
                    ) AS units_sold,

                    ROUND(
                        COALESCE(
                            SUM(
                                si.quantity *
                                si.cost_price
                            ),
                            0
                        ),
                        2
                    ) AS cost

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id = s.sale_id
                   AND si.business_id = s.business_id
                   AND si.branch_id <=> s.branch_id

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
                  AND ${salesItemScope}

                GROUP BY
                    DATE_SUB(
                        DATE(s.created_at),
                        INTERVAL WEEKDAY(
                            s.created_at
                        ) DAY
                    )
            )

            SELECT

                DATE_FORMAT(
                    w.week_start,
                    '%x-W%v'
                ) AS week_label,

                w.week_start,

                COALESCE(
                    ws.revenue,
                    0.00
                ) AS revenue,

                COALESCE(
                    wi.cost,
                    0.00
                ) AS cost,

                COALESCE(
                    ws.completed_sales,
                    0
                ) AS completed_sales,

                COALESCE(
                    wi.units_sold,
                    0.000
                ) AS units_sold,

                ROUND(
                    COALESCE(ws.revenue, 0.00)
                    -
                    COALESCE(wi.cost, 0.00),
                    2
                ) AS gross_profit,

                CASE
                    WHEN COALESCE(ws.revenue, 0.00) > 0
                    THEN ROUND(
                        (
                            (
                                COALESCE(
                                    ws.revenue,
                                    0.00
                                )
                                -
                                COALESCE(
                                    wi.cost,
                                    0.00
                                )
                            )
                            /
                            ws.revenue
                        ) * 100,
                        2
                    )
                    ELSE 0
                END AS profit_margin

            FROM weeks w

            LEFT JOIN weekly_sales ws
                ON ws.week_start =
                    w.week_start

            LEFT JOIN weekly_items wi
                ON wi.week_start =
                    w.week_start

            ORDER BY w.week_start ASC;

        `, [
            ...scopeParams,
            ...scopeParams,
            ...scopeParams
        ]);


        weeklyTrend.forEach(row => {

            const revenue =
                Number(row.revenue) || 0;

            const cost =
                Number(row.cost) || 0;

            row.sale_date =
                row.week_label;

            row.gross_profit =
                Number(
                    (revenue - cost).toFixed(2)
                );

            row.profit_margin =
                revenue > 0
                    ? Number(
                        (
                            (
                                (revenue - cost) /
                                revenue
                            ) * 100
                        ).toFixed(2)
                    )
                    : 0;
        });


        const [dailyRevenue] = await db.query(`

            WITH daily_sales AS (

                SELECT

                    DATE(s.created_at) AS sale_date,

                    COUNT(*) AS completed_sales,

                    ROUND(
                        SUM(
                            s.subtotal -
                            (
                                s.subtotal *
                                (s.discount / 100)
                            )
                        ),
                        2
                    ) AS revenue

                FROM sales s

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}

                GROUP BY DATE(s.created_at)
            ),

            daily_items AS (

                SELECT

                    DATE(s.created_at) AS sale_date,

                    ROUND(
                        COALESCE(
                            SUM(si.quantity),
                            0
                        ),
                        3
                    ) AS units_sold

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id = s.sale_id
                   AND si.business_id = s.business_id
                   AND si.branch_id <=> s.branch_id

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
                  AND ${salesItemScope}

                GROUP BY DATE(s.created_at)
            )

            SELECT

                ds.sale_date,

                ds.completed_sales,

                COALESCE(
                    di.units_sold,
                    0
                ) AS units_sold,

                ds.revenue

            FROM daily_sales ds

            LEFT JOIN daily_items di
                ON di.sale_date =
                    ds.sale_date

            ORDER BY ds.sale_date ASC;

        `, [
            ...scopeParams,
            ...scopeParams,
            ...scopeParams
        ]);


        const [topProducts] = await db.query(`

            SELECT

                si.product_id,

                si.product_name,

                SUM(si.quantity) AS units_sold,

                ROUND(
                    SUM(si.total_price)
                    -
                    SUM(
                        CASE
                            WHEN s.subtotal = 0 THEN 0
                            ELSE
                                (
                                    si.total_price /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal *
                                    (s.discount / 100)
                                )
                        END
                    ),
                    2
                ) AS revenue,

                ROUND(
                    (
                        SUM(si.total_price)
                        -
                        SUM(
                            CASE
                                WHEN s.subtotal = 0 THEN 0
                                ELSE
                                    (
                                        si.total_price /
                                        s.subtotal
                                    )
                                    *
                                    (
                                        s.subtotal *
                                        (s.discount / 100)
                                    )
                            END
                        )
                    )
                    -
                    SUM(
                        si.quantity *
                        si.cost_price
                    ),
                    2
                ) AS gross_profit

            FROM sales_item si

            INNER JOIN sales s
                ON s.sale_id = si.sale_id
               AND s.business_id = si.business_id
               AND s.branch_id <=> si.branch_id

            WHERE s.sale_status = 'Completed'
              AND ${salesScope}
              AND ${salesItemScope}

            GROUP BY
                si.product_id,
                si.product_name

            ORDER BY units_sold DESC

            LIMIT 10;

        `, [...scopeParams,
            ...scopeParams
        ]);


        topProducts.forEach(product => {

            const revenue =
                Number(product.revenue) || 0;

            const grossProfit =
                Number(product.gross_profit) || 0;

            product.profit_margin =
                revenue > 0
                    ? Number(
                        (
                            (grossProfit / revenue) *
                            100
                        ).toFixed(2)
                    )
                    : 0;
        });


        const [categoryPerformance] = await db.query(`

            SELECT

                COALESCE(
                    p.category,
                    'Uncategorized'
                ) AS category,

                SUM(si.quantity) AS units_sold,

                ROUND(
                    SUM(si.total_price)
                    -
                    SUM(
                        CASE
                            WHEN s.subtotal = 0 THEN 0
                            ELSE
                                (
                                    si.total_price /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal *
                                    (s.discount / 100)
                                )
                        END
                    ),
                    2
                ) AS revenue,

                ROUND(
                    SUM(
                        si.quantity *
                        si.cost_price
                    ),
                    2
                ) AS estimated_cost

            FROM sales_item si

            INNER JOIN sales s
                ON s.sale_id = si.sale_id
               AND s.business_id = si.business_id
               AND s.branch_id <=> si.branch_id

            INNER JOIN products p
                ON p.product_id = si.product_id
               AND p.business_id = si.business_id

            WHERE s.sale_status = 'Completed'
              AND ${salesScope}
              AND ${salesItemScope}
              AND ${productScope}

            GROUP BY p.category

            ORDER BY revenue DESC;

        `, [
            ...scopeParams,
            ...scopeParams,
            ...scopeParams
        ]);


        categoryPerformance.forEach(category => {

            const revenue =
                Number(category.revenue) || 0;

            const cost =
                Number(category.estimated_cost) || 0;

            category.gross_profit =
                Number(
                    (revenue - cost).toFixed(2)
                );

            category.profit_margin =
                revenue > 0
                    ? Number(
                        (
                            (
                                (revenue - cost) /
                                revenue
                            ) * 100
                        ).toFixed(2)
                    )
                    : 0;
        });


        const [cashierPerformance] = await db.query(`

            WITH cashier_sales AS (

                SELECT

                    s.sale_id,

                    s.cashier_id,

                    s.subtotal,

                    s.discount,

                    (
                        s.subtotal -
                        (
                            s.subtotal *
                            (s.discount / 100)
                        )
                    ) AS net_revenue

                FROM sales s

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
                  
            ),

            cashier_costs AS (

                SELECT

                    s.cashier_id,

                    COALESCE(
                        SUM(
                            si.quantity *
                            si.cost_price
                        ),
                        0.00
                    ) AS cost

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id = s.sale_id
                   AND si.business_id = s.business_id
                   AND si.branch_id <=> s.branch_id

                WHERE s.sale_status = 'Completed'
                  AND ${salesScope}
                  AND ${salesItemScope}

                GROUP BY s.cashier_id
            )

            SELECT

                u.UserID,

                u.FirstName,

                u.LastName,

                CONCAT(
                    u.FirstName,
                    ' ',
                    u.LastName
                ) AS cashier_name,

                COUNT(
                    DISTINCT cs.sale_id
                ) AS completed_sales,

                ROUND(
                    SUM(cs.net_revenue),
                    2
                ) AS revenue,

                ROUND(
                    COALESCE(
                        cc.cost,
                        0.00
                    ),
                    2
                ) AS cost

            FROM cashier_sales cs

            INNER JOIN users u
                ON u.UserID = cs.cashier_id

            LEFT JOIN cashier_costs cc
                ON cc.cashier_id =
                    cs.cashier_id

            WHERE ${userScope}

            GROUP BY
                u.UserID,
                u.FirstName,
                u.LastName,
                cc.cost

            ORDER BY revenue DESC;

        `, [
            ...scopeParams,
            ...scopeParams,
            ...scopeParams,
            ...scopeParams
        ]);


        cashierPerformance.forEach(cashier => {

            const revenue =
                Number(cashier.revenue) || 0;

            const cost =
                Number(cashier.cost) || 0;

            cashier.gross_profit =
                Number(
                    (revenue - cost).toFixed(2)
                );

            cashier.profit_margin =
                revenue > 0
                    ? Number(
                        (
                            (
                                (revenue - cost) /
                                revenue
                            ) * 100
                        ).toFixed(2)
                    )
                    : 0;

            cashier.average_transaction_value =
                cashier.completed_sales > 0
                    ? Number(
                        (
                            revenue /
                            cashier.completed_sales
                        ).toFixed(2)
                    )
                    : 0;
        });


        const [paymentMethods] = await db.query(`

            SELECT

                pm.payment_method,

                COUNT(*) AS payment_transactions,

                ROUND(
                    COALESCE(
                        SUM(pm.amount),
                        0.00
                    ),
                    2
                ) AS amount_collected,

                ROUND(
                    COALESCE(
                        SUM(pm.amount),
                        0.00
                    ),
                    2
                ) AS amount

            FROM payments pm

            INNER JOIN sales s
                ON s.sale_id = pm.sale_id
               AND s.business_id = pm.business_id
               AND s.branch_id <=> pm.branch_id

            WHERE s.sale_status = 'Completed'
              AND pm.payment_status = 'Paid'
              AND ${paymentScope}

            GROUP BY pm.payment_method

            ORDER BY amount_collected DESC;

        `, scopeParams);


        const [dayOfWeekRevenue] = await db.query(`

            SELECT

                DAYNAME(s.created_at) AS day_of_week,

                DAYOFWEEK(s.created_at) AS day_number,

                ROUND(
                    SUM(
                        s.subtotal -
                        (
                            s.subtotal *
                            (s.discount / 100)
                        )
                    ),
                    2
                ) AS revenue,

                COUNT(*) AS completed_sales

            FROM sales s

            WHERE s.sale_status = 'Completed'
              AND ${salesScope}

            GROUP BY
                DAYNAME(s.created_at),
                DAYOFWEEK(s.created_at)

            ORDER BY day_number ASC;

        `, scopeParams);


        const [inventorySummaryRows] = await db.query(`

            SELECT

                COUNT(*) AS total_products,

                ROUND(
                    COALESCE(
                        SUM(
                            stock_totals.total_quantity
                        ),
                        0
                    ),
                    3
                ) AS total_units,

                ROUND(
                    COALESCE(
                        SUM(
                            p.cost_price *
                            stock_totals.total_quantity
                        ),
                        0.00
                    ),
                    2
                ) AS inventory_cost_value,

                ROUND(
                    COALESCE(
                        SUM(
                            (
                                p.selling_price -
                                p.cost_price
                            ) *
                            stock_totals.total_quantity
                        ),
                        0.00
                    ),
                    2
                ) AS potential_gross_profit,

                ROUND(
                    COALESCE(
                        SUM(
                            p.selling_price *
                            stock_totals.total_quantity
                        ),
                        0.00
                    ),
                    2
                ) AS potential_sales_value

            FROM products p

            INNER JOIN (

                SELECT

                    product_id,

                    SUM(quantity_available)
                        AS total_quantity

                FROM stock st

                WHERE ${stockScope}

                GROUP BY product_id

            ) stock_totals

                ON stock_totals.product_id =
                    p.product_id

            WHERE ${productScope}
              AND stock_totals.total_quantity > 0;

        `, [
            ...scopeParams,
            ...scopeParams
        ]);


        const [inventoryByProduct] = await db.query(`

            SELECT

                p.product_id,

                p.product_name,

                p.brand,

                p.category,

                ROUND(
                    COALESCE(
                        st.total_quantity,
                        0
                    ),
                    3
                ) AS quantity_available,

                ROUND(
                    p.cost_price,
                    2
                ) AS cost_price,

                ROUND(
                    p.selling_price,
                    2
                ) AS selling_price,

                ROUND(
                    p.cost_price *
                    COALESCE(
                        st.total_quantity,
                        0
                    ),
                    2
                ) AS inventory_cost_value,

                ROUND(
                    (
                        p.selling_price -
                        p.cost_price
                    )
                    *
                    COALESCE(
                        st.total_quantity,
                        0
                    ),
                    2
                ) AS potential_gross_profit

            FROM products p

            INNER JOIN (

                SELECT

                    product_id,

                    SUM(quantity_available)
                        AS total_quantity

                FROM stock st

                WHERE ${stockScope}

                GROUP BY product_id

            ) st

                ON st.product_id =
                    p.product_id

            WHERE ${productScope}
              AND st.total_quantity > 0

            ORDER BY
                p.product_name ASC;

        `, [
            ...scopeParams,
            ...scopeParams
        ]);


        const [neverSoldProducts] = await db.query(`

            SELECT

                p.product_id,

                p.product_name,

                p.category,

                p.brand,

                p.cost_price,

                p.selling_price,

                COALESCE(
                    st.total_quantity,
                    0
                ) AS quantity_available,

                p.created_at

            FROM products p

            LEFT JOIN sales_item si
                ON si.product_id =
                    p.product_id
            AND si.business_id =
                    p.business_id
            AND ${salesItemScope}

            LEFT JOIN sales s
                ON s.sale_id =
                    si.sale_id
            AND s.business_id =
                    si.business_id
            AND s.branch_id <=> si.branch_id
            AND s.sale_status =
                    'Completed'
            AND ${salesScope}

            LEFT JOIN (

                SELECT

                    product_id,

                    SUM(quantity_available)
                        AS total_quantity

                FROM stock st

                WHERE ${stockScope}

                GROUP BY product_id

            ) st

                ON st.product_id =
                    p.product_id

            WHERE ${productScope}

            GROUP BY

                p.product_id,
                p.product_name,
                p.category,
                p.brand,
                p.cost_price,
                p.selling_price,
                p.created_at,
                st.total_quantity

            HAVING COUNT(s.sale_id) = 0

            ORDER BY p.product_name;

        `, [
            ...scopeParams,
            ...scopeParams,
            ...scopeParams,
            ...scopeParams
        ]);
        const [bestRevenueDayRows] = await db.query(`

            SELECT

                DATE(s.created_at) AS sale_date,

                ROUND(
                    SUM(
                        s.subtotal -
                        (
                            s.subtotal *
                            (s.discount / 100)
                        )
                    ),
                    2
                ) AS revenue,

                COUNT(*) AS completed_sales

            FROM sales s

            WHERE s.sale_status = 'Completed'
              AND ${salesScope}

            GROUP BY DATE(s.created_at)

            ORDER BY revenue DESC

            LIMIT 1;

        `, scopeParams);


        const [bestRevenueMonthRows] = await db.query(`

            SELECT

                DATE_FORMAT(
                    s.created_at,
                    '%Y-%m'
                ) AS month,

                DATE_FORMAT(
                    s.created_at,
                    '%M %Y'
                ) AS month_label,

                ROUND(
                    SUM(
                        s.subtotal -
                        (
                            s.subtotal *
                            (s.discount / 100)
                        )
                    ),
                    2
                ) AS revenue,

                COUNT(*) AS completed_sales

            FROM sales s

            WHERE s.sale_status = 'Completed'
              AND ${salesScope}

            GROUP BY
                YEAR(s.created_at),
                MONTH(s.created_at),
                DATE_FORMAT(
                    s.created_at,
                    '%Y-%m'
                ),
                DATE_FORMAT(
                    s.created_at,
                    '%M %Y'
                )

            ORDER BY revenue DESC

            LIMIT 1;

        `, scopeParams);


        const summary = summaryRows[0] || {
            completed_sales: 0,
            total_revenue: 0,
            units_sold: 0,
            estimated_cost: 0,
            estimated_gross_profit: 0,
            estimated_profit_margin_percent: 0,
            gross_subtotal: 0,
            total_discount: 0,
            total_tax: 0,
            total_grand_total: 0,
            average_transaction_value: 0
        };


        const inventorySummary =
            inventorySummaryRows[0] || {
                total_products: 0,
                total_units: 0,
                potential_sales_value: 0,
                inventory_cost_value: 0,
                potential_gross_profit: 0
            };


        const bestRevenueDay =
            bestRevenueDayRows[0] || null;

        const bestRevenueMonth =
            bestRevenueMonthRows[0] || null;

        res.render("profitabledashboard", {

            currentDate:
                new Date().toLocaleDateString(
                    "en-GH",
                    {
                        year: "numeric",
                        month: "long",
                        day: "numeric"
                    }
                ),

            scope: mode,
            mode,

            businessId,
            businessName,

            branches: branchOptions,

            branchId,
            branchName,
            branchLocation,

            isBusinessScope:
                mode === "business",

            isBranchScope:
                mode === "branch",

            completedSales:
                summary.completed_sales,

            totalRevenue:
                summary.total_revenue,

            unitsSold:
                summary.units_sold,

            estimatedCost:
                summary.estimated_cost,

            estimatedGrossProfit:
                summary.estimated_gross_profit,

            profitMargin:
                summary.estimated_profit_margin_percent,

            totalDiscount:
                summary.total_discount,

            totalTax:
                summary.total_tax,

            totalGrandTotal:
                summary.total_grand_total,

            averageTransaction:
                summary.average_transaction_value,

            monthlyRevenue,
            monthlyPerformance,
            dailyTrend,
            weeklyTrend,
            dailyRevenue,
            topProducts,
            categoryPerformance,
            cashierPerformance,
            paymentMethods,
            dayOfWeekRevenue,
            inventorySummary,
            inventoryByProduct,
            neverSoldProducts,
            bestRevenueDay,
            bestRevenueMonth
        });

    } catch (error) {

        console.error(
            "Dashboard Error:",
            error
        );

        res
            .status(500)
            .send("Unable to load dashboard.");
    }
};