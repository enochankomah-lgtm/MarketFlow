const db = require("../Database/db");

/* ================================================================
   CUSTOMER SCOPE
   ================================================================ */

const getAuthenticatedBusinessId = req => {
    const businessId =
        req.session?.user?.business_id ??
        req.session?.business_id ??
        req.user?.business_id ??
        null;

    const normalized = Number(businessId);

    return Number.isInteger(normalized) && normalized > 0
        ? normalized
        : null;
};

const getRequestedBranchId = req => {
    const branchId =
        req.query?.branch_id ??
        req.query?.branchId ??
        null;

    if (branchId === null || branchId === "") {
        return null;
    }

    const normalized = Number(branchId);

    return Number.isInteger(normalized) && normalized > 0
        ? normalized
        : null;
};

const normalizeScope = req => {
    const requestedScope =
        req.query?.scope ??
        req.query?.mode ??
        null;

    const branchId =
        getRequestedBranchId(req);

    if (
        String(requestedScope || "")
            .trim()
            .toLowerCase() === "branch" ||
        branchId !== null
    ) {
        return "branch";
    }

    return "business";
};

/* ================================================================
   PERIOD
   ================================================================ */

const pad = value =>
    String(value).padStart(2, "0");

const formatDate = date => {
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-");
};

const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const formatMoney = value =>
    Number(value || 0).toFixed(2);

const getPeriod = period => {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const normalizedPeriod =
        String(period || "month")
            .trim()
            .toLowerCase();

    let startDate;
    let endDate;

    switch (normalizedPeriod) {
        case "today":
            startDate = new Date(today);
            endDate = addDays(today, 1);
            break;

        case "week": {
            const day = today.getDay();

            const daysFromMonday =
                day === 0 ? 6 : day - 1;

            startDate =
                addDays(
                    today,
                    -daysFromMonday
                );

            endDate =
                addDays(startDate, 7);

            break;
        }

        case "quarter": {
            const currentMonth =
                today.getMonth();

            const quarterStartMonth =
                Math.floor(currentMonth / 3) * 3;

            startDate = new Date(
                today.getFullYear(),
                quarterStartMonth,
                1
            );

            endDate = new Date(
                today.getFullYear(),
                quarterStartMonth + 3,
                1
            );

            break;
        }

        case "year":
            startDate = new Date(
                today.getFullYear(),
                0,
                1
            );

            endDate = new Date(
                today.getFullYear() + 1,
                0,
                1
            );

            break;

        case "all":
            startDate = null;
            endDate = null;
            break;

        case "month":
        default:
            startDate = new Date(
                today.getFullYear(),
                today.getMonth(),
                1
            );

            endDate = new Date(
                today.getFullYear(),
                today.getMonth() + 1,
                1
            );

            break;
    }

    return {
        key: normalizedPeriod,
        startDate,
        endDate,
        start: startDate
            ? formatDate(startDate)
            : null,
        end: endDate
            ? formatDate(endDate)
            : null
    };
};

const getAcquisitionTrendPeriod = period => {
    if (
        period === "today" ||
        period === "week" ||
        period === "month"
    ) {
        return "day";
    }

    return "month";
};

/* ================================================================
   CUSTOMER DASHBOARD
   ================================================================ */

const getDashboard = async (req, res) => {
    try {
        const businessId =
            getAuthenticatedBusinessId(req);

        if (!businessId) {
            return res.status(401).send(
                "Business authentication required."
            );
        }

        const [businessRows] =
            await db.query(
                `
                SELECT
                    business_id,
                    business_name,
                    is_active
                FROM businesses
                WHERE business_id = ?
                LIMIT 1
                `,
                [businessId]
            );

        if (!businessRows.length) {
            return res.status(404).send(
                "Business not found."
            );
        }

        const business =
            businessRows[0];

        if (!business.is_active) {
            return res.status(403).send(
                "This business is inactive."
            );
        }

        const scope =
            normalizeScope(req);

        const requestedBranchId =
            getRequestedBranchId(req);

        let branchId = null;
        let branchName = null;
        let branchLocation = null;

        if (scope === "branch") {
            if (requestedBranchId === null) {
                return res.status(400).send(
                    "A valid branch_id is required for branch scope."
                );
            }

            const [branchRows] =
                await db.query(
                    `
                    SELECT
                        branch_id,
                        branch_name,
                        location,
                        is_active
                    FROM branches
                    WHERE branch_id = ?
                      AND business_id = ?
                      AND is_active = 1
                    LIMIT 1
                    `,
                    [
                        requestedBranchId,
                        businessId
                    ]
                );

            if (!branchRows.length) {
                return res.status(403).send(
                    "Selected branch was not found for this business."
                );
            }

            branchId =
                branchRows[0].branch_id;

            branchName =
                branchRows[0].branch_name;

            branchLocation =
                branchRows[0].location;
        }

        const [branches] =
            await db.query(
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

        const branchOptions =
            branches.map(branch => ({
                branch_id:
                    branch.branch_id,
                branch_name:
                    branch.branch_name,
                location:
                    branch.location,
                selected:
                    scope === "branch" &&
                    String(branch.branch_id) ===
                        String(branchId)
            }));

        const period =
            getPeriod(
                req.query?.period
            );

        const customerScope =
            scope === "branch"
                ? `
                    c.business_id = ?
                    AND c.branch_id = ?
                `
                : `
                    c.business_id = ?
                `;

        const salesScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const scopeParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        /* ============================================================
           CUSTOMER OVERVIEW
           ============================================================ */

        const [customerBaseRows] =
            await db.query(
                `
                SELECT
                    COUNT(*) AS total_customers,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN LOWER(
                                    COALESCE(c.status, '')
                                ) = 'active'
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS active_customers
                FROM customers c
                WHERE ${customerScope}
                `,
                [
                    ...scopeParams
                ]
            );

        const customerBase =
            customerBaseRows[0] || {};

        let salesMetrics;

        if (period.key === "all") {
            const [rows] =
                await db.query(
                    `
                    SELECT
                        COUNT(*) AS customers_with_purchases,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN cs.total_orders > 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS returning_customers,
                        COUNT(*) AS new_customers,
                        COALESCE(
                            SUM(
                                cs.customer_revenue
                            ),
                            0
                        ) AS customer_revenue,
                        COALESCE(
                            SUM(
                                cs.total_orders
                            ),
                            0
                        ) AS customer_orders
                    FROM (
                        SELECT
                            c.customer_id,
                            COUNT(s.sale_id)
                                AS total_orders,
                            MIN(s.created_at)
                                AS first_purchase,
                            COALESCE(
                                SUM(
                                    s.subtotal -
                                    (
                                        s.subtotal *
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                ),
                                0
                            ) AS customer_revenue
                        FROM customers c
                        INNER JOIN sales s
                            ON s.customer_id =
                               c.customer_id
                           AND s.business_id =
                               c.business_id
                           AND ${salesScope}
                        WHERE ${customerScope}
                          AND s.sale_status =
                              'Completed'
                        GROUP BY
                            c.customer_id
                    ) cs
                    `,
                    [
                        ...scopeParams,
                        ...scopeParams
                    ]
                );

            salesMetrics =
                rows[0] || {};
        } else {
            const [rows] =
                await db.query(
                    `
                    SELECT
                        COUNT(*) AS customers_with_purchases,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN cs.total_orders > 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS returning_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN cs.first_purchase >= ?
                                     AND cs.first_purchase < ?
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS new_customers,
                        COALESCE(
                            SUM(
                                cs.period_revenue
                            ),
                            0
                        ) AS customer_revenue,
                        COALESCE(
                            SUM(
                                cs.period_orders
                            ),
                            0
                        ) AS customer_orders
                    FROM (
                        SELECT
                            c.customer_id,
                            MIN(s.created_at)
                                AS first_purchase,
                            COUNT(s.sale_id)
                                AS total_orders,
                            COALESCE(
                                SUM(
                                    CASE
                                        WHEN s.created_at >= ?
                                         AND s.created_at < ?
                                        THEN
                                            s.subtotal -
                                            (
                                                s.subtotal *
                                                COALESCE(
                                                    s.discount,
                                                    0
                                                ) / 100
                                            )
                                        ELSE 0
                                    END
                                ),
                                0
                            ) AS period_revenue,
                            COALESCE(
                                SUM(
                                    CASE
                                        WHEN s.created_at >= ?
                                         AND s.created_at < ?
                                        THEN 1
                                        ELSE 0
                                    END
                                ),
                                0
                            ) AS period_orders
                        FROM customers c
                        INNER JOIN sales s
                            ON s.customer_id =
                               c.customer_id
                           AND s.business_id =
                               c.business_id
                           AND ${salesScope}
                        WHERE ${customerScope}
                          AND s.sale_status =
                              'Completed'
                        GROUP BY
                            c.customer_id
                        HAVING period_orders > 0
                    ) cs
                    `,
                    [
                        period.start,
                        period.end,
                        period.start,
                        period.end,
                        period.start,
                        period.end,
                        ...scopeParams,
                        ...scopeParams
                    ]
                );

            salesMetrics =
                rows[0] || {};
        }

        const totalCustomers =
            Number(
                customerBase.total_customers || 0
            );

        const activeCustomers =
            Number(
                customerBase.active_customers || 0
            );

        const newCustomers =
            Number(
                salesMetrics.new_customers || 0
            );

        const returningCustomers =
            Number(
                salesMetrics.returning_customers || 0
            );

        const customersWithPurchases =
            Number(
                salesMetrics.customers_with_purchases || 0
            );

        const customerRevenue =
            Number(
                salesMetrics.customer_revenue || 0
            );

        const customerOrders =
            Number(
                salesMetrics.customer_orders || 0
            );

        const averageCustomerValue =
            customersWithPurchases > 0
                ? customerRevenue /
                  customersWithPurchases
                : 0;

        const averageOrderValue =
            customerOrders > 0
                ? customerRevenue /
                  customerOrders
                : 0;

        const overview = {
            totalCustomers,
            activeCustomers,
            newCustomers,
            returningCustomers,
            customersWithPurchases,
            customerRevenue:
                formatMoney(
                    customerRevenue
                ),
            averageCustomerValue:
                formatMoney(
                    averageCustomerValue
                ),
            averageOrderValue:
                formatMoney(
                    averageOrderValue
                )
        };

        /* ============================================================
           CUSTOMER ACQUISITION
           ============================================================ */

        const acquisitionSalesScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const acquisitionParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        let acquisitionSummary;

        if (period.key === "all") {
            const [rows] =
                await db.query(
                    `
                    SELECT
                        COUNT(*) AS new_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN
                                        cs.total_orders > 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS returned_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN
                                        cs.total_orders = 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS never_returned_customers
                    FROM (
                        SELECT
                            s.customer_id,
                            COUNT(*) AS total_orders
                        FROM sales s
                        INNER JOIN (
                            SELECT
                                customer_id,
                                MIN(created_at)
                                    AS first_purchase
                            FROM sales
                            WHERE business_id = ?
                              AND sale_status =
                                  'Completed'
                              ${
                                  scope === "branch"
                                      ? "AND branch_id = ?"
                                      : ""
                              }
                            GROUP BY
                                customer_id
                        ) first_sale
                            ON first_sale.customer_id =
                               s.customer_id
                        WHERE
                            ${acquisitionSalesScope}
                            AND s.sale_status =
                                'Completed'
                        GROUP BY
                            s.customer_id
                    ) cs
                    `,
                    [
                        ...acquisitionParams,
                        ...acquisitionParams
                    ]
                );

            acquisitionSummary =
                rows[0] || {};
        } else {
            const [rows] =
                await db.query(
                    `
                    SELECT
                        COUNT(*) AS new_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN
                                        cs.total_orders > 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS returned_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN
                                        cs.total_orders = 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS never_returned_customers
                    FROM (
                        SELECT
                            first_sale.customer_id,
                            COUNT(s.sale_id)
                                AS total_orders
                        FROM (
                            SELECT
                                customer_id,
                                MIN(created_at)
                                    AS first_purchase
                            FROM sales
                            WHERE business_id = ?
                              AND sale_status =
                                  'Completed'
                              ${
                                  scope === "branch"
                                      ? "AND branch_id = ?"
                                      : ""
                              }
                            GROUP BY
                                customer_id
                        ) first_sale
                        INNER JOIN sales s
                            ON s.customer_id =
                               first_sale.customer_id
                           AND s.business_id = ?
                           AND s.sale_status =
                               'Completed'
                           ${
                               scope === "branch"
                                   ? "AND s.branch_id = ?"
                                   : ""
                           }
                        WHERE
                            first_sale.first_purchase >= ?
                            AND first_sale.first_purchase < ?
                        GROUP BY
                            first_sale.customer_id
                    ) cs
                    `,
                    scope === "branch"
                        ? [
                            businessId,
                            branchId,
                            businessId,
                            branchId,
                            period.start,
                            period.end
                        ]
                        : [
                            businessId,
                            businessId,
                            period.start,
                            period.end
                        ]
                );

            acquisitionSummary =
                rows[0] || {};
        }

        const acquisitionNewCustomers =
            Number(
                acquisitionSummary.new_customers || 0
            );

        const acquiredReturnedCustomers =
            Number(
                acquisitionSummary.returned_customers || 0
            );

        const neverReturnedCustomers =
            Number(
                acquisitionSummary.never_returned_customers || 0
            );

        const acquisitionReturnRate =
            acquisitionNewCustomers > 0
                ? (
                    acquiredReturnedCustomers /
                    acquisitionNewCustomers
                ) * 100
                : 0;

        const acquisition = {
            newCustomers:
                acquisitionNewCustomers,
            firstPurchaseCustomers:
                acquisitionNewCustomers,
            returnedCustomers:
                acquiredReturnedCustomers,
            neverReturnedCustomers,
            returnRate:
                Number(
                    acquisitionReturnRate.toFixed(2)
                ),
            trend: [],
            byBranch: []
        };

        /* ============================================================
           ACQUISITION TREND
           ============================================================ */

        const trendPeriod =
            getAcquisitionTrendPeriod(
                period.key
            );

        let trendRows = [];

        if (period.key === "all") {
            [trendRows] =
                await db.query(
                    `
                    SELECT
                        DATE_FORMAT(
                            first_sale,
                            '%Y-%m'
                        ) AS period_label,
                        COUNT(*) AS new_customers
                    FROM (
                        SELECT
                            customer_id,
                            MIN(created_at)
                                AS first_sale
                        FROM sales
                        WHERE business_id = ?
                          AND sale_status =
                              'Completed'
                          ${
                              scope === "branch"
                                  ? "AND branch_id = ?"
                                  : ""
                          }
                        GROUP BY
                            customer_id
                    ) first_sales
                    GROUP BY
                        period_label
                    ORDER BY
                        period_label ASC
                    `,
                    scope === "branch"
                        ? [
                            businessId,
                            branchId
                        ]
                        : [
                            businessId
                        ]
                );
        } else if (trendPeriod === "day") {
            [trendRows] =
                await db.query(
                    `
                    SELECT
                        DATE_FORMAT(
                            first_sale,
                            '%Y-%m-%d'
                        ) AS period_label,
                        COUNT(*) AS new_customers
                    FROM (
                        SELECT
                            customer_id,
                            MIN(created_at)
                                AS first_sale
                        FROM sales
                        WHERE business_id = ?
                          AND sale_status =
                              'Completed'
                          ${
                              scope === "branch"
                                  ? "AND branch_id = ?"
                                  : ""
                          }
                        GROUP BY
                            customer_id
                    ) first_sales
                    WHERE first_sale >= ?
                      AND first_sale < ?
                    GROUP BY
                        period_label
                    ORDER BY
                        period_label ASC
                    `,
                    scope === "branch"
                        ? [
                            businessId,
                            branchId,
                            period.start,
                            period.end
                        ]
                        : [
                            businessId,
                            period.start,
                            period.end
                        ]
                );
        } else {
            [trendRows] =
                await db.query(
                    `
                    SELECT
                        DATE_FORMAT(
                            first_sale,
                            '%Y-%m'
                        ) AS period_label,
                        COUNT(*) AS new_customers
                    FROM (
                        SELECT
                            customer_id,
                            MIN(created_at)
                                AS first_sale
                        FROM sales
                        WHERE business_id = ?
                          AND sale_status =
                              'Completed'
                          ${
                              scope === "branch"
                                  ? "AND branch_id = ?"
                                  : ""
                          }
                        GROUP BY
                            customer_id
                    ) first_sales
                    WHERE first_sale >= ?
                      AND first_sale < ?
                    GROUP BY
                        period_label
                    ORDER BY
                        period_label ASC
                    `,
                    scope === "branch"
                        ? [
                            businessId,
                            branchId,
                            period.start,
                            period.end
                        ]
                        : [
                            businessId,
                            period.start,
                            period.end
                        ]
                );
        }

        acquisition.trend =
            trendRows.map(row => ({
                period:
                    row.period_label,
                newCustomers:
                    Number(
                        row.new_customers || 0
                    )
            }));

        /* ============================================================
           ACQUISITION BY BRANCH
           ============================================================ */

        if (scope === "business") {
            const [branchRows] =
                await db.query(
                    `
                    SELECT
                        first_sales.branch_id,
                        COALESCE(
                            b.branch_name,
                            'Unassigned'
                        ) AS branch_name,
                        COUNT(*) AS new_customers
                    FROM (
                        SELECT
                            ranked.customer_id,
                            ranked.branch_id,
                            ranked.first_purchase
                        FROM (
                            SELECT
                                s.customer_id,
                                s.branch_id,
                                s.created_at
                                    AS first_purchase,
                                ROW_NUMBER() OVER (
                                    PARTITION BY
                                        s.customer_id
                                    ORDER BY
                                        s.created_at ASC,
                                        s.sale_id ASC
                                ) AS row_number
                            FROM sales s
                            WHERE s.business_id = ?
                              AND s.sale_status =
                                  'Completed'
                        ) ranked
                        WHERE ranked.row_number = 1
                    ) first_sales
                    LEFT JOIN branches b
                        ON b.branch_id =
                           first_sales.branch_id
                       AND b.business_id = ?
                    WHERE first_sales.first_purchase >= ?
                      AND first_sales.first_purchase < ?
                    GROUP BY
                        first_sales.branch_id,
                        b.branch_name
                    ORDER BY
                        new_customers DESC,
                        branch_name ASC
                    `,
                    [
                        businessId,
                        businessId,
                        period.start ||
                            "1000-01-01",
                        period.end ||
                            "9999-12-31"
                    ]
                );

            acquisition.byBranch =
                branchRows.map(row => ({
                    branchId:
                        row.branch_id,
                    branchName:
                        row.branch_name,
                    newCustomers:
                        Number(
                            row.new_customers || 0
                        )
                }));
        } else {
            acquisition.byBranch = [{
                branchId,
                branchName:
                    branchName ||
                    "Selected Branch",
                newCustomers:
                    acquisitionNewCustomers
            }];
        }

                /* ============================================================
           CUSTOMER RETENTION
           ============================================================ */

        const retentionSalesScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const retentionParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        let retentionSummary;

        if (period.key === "all") {
            const [rows] =
                await db.query(
                    `
                    SELECT
                        COUNT(*) AS purchasing_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_orders > 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS returning_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_orders = 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS one_time_customers
                    FROM (
                        SELECT
                            s.customer_id,
                            COUNT(s.sale_id)
                                AS customer_orders
                        FROM sales s
                        WHERE ${retentionSalesScope}
                          AND s.customer_id IS NOT NULL
                          AND s.sale_status =
                              'Completed'
                        GROUP BY
                            s.customer_id
                    ) customer_activity
                    `,
                    [
                        ...retentionParams
                    ]
                );

            retentionSummary =
                rows[0] || {};
        } else {
            const [rows] =
                await db.query(
                    `
                    SELECT
                        COUNT(*) AS purchasing_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_orders > 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS returning_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_orders = 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS one_time_customers
                    FROM (
                        SELECT
                            s.customer_id,
                            COUNT(s.sale_id)
                                AS customer_orders
                        FROM sales s
                        WHERE ${retentionSalesScope}
                          AND s.customer_id IS NOT NULL
                          AND s.sale_status =
                              'Completed'
                          AND s.created_at >= ?
                          AND s.created_at < ?
                        GROUP BY
                            s.customer_id
                    ) customer_activity
                    `,
                    [
                        ...retentionParams,
                        period.start,
                        period.end
                    ]
                );

            retentionSummary =
                rows[0] || {};
        }

        const retentionPurchasingCustomers =
            Number(
                retentionSummary.purchasing_customers || 0
            );

        const retentionReturningCustomers =
            Number(
                retentionSummary.returning_customers || 0
            );

        const retentionOneTimeCustomers =
            Number(
                retentionSummary.one_time_customers || 0
            );

        const repeatPurchaseRate =
            retentionPurchasingCustomers > 0
                ? (
                    retentionReturningCustomers /
                    retentionPurchasingCustomers
                ) * 100
                : 0;

        /* ============================================================
           RETENTION TREND
           ============================================================ */

        let retentionTrend = [];

        if (period.key === "all") {
            const [trendRows] =
                await db.query(
                    `
                    SELECT
                        DATE_FORMAT(
                            customer_period.period_start,
                            '%Y-%m'
                        ) AS period_label,
                        COUNT(*) AS purchasing_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_period.orders_count > 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS returning_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_period.orders_count = 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS one_time_customers
                    FROM (
                        SELECT
                            s.customer_id,
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-01'
                            ) AS period_start,
                            COUNT(s.sale_id)
                                AS orders_count
                        FROM sales s
                        WHERE ${retentionSalesScope}
                          AND s.customer_id IS NOT NULL
                          AND s.sale_status =
                              'Completed'
                        GROUP BY
                            s.customer_id,
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-01'
                            )
                    ) customer_period
                    GROUP BY
                        customer_period.period_start
                    ORDER BY
                        customer_period.period_start ASC
                    `,
                    [
                        ...retentionParams
                    ]
                );

            retentionTrend =
                trendRows.map(row => {
                    const purchasingCustomers =
                        Number(
                            row.purchasing_customers || 0
                        );

                    const returningCustomers =
                        Number(
                            row.returning_customers || 0
                        );

                    const rate =
                        purchasingCustomers > 0
                            ? (
                                returningCustomers /
                                purchasingCustomers
                            ) * 100
                            : 0;

                    return {
                        period:
                            row.period_label,
                        purchasingCustomers,
                        returningCustomers,
                        oneTimeCustomers:
                            Number(
                                row.one_time_customers || 0
                            ),
                        repeatPurchaseRate:
                            Number(
                                rate.toFixed(2)
                            )
                    };
                });
        } else {
            const [trendRows] =
                await db.query(
                    `
                    SELECT
                        DATE_FORMAT(
                            customer_period.period_start,
                            '%Y-%m-%d'
                        ) AS period_label,
                        COUNT(*) AS purchasing_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_period.orders_count > 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS returning_customers,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_period.orders_count = 1
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS one_time_customers
                    FROM (
                        SELECT
                            s.customer_id,
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-%d'
                            ) AS period_start,
                            COUNT(s.sale_id)
                                AS orders_count
                        FROM sales s
                        WHERE ${retentionSalesScope}
                          AND s.customer_id IS NOT NULL
                          AND s.sale_status =
                              'Completed'
                          AND s.created_at >= ?
                          AND s.created_at < ?
                        GROUP BY
                            s.customer_id,
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-%d'
                            )
                    ) customer_period
                    GROUP BY
                        customer_period.period_start
                    ORDER BY
                        customer_period.period_start ASC
                    `,
                    [
                        ...retentionParams,
                        period.start,
                        period.end
                    ]
                );

            retentionTrend =
                trendRows.map(row => {
                    const purchasingCustomers =
                        Number(
                            row.purchasing_customers || 0
                        );

                    const returningCustomers =
                        Number(
                            row.returning_customers || 0
                        );

                    const rate =
                        purchasingCustomers > 0
                            ? (
                                returningCustomers /
                                purchasingCustomers
                            ) * 100
                            : 0;

                    return {
                        period:
                            row.period_label,
                        purchasingCustomers,
                        returningCustomers,
                        oneTimeCustomers:
                            Number(
                                row.one_time_customers || 0
                            ),
                        repeatPurchaseRate:
                            Number(
                                rate.toFixed(2)
                            )
                    };
                });
        }

        /* ============================================================
           RETENTION TREND DIRECTION
           ============================================================ */

        let retentionDirection = "→";

        if (retentionTrend.length >= 2) {
            const currentRate =
                Number(
                    retentionTrend[
                        retentionTrend.length - 1
                    ].repeatPurchaseRate || 0
                );

            const previousRate =
                Number(
                    retentionTrend[
                        retentionTrend.length - 2
                    ].repeatPurchaseRate || 0
                );

            const difference =
                currentRate - previousRate;

            if (difference > 0.5) {
                retentionDirection = "↑";
            } else if (difference < -0.5) {
                retentionDirection = "↓";
            }
        }

        const retention = {
            purchasingCustomers:
                retentionPurchasingCustomers,
            returningCustomers:
                retentionReturningCustomers,
            oneTimeCustomers:
                retentionOneTimeCustomers,
            repeatPurchaseRate:
                Number(
                    repeatPurchaseRate.toFixed(2)
                ),
            trendDirection:
                retentionDirection,
            trend:
                retentionTrend
        };

                /* ============================================================
           CUSTOMER SEGMENTATION
           ============================================================ */

        const segmentationSalesScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const segmentationParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        const [segmentationCustomerRows] =
            await db.query(
                `
                SELECT
                    s.customer_id,
                    COUNT(s.sale_id) AS total_orders,
                    COALESCE(
                        SUM(
                            s.subtotal -
                            (
                                s.subtotal *
                                COALESCE(s.discount, 0) / 100
                            )
                        ),
                        0
                    ) AS lifetime_revenue,
                    MIN(s.created_at) AS first_purchase,
                    MAX(s.created_at) AS last_purchase
                FROM sales s
                WHERE ${segmentationSalesScope}
                  AND s.customer_id IS NOT NULL
                  AND s.sale_status = 'Completed'
                GROUP BY
                    s.customer_id
                ORDER BY
                    lifetime_revenue DESC
                `,
                [
                    ...segmentationParams
                ]
            );

        const segmentationCustomers =
            segmentationCustomerRows.map(row => ({
                customerId:
                    Number(row.customer_id),
                totalOrders:
                    Number(row.total_orders || 0),
                lifetimeRevenue:
                    Number(row.lifetime_revenue || 0),
                firstPurchase:
                    row.first_purchase,
                lastPurchase:
                    row.last_purchase
            }));

        /* ============================================================
           SEGMENTATION THRESHOLDS
           ============================================================ */

        const segmentationToday =
            new Date();

        segmentationToday.setHours(
            0,
            0,
            0,
            0
        );

        const segmentationDaysSince = date => {
            if (!date) {
                return null;
            }

            const purchaseDate =
                new Date(date);

            purchaseDate.setHours(
                0,
                0,
                0,
                0
            );

            return Math.floor(
                (
                    segmentationToday.getTime() -
                    purchaseDate.getTime()
                ) /
                86400000
            );
        };

        const purchasingCustomerCount =
            segmentationCustomers.length;

        const vipCustomerLimit =
            Math.max(
                1,
                Math.ceil(
                    purchasingCustomerCount * 0.10
                )
            );

        /* ============================================================
           CUSTOMER SEGMENT CLASSIFICATION
           ============================================================ */

        const segmentOrder = [
            "VIP / High Value",
            "Loyal",
            "Regular",
            "New",
            "At Risk",
            "Dormant",
            "One-Time"
        ];

        const segmentDefinitions = {
            "VIP / High Value": {
                key: "vip",
                description:
                    "Top 10% of purchasing customers by lifetime revenue."
            },
            "Loyal": {
                key: "loyal",
                description:
                    "Customers with at least 3 completed purchases who purchased within the last 90 days."
            },
            "Regular": {
                key: "regular",
                description:
                    "Customers with at least 2 completed purchases who purchased within the last 90 days."
            },
            "New": {
                key: "new",
                description:
                    "Customers whose first completed purchase was within the last 30 days."
            },
            "At Risk": {
                key: "atRisk",
                description:
                    "Customers with at least 2 completed purchases whose last purchase was 91–180 days ago."
            },
            "Dormant": {
                key: "dormant",
                description:
                    "Customers whose last completed purchase was more than 180 days ago."
            },
            "One-Time": {
                key: "oneTime",
                description:
                    "Customers with exactly 1 completed purchase who are not classified as New."
            }
        };

        const segmentTotals = {};

        segmentOrder.forEach(segment => {
            segmentTotals[segment] = {
                segment,
                key:
                    segmentDefinitions[
                        segment
                    ].key,
                customers: 0,
                revenue: 0,
                orders: 0
            };
        });

        const classifiedCustomers = [];

        segmentationCustomers.forEach(
            (customer, index) => {
                const daysSinceLastPurchase =
                    segmentationDaysSince(
                        customer.lastPurchase
                    );

                const daysSinceFirstPurchase =
                    segmentationDaysSince(
                        customer.firstPurchase
                    );

                let segment;

                if (
                    index < vipCustomerLimit
                ) {
                    segment =
                        "VIP / High Value";
                } else if (
                    daysSinceFirstPurchase !== null &&
                    daysSinceFirstPurchase <= 30
                ) {
                    segment =
                        "New";
                } else if (
                    customer.totalOrders === 1
                ) {
                    segment =
                        "One-Time";
                } else if (
                    daysSinceLastPurchase !== null &&
                    daysSinceLastPurchase > 180
                ) {
                    segment =
                        "Dormant";
                } else if (
                    daysSinceLastPurchase !== null &&
                    daysSinceLastPurchase > 90
                ) {
                    segment =
                        "At Risk";
                } else if (
                    customer.totalOrders >= 3
                ) {
                    segment =
                        "Loyal";
                } else {
                    segment =
                        "Regular";
                }

                const total =
                    segmentTotals[segment];

                total.customers += 1;
                total.revenue +=
                    customer.lifetimeRevenue;
                total.orders +=
                    customer.totalOrders;

                classifiedCustomers.push({
                    customerId:
                        customer.customerId,
                    segment,
                    totalOrders:
                        customer.totalOrders,
                    lifetimeRevenue:
                        formatMoney(
                            customer.lifetimeRevenue
                        ),
                    firstPurchase:
                        customer.firstPurchase,
                    lastPurchase:
                        customer.lastPurchase,
                    daysSinceLastPurchase
                });
            }
        );

        /* ============================================================
           SEGMENTATION SUMMARY
           ============================================================ */

        const customerSegmentation =
            segmentOrder.map(segment => {
                const data =
                    segmentTotals[segment];

                return {
                    segment:
                        data.segment,
                    key:
                        data.key,
                    description:
                        segmentDefinitions[
                            segment
                        ].description,
                    customers:
                        data.customers,
                    revenue:
                        formatMoney(
                            data.revenue
                        ),
                    orders:
                        data.orders,
                    revenueShare:
                        customerRevenue > 0
                            ? Number(
                                (
                                    (
                                        data.revenue /
                                        customerRevenue
                                    ) * 100
                                ).toFixed(2)
                            )
                            : 0
                };
            });

        const segmentedCustomerCount =
            classifiedCustomers.length;

        const segmentationRevenue =
            segmentTotals[
                "VIP / High Value"
            ].revenue +
            segmentTotals["Loyal"].revenue +
            segmentTotals["Regular"].revenue +
            segmentTotals["New"].revenue +
            segmentTotals["At Risk"].revenue +
            segmentTotals["Dormant"].revenue +
            segmentTotals["One-Time"].revenue;

        const customerSegmentationSummary = {
            totalPurchasingCustomers:
                purchasingCustomerCount,
            segmentedCustomers:
                segmentedCustomerCount,
            unclassifiedCustomers:
                Math.max(
                    0,
                    purchasingCustomerCount -
                    segmentedCustomerCount
                ),
            totalSegmentRevenue:
                formatMoney(
                    segmentationRevenue
                ),
            segments:
                customerSegmentation,
            customers:
                classifiedCustomers
        };

        /* ============================================================
           CUSTOMER DASHBOARD RESPONSE
           ============================================================ */

        return res.render(
            "customeroverview",
            {
                businessName:
                    business.business_name,
                scope,
                isBusinessScope:
                    scope === "business",
                isBranchScope:
                    scope === "branch",
                branchId,
                branchName,
                branchLocation,
                branches:
                    branchOptions,
                period:
                    period.key,
                periodStart:
                    period.start,
                periodEnd:
                    period.end,
                overview,
                acquisition,
                retention,
                customerSegmentation:
                    customerSegmentationSummary
            }
        );
    } catch (error) {
        console.error(
            "Customer dashboard error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).send(
            error.statusCode
                ? error.message
                : "Unable to load customer dashboard."
        );
    }
};

module.exports = {
    getDashboard
};