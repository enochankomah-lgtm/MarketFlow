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
                                ) AS purchase_rank
                            FROM sales s
                            WHERE s.business_id = ?
                              AND s.sale_status =
                                  'Completed'
                        ) ranked
                        WHERE ranked.purchase_rank = 1
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
           RFM ANALYSIS
           ============================================================ */

        const rfmToday =
            new Date();

        rfmToday.setHours(
            0,
            0,
            0,
            0
        );

        const rfmCustomers =
            segmentationCustomers.map(customer => {
                const lastPurchase =
                    new Date(
                        customer.lastPurchase
                    );

                lastPurchase.setHours(
                    0,
                    0,
                    0,
                    0
                );

                const recencyDays =
                    Math.max(
                        0,
                        Math.floor(
                            (
                                rfmToday.getTime() -
                                lastPurchase.getTime()
                            ) /
                            86400000
                        )
                    );

                return {
                    customerId:
                        customer.customerId,
                    recencyDays,
                    frequency:
                        customer.totalOrders,
                    monetary:
                        customer.lifetimeRevenue,
                    firstPurchase:
                        customer.firstPurchase,
                    lastPurchase:
                        customer.lastPurchase
                };
            });

        /* ============================================================
           RFM SCORE CALCULATION
           ============================================================ */

        const getRfmScore = (
            value,
            values,
            reverse = false
        ) => {
            if (!values.length) {
                return 0;
            }

            const sortedValues =
                [...values].sort(
                    (a, b) => a - b
                );

            const index =
                sortedValues.findIndex(
                    sortedValue =>
                        sortedValue >= value
                );

            const rank =
                index === -1
                    ? sortedValues.length
                    : index + 1;

            let score =
                Math.ceil(
                    (
                        rank /
                        sortedValues.length
                    ) * 5
                );

            score =
                Math.max(
                    1,
                    Math.min(5, score)
                );

            if (reverse) {
                score =
                    6 - score;
            }

            return score;
        };

        const rfmRecencyValues =
            rfmCustomers.map(
                customer =>
                    customer.recencyDays
            );

        const rfmFrequencyValues =
            rfmCustomers.map(
                customer =>
                    customer.frequency
            );

        const rfmMonetaryValues =
            rfmCustomers.map(
                customer =>
                    customer.monetary
            );

        /* ============================================================
           RFM CLASSIFICATION
           ============================================================ */

        const getRfmSegment = (
            recencyScore,
            frequencyScore,
            monetaryScore
        ) => {
            if (
                recencyScore >= 4 &&
                frequencyScore >= 4 &&
                monetaryScore >= 4
            ) {
                return "Champion";
            }

            if (
                recencyScore >= 3 &&
                frequencyScore >= 3 &&
                monetaryScore >= 3
            ) {
                return "Loyal";
            }

            if (
                recencyScore <= 2 &&
                frequencyScore >= 3
            ) {
                return "At Risk";
            }

            if (
                recencyScore <= 2 &&
                frequencyScore <= 2
            ) {
                return "Dormant";
            }

            return "Other";
        };

        const rfmSegmentOrder = [
            "Champion",
            "Loyal",
            "At Risk",
            "Dormant",
            "Other"
        ];

        const rfmSegmentDefinitions = {
            Champion:
                "Recently active, frequent and high-value customers.",
            Loyal:
                "Consistently active customers with strong purchasing frequency and value.",
            "At Risk":
                "Previously frequent customers whose purchasing activity has declined.",
            Dormant:
                "Customers with low recent activity and low purchasing frequency.",
            Other:
                "Customers who do not meet the defined Champion, Loyal, At Risk or Dormant thresholds."
        };

        const rfmSegmentTotals = {};

        rfmSegmentOrder.forEach(segment => {
            rfmSegmentTotals[segment] = {
                customers: 0,
                revenue: 0,
                orders: 0
            };
        });

        const rfmCustomerDetails =
            rfmCustomers.map(customer => {
                const recencyScore =
                    getRfmScore(
                        customer.recencyDays,
                        rfmRecencyValues,
                        true
                    );

                const frequencyScore =
                    getRfmScore(
                        customer.frequency,
                        rfmFrequencyValues
                    );

                const monetaryScore =
                    getRfmScore(
                        customer.monetary,
                        rfmMonetaryValues
                    );

                const segment =
                    getRfmSegment(
                        recencyScore,
                        frequencyScore,
                        monetaryScore
                    );

                const rfmCode =
                    `${recencyScore}${frequencyScore}${monetaryScore}`;

                const segmentTotal =
                    rfmSegmentTotals[segment];

                segmentTotal.customers += 1;

                segmentTotal.revenue +=
                    customer.monetary;

                segmentTotal.orders +=
                    customer.frequency;

                return {
                    customerId:
                        customer.customerId,
                    recency:
                        customer.recencyDays,
                    frequency:
                        customer.frequency,
                    monetary:
                        formatMoney(
                            customer.monetary
                        ),
                    recencyScore,
                    frequencyScore,
                    monetaryScore,
                    rfmCode,
                    segment,
                    firstPurchase:
                        customer.firstPurchase,
                    lastPurchase:
                        customer.lastPurchase
                };
            });

        /* ============================================================
           RFM SUMMARY
           ============================================================ */

        const rfmTotalCustomers =
            rfmCustomerDetails.length;

        const rfmTotalRevenue =
            rfmCustomerDetails.reduce(
                (total, customer) =>
                    total +
                    Number(
                        customer.monetary || 0
                    ),
                0
            );

        const rfmSegments =
            rfmSegmentOrder.map(segment => {
                const data =
                    rfmSegmentTotals[segment];

                return {
                    segment,
                    description:
                        rfmSegmentDefinitions[
                            segment
                        ],
                    customers:
                        data.customers,
                    revenue:
                        formatMoney(
                            data.revenue
                        ),
                    orders:
                        data.orders,
                    revenueShare:
                        rfmTotalRevenue > 0
                            ? Number(
                                (
                                    (
                                        data.revenue /
                                        rfmTotalRevenue
                                    ) * 100
                                ).toFixed(2)
                            )
                            : 0
                };
            });

        const rfmSummary = {
            totalCustomers:
                rfmTotalCustomers,
            totalRevenue:
                formatMoney(
                    rfmTotalRevenue
                ),
            segments:
                rfmSegments,
            customers:
                rfmCustomerDetails
        };

                /* ============================================================
           CUSTOMER LIFETIME VALUE
           ============================================================ */

        const clvToday =
            new Date();

        clvToday.setHours(
            0,
            0,
            0,
            0
        );

        const calculateLifetimeDays =
            firstPurchase => {
                if (!firstPurchase) {
                    return 0;
                }

                const firstDate =
                    new Date(firstPurchase);

                firstDate.setHours(
                    0,
                    0,
                    0,
                    0
                );

                return Math.max(
                    0,
                    Math.floor(
                        (
                            clvToday.getTime() -
                            firstDate.getTime()
                        ) /
                        86400000
                    )
                );
            };

        const clvCustomers =
            segmentationCustomers.map(
                customer => {
                    const lifetimeDays =
                        calculateLifetimeDays(
                            customer.firstPurchase
                        );

                    const lifetimeRevenue =
                        Number(
                            customer.lifetimeRevenue || 0
                        );

                    const lifetimeOrders =
                        Number(
                            customer.totalOrders || 0
                        );

                    const averageOrderValue =
                        lifetimeOrders > 0
                            ? lifetimeRevenue /
                              lifetimeOrders
                            : 0;

                    return {
                        customerId:
                            customer.customerId,
                        lifetimeRevenue,
                        lifetimeOrders,
                        lifetimeDays,
                        averageOrderValue,
                        firstPurchase:
                            customer.firstPurchase,
                        lastPurchase:
                            customer.lastPurchase
                    };
                }
            );

        /* ============================================================
           CLV DISTRIBUTION
           ============================================================ */

        const clvRevenueValues =
            clvCustomers
                .map(
                    customer =>
                        customer.lifetimeRevenue
                )
                .sort(
                    (a, b) => a - b
                );

        const getMedian =
            values => {
                if (!values.length) {
                    return 0;
                }

                const middle =
                    Math.floor(
                        values.length / 2
                    );

                if (
                    values.length % 2 === 0
                ) {
                    return (
                        values[middle - 1] +
                        values[middle]
                    ) / 2;
                }

                return values[middle];
            };

        const getPercentile =
            (
                values,
                percentile
            ) => {
                if (!values.length) {
                    return 0;
                }

                const index =
                    Math.ceil(
                        values.length *
                        percentile
                    ) - 1;

                return values[
                    Math.max(
                        0,
                        Math.min(
                            index,
                            values.length - 1
                        )
                    )
                ];
            };

        const totalCustomerLifetimeValue =
            clvCustomers.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    customer.lifetimeRevenue,
                0
            );

        const averageCustomerLifetimeValue =
            clvCustomers.length > 0
                ? totalCustomerLifetimeValue /
                  clvCustomers.length
                : 0;

        const medianCustomerLifetimeValue =
            getMedian(
                clvRevenueValues
            );

        const highestCustomerLifetimeValue =
            clvRevenueValues.length > 0
                ? clvRevenueValues[
                    clvRevenueValues.length - 1
                ]
                : 0;

        const clv80thPercentile =
            getPercentile(
                clvRevenueValues,
                0.80
            );

        /* ============================================================
           CLV CUSTOMER CLASSIFICATION
           ============================================================ */

        const clvCustomersWithValue =
            clvCustomers
                .map(customer => ({
                    ...customer,
                    clvTier:
                        customer.lifetimeRevenue >=
                        clv80thPercentile
                            ? "High Value"
                            : "Standard Value"
                }))
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b.lifetimeRevenue -
                        a.lifetimeRevenue
                );

        /* ============================================================
           CLV BY CUSTOMER SEGMENT
           ============================================================ */

        const clvBySegment = {};

        customerSegmentation.forEach(
            segment => {
                clvBySegment[
                    segment.segment
                ] = {
                    segment:
                        segment.segment,
                    customers:
                        segment.customers,
                    lifetimeValue:
                        0,
                    averageClv:
                        0,
                    lifetimeOrders:
                        0
                };
            }
        );

        const segmentByCustomerId =
            new Map(
                classifiedCustomers.map(
                    customer => [
                        customer.customerId,
                        customer.segment
                    ]
                )
            );

        clvCustomersWithValue.forEach(
            customer => {
                const segment =
                    segmentByCustomerId.get(
                        customer.customerId
                    );

                if (
                    !segment ||
                    !clvBySegment[segment]
                ) {
                    return;
                }

                clvBySegment[
                    segment
                ].lifetimeValue +=
                    customer.lifetimeRevenue;

                clvBySegment[
                    segment
                ].lifetimeOrders +=
                    customer.lifetimeOrders;
            }
        );

        const clvSegmentSummary =
            Object.values(
                clvBySegment
            ).map(segment => ({
                segment:
                    segment.segment,
                customers:
                    segment.customers,
                lifetimeValue:
                    formatMoney(
                        segment.lifetimeValue
                    ),
                averageClv:
                    segment.customers > 0
                        ? formatMoney(
                            segment.lifetimeValue /
                            segment.customers
                        )
                        : "0.00",
                lifetimeOrders:
                    segment.lifetimeOrders,
                valueShare:
                    totalCustomerLifetimeValue > 0
                        ? Number(
                            (
                                (
                                    segment.lifetimeValue /
                                    totalCustomerLifetimeValue
                                ) * 100
                            ).toFixed(2)
                        )
                        : 0
            }));

        /* ============================================================
           CLV CUSTOMER DETAILS
           ============================================================ */

        const clvCustomerDetails =
            clvCustomersWithValue.map(
                customer => ({
                    customerId:
                        customer.customerId,
                    lifetimeValue:
                        formatMoney(
                            customer.lifetimeRevenue
                        ),
                    lifetimeOrders:
                        customer.lifetimeOrders,
                    lifetimeDays:
                        customer.lifetimeDays,
                    averageOrderValue:
                        formatMoney(
                            customer.averageOrderValue
                        ),
                    firstPurchase:
                        customer.firstPurchase,
                    lastPurchase:
                        customer.lastPurchase,
                    clvTier:
                        customer.clvTier,
                    segment:
                        segmentByCustomerId.get(
                            customer.customerId
                        ) || "Unclassified"
                })
            );

        /* ============================================================
           CLV SUMMARY
           ============================================================ */

        const customerLifetimeValue = {
            totalCustomers:
                clvCustomers.length,

            totalLifetimeValue:
                formatMoney(
                    totalCustomerLifetimeValue
                ),

            averageClv:
                formatMoney(
                    averageCustomerLifetimeValue
                ),

            medianClv:
                formatMoney(
                    medianCustomerLifetimeValue
                ),

            highestClv:
                formatMoney(
                    highestCustomerLifetimeValue
                ),

            highValueThreshold:
                formatMoney(
                    clv80thPercentile
                ),

            highValueCustomers:
                clvCustomersWithValue.filter(
                    customer =>
                        customer.clvTier ===
                        "High Value"
                ).length,

            standardValueCustomers:
                clvCustomersWithValue.filter(
                    customer =>
                        customer.clvTier ===
                        "Standard Value"
                ).length,

            segments:
                clvSegmentSummary,

            customers:
                clvCustomerDetails
        };

                /* ============================================================
           CUSTOMER PROFITABILITY
           ============================================================ */

        const profitabilitySalesScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const profitabilityItemScope =
            scope === "branch"
                ? `
                    si.business_id = ?
                    AND si.branch_id = ?
                `
                : `
                    si.business_id = ?
                `;

        const profitabilityParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        const [profitabilityCustomerRows] =
            await db.query(
                `
                SELECT
                    s.customer_id,
                    COUNT(DISTINCT s.sale_id)
                        AS total_orders,
                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS total_quantity,
                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,
                    COALESCE(
                        SUM(
                            si.quantity *
                            si.cost_price
                        ),
                        0
                    ) AS cogs,
                    COALESCE(
                        SUM(si.total_price) -
                        SUM(
                            si.quantity *
                            si.cost_price
                        ),
                        0
                    ) AS gross_profit
                FROM sales s
                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id
                   AND ${profitabilityItemScope}
                WHERE ${profitabilitySalesScope}
                  AND s.customer_id IS NOT NULL
                  AND s.sale_status =
                      'Completed'
                GROUP BY
                    s.customer_id
                ORDER BY
                    gross_profit DESC
                `,
                [
                    ...profitabilityParams,
                    ...profitabilityParams
                ]
            );

        /* ============================================================
           CUSTOMER PROFITABILITY DETAILS
           ============================================================ */

        const customerProfitabilityRows =
            profitabilityCustomerRows.map(
                row => {
                    const revenue =
                        Number(
                            row.revenue || 0
                        );

                    const cogs =
                        Number(
                            row.cogs || 0
                        );

                    const grossProfit =
                        Number(
                            row.gross_profit || 0
                        );

                    const totalOrders =
                        Number(
                            row.total_orders || 0
                        );

                    const totalQuantity =
                        Number(
                            row.total_quantity || 0
                        );

                    const grossMargin =
                        revenue > 0
                            ? (
                                grossProfit /
                                revenue
                            ) * 100
                            : 0;

                    const averageOrderValue =
                        totalOrders > 0
                            ? revenue /
                              totalOrders
                            : 0;

                    const profitPerOrder =
                        totalOrders > 0
                            ? grossProfit /
                              totalOrders
                            : 0;

                    return {
                        customerId:
                            Number(
                                row.customer_id
                            ),
                        totalOrders,
                        totalQuantity,
                        revenue,
                        cogs,
                        grossProfit,
                        grossMargin,
                        averageOrderValue,
                        profitPerOrder
                    };
                }
            );

        /* ============================================================
           PROFITABILITY SUMMARY
           ============================================================ */

        const profitabilityRevenue =
            customerProfitabilityRows.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    customer.revenue,
                0
            );

        const profitabilityCogs =
            customerProfitabilityRows.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    customer.cogs,
                0
            );

        const profitabilityGrossProfit =
            customerProfitabilityRows.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    customer.grossProfit,
                0
            );

        const profitabilityOrders =
            customerProfitabilityRows.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    customer.totalOrders,
                0
            );

        const profitabilityQuantity =
            customerProfitabilityRows.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    customer.totalQuantity,
                0
            );

        const profitabilityGrossMargin =
            profitabilityRevenue > 0
                ? (
                    profitabilityGrossProfit /
                    profitabilityRevenue
                ) * 100
                : 0;

        const profitabilityAverageOrderValue =
            profitabilityOrders > 0
                ? profitabilityRevenue /
                  profitabilityOrders
                : 0;

        const profitabilityAverageProfitPerCustomer =
            customerProfitabilityRows.length > 0
                ? profitabilityGrossProfit /
                  customerProfitabilityRows.length
                : 0;

        const profitabilityAverageProfitPerOrder =
            profitabilityOrders > 0
                ? profitabilityGrossProfit /
                  profitabilityOrders
                : 0;

        /* ============================================================
           CUSTOMER PROFITABILITY RANKING
           ============================================================ */

        const profitabilityCustomerDetails =
            customerProfitabilityRows
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b.grossProfit -
                        a.grossProfit
                )
                .map(
                    customer => {
                        const segment =
                            segmentByCustomerId.get(
                                customer.customerId
                            ) ||
                            "Unclassified";

                        return {
                            customerId:
                                customer.customerId,
                            revenue:
                                formatMoney(
                                    customer.revenue
                                ),
                            cogs:
                                formatMoney(
                                    customer.cogs
                                ),
                            grossProfit:
                                formatMoney(
                                    customer.grossProfit
                                ),
                            grossMargin:
                                Number(
                                    customer
                                        .grossMargin
                                        .toFixed(2)
                                ),
                            totalOrders:
                                customer.totalOrders,
                            totalQuantity:
                                Number(
                                    customer
                                        .totalQuantity
                                        .toFixed(3)
                                ),
                            averageOrderValue:
                                formatMoney(
                                    customer
                                        .averageOrderValue
                                ),
                            profitPerOrder:
                                formatMoney(
                                    customer
                                        .profitPerOrder
                                ),
                            segment
                        };
                    }
                );

        /* ============================================================
           PROFITABILITY BY CUSTOMER SEGMENT
           ============================================================ */

        const profitabilityBySegment = {};

        segmentOrder.forEach(
            segment => {
                profitabilityBySegment[
                    segment
                ] = {
                    segment,
                    customers: 0,
                    revenue: 0,
                    cogs: 0,
                    grossProfit: 0,
                    orders: 0,
                    quantity: 0
                };
            }
        );

        customerProfitabilityRows.forEach(
            customer => {
                const segment =
                    segmentByCustomerId.get(
                        customer.customerId
                    );

                if (
                    !segment ||
                    !profitabilityBySegment[
                        segment
                    ]
                ) {
                    return;
                }

                const data =
                    profitabilityBySegment[
                        segment
                    ];

                data.customers += 1;
                data.revenue +=
                    customer.revenue;
                data.cogs +=
                    customer.cogs;
                data.grossProfit +=
                    customer.grossProfit;
                data.orders +=
                    customer.totalOrders;
                data.quantity +=
                    customer.totalQuantity;
            }
        );

        const profitabilitySegmentSummary =
            segmentOrder.map(
                segment => {
                    const data =
                        profitabilityBySegment[
                            segment
                        ];

                    const margin =
                        data.revenue > 0
                            ? (
                                data.grossProfit /
                                data.revenue
                            ) * 100
                            : 0;

                    return {
                        segment:
                            data.segment,
                        customers:
                            data.customers,
                        revenue:
                            formatMoney(
                                data.revenue
                            ),
                        cogs:
                            formatMoney(
                                data.cogs
                            ),
                        grossProfit:
                            formatMoney(
                                data.grossProfit
                            ),
                        grossMargin:
                            Number(
                                margin.toFixed(2)
                            ),
                        orders:
                            data.orders,
                        quantity:
                            Number(
                                data.quantity
                                    .toFixed(3)
                            )
                    };
                }
            );

        /* ============================================================
           CUSTOMER PROFITABILITY RESPONSE
           ============================================================ */

        const customerProfitability = {
            totalCustomers:
                customerProfitabilityRows.length,

            revenue:
                formatMoney(
                    profitabilityRevenue
                ),

            cogs:
                formatMoney(
                    profitabilityCogs
                ),

            grossProfit:
                formatMoney(
                    profitabilityGrossProfit
                ),

            grossMargin:
                Number(
                    profitabilityGrossMargin
                        .toFixed(2)
                ),

            totalOrders:
                profitabilityOrders,

            totalQuantity:
                Number(
                    profitabilityQuantity
                        .toFixed(3)
                ),

            averageOrderValue:
                formatMoney(
                    profitabilityAverageOrderValue
                ),

            averageProfitPerCustomer:
                formatMoney(
                    profitabilityAverageProfitPerCustomer
                ),

            averageProfitPerOrder:
                formatMoney(
                    profitabilityAverageProfitPerOrder
                ),

            bySegment:
                profitabilitySegmentSummary,

            customers:
                profitabilityCustomerDetails
        };

                /* ============================================================
           CUSTOMER PURCHASING BEHAVIOR
           ============================================================ */

        const purchasingSalesScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const purchasingItemScope =
            scope === "branch"
                ? `
                    si.business_id = ?
                    AND si.branch_id = ?
                `
                : `
                    si.business_id = ?
                `;

        const purchasingParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        /* ============================================================
           CUSTOMER PURCHASING SUMMARY
           ============================================================ */

        const [purchasingSummaryRows] =
            await db.query(
                `
                SELECT
                    COUNT(DISTINCT s.customer_id)
                        AS purchasing_customers,
                    COUNT(DISTINCT s.sale_id)
                        AS total_transactions,
                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS total_quantity,
                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue
                FROM sales s
                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id
                   AND ${purchasingItemScope}
                WHERE ${purchasingSalesScope}
                  AND s.customer_id IS NOT NULL
                  AND s.sale_status =
                      'Completed'
                  AND s.created_at >= ?
                  AND s.created_at < ?
                `,
                [
                    ...purchasingParams,
                    ...purchasingParams,
                    period.start ||
                        "1000-01-01",
                    period.end ||
                        "9999-12-31"
                ]
            );

        const purchasingSummary =
            purchasingSummaryRows[0] || {};

        const purchasingCustomers =
            Number(
                purchasingSummary
                    .purchasing_customers || 0
            );

        const purchasingTransactions =
            Number(
                purchasingSummary
                    .total_transactions || 0
            );

        const purchasingQuantity =
            Number(
                purchasingSummary
                    .total_quantity || 0
            );

        const purchasingRevenue =
            Number(
                purchasingSummary
                    .revenue || 0
            );

        const averageTransactionValue =
            purchasingTransactions > 0
                ? purchasingRevenue /
                  purchasingTransactions
                : 0;

        const averageBasketQuantity =
            purchasingTransactions > 0
                ? purchasingQuantity /
                  purchasingTransactions
                : 0;

        const averageTransactionsPerCustomer =
            purchasingCustomers > 0
                ? purchasingTransactions /
                  purchasingCustomers
                : 0;

        /* ============================================================
           CUSTOMER PURCHASE FREQUENCY
           ============================================================ */

        const [purchasingCustomerRows] =
            await db.query(
                `
                SELECT
                    s.customer_id,
                    COUNT(DISTINCT s.sale_id)
                        AS transactions,
                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS quantity,
                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,
                    MIN(s.created_at)
                        AS first_purchase_in_period,
                    MAX(s.created_at)
                        AS last_purchase_in_period
                FROM sales s
                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id
                   AND ${purchasingItemScope}
                WHERE ${purchasingSalesScope}
                  AND s.customer_id IS NOT NULL
                  AND s.sale_status =
                      'Completed'
                  AND s.created_at >= ?
                  AND s.created_at < ?
                GROUP BY
                    s.customer_id
                ORDER BY
                    revenue DESC
                `,
                [
                    ...purchasingParams,
                    ...purchasingParams,
                    period.start ||
                        "1000-01-01",
                    period.end ||
                        "9999-12-31"
                ]
            );

        const purchasingCustomerDetails =
            purchasingCustomerRows.map(
                row => ({
                    customerId:
                        Number(
                            row.customer_id
                        ),
                    transactions:
                        Number(
                            row.transactions || 0
                        ),
                    quantity:
                        Number(
                            row.quantity || 0
                        ),
                    revenue:
                        Number(
                            row.revenue || 0
                        ),
                    firstPurchaseInPeriod:
                        row.first_purchase_in_period,
                    lastPurchaseInPeriod:
                        row.last_purchase_in_period,
                    averageTransactionValue:
                        Number(
                            row.transactions || 0
                        ) > 0
                            ? Number(
                                row.revenue || 0
                            ) /
                            Number(
                                row.transactions || 0
                            )
                            : 0,
                    averageBasketQuantity:
                        Number(
                            row.transactions || 0
                        ) > 0
                            ? Number(
                                row.quantity || 0
                            ) /
                            Number(
                                row.transactions || 0
                            )
                            : 0
                })
            );

        /* ============================================================
           CUSTOMER LIFETIME FIRST / LAST PURCHASE
           ============================================================ */

        const [purchaseTimelineRows] =
            await db.query(
                `
                SELECT
                    s.customer_id,
                    MIN(s.created_at)
                        AS first_purchase,
                    MAX(s.created_at)
                        AS last_purchase
                FROM sales s
                WHERE ${purchasingSalesScope}
                  AND s.customer_id IS NOT NULL
                  AND s.sale_status =
                      'Completed'
                GROUP BY
                    s.customer_id
                `,
                [
                    ...purchasingParams
                ]
            );

        const purchaseTimeline =
            new Map(
                purchaseTimelineRows.map(
                    row => [
                        Number(
                            row.customer_id
                        ),
                        {
                            firstPurchase:
                                row.first_purchase,
                            lastPurchase:
                                row.last_purchase
                        }
                    ]
                )
            );

        purchasingCustomerDetails.forEach(
            customer => {
                const timeline =
                    purchaseTimeline.get(
                        customer.customerId
                    );

                customer.firstPurchase =
                    timeline?.firstPurchase ||
                    null;

                customer.lastPurchase =
                    timeline?.lastPurchase ||
                    null;
            }
        );

        /* ============================================================
           PRODUCT PURCHASING BEHAVIOR
           ============================================================ */

        const [purchasingProductRows] =
            await db.query(
                `
                SELECT
                    si.product_id,
                    si.product_name,
                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS quantity,
                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,
                    COUNT(
                        DISTINCT si.sale_id
                    ) AS transactions,
                    COUNT(
                        DISTINCT s.customer_id
                    ) AS customers
                FROM sales_item si
                INNER JOIN sales s
                    ON s.sale_id =
                       si.sale_id
                   AND s.business_id =
                       si.business_id
                WHERE ${purchasingItemScope}
                  AND ${purchasingSalesScope}
                  AND s.customer_id IS NOT NULL
                  AND s.sale_status =
                      'Completed'
                  AND s.created_at >= ?
                  AND s.created_at < ?
                GROUP BY
                    si.product_id,
                    si.product_name
                ORDER BY
                    quantity DESC,
                    revenue DESC
                LIMIT 50
                `,
                [
                    ...purchasingParams,
                    ...purchasingParams,
                    period.start ||
                        "1000-01-01",
                    period.end ||
                        "9999-12-31"
                ]
            );

        const purchasingProducts =
            purchasingProductRows.map(
                row => ({
                    productId:
                        Number(
                            row.product_id
                        ),
                    productName:
                        row.product_name,
                    quantity:
                        Number(
                            row.quantity || 0
                        ),
                    revenue:
                        Number(
                            row.revenue || 0
                        ),
                    transactions:
                        Number(
                            row.transactions || 0
                        ),
                    customers:
                        Number(
                            row.customers || 0
                        )
                })
            );

        /* ============================================================
           CATEGORY PURCHASING BEHAVIOR
           ============================================================ */

        const [purchasingCategoryRows] =
            await db.query(
                `
                SELECT
                    COALESCE(
                        NULLIF(
                            TRIM(p.category),
                            ''
                        ),
                        'Uncategorized'
                    ) AS category,
                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS quantity,
                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,
                    COUNT(
                        DISTINCT si.sale_id
                    ) AS transactions,
                    COUNT(
                        DISTINCT s.customer_id
                    ) AS customers,
                    COUNT(
                        DISTINCT si.product_id
                    ) AS products
                FROM sales_item si
                INNER JOIN sales s
                    ON s.sale_id =
                       si.sale_id
                   AND s.business_id =
                       si.business_id
                LEFT JOIN products p
                    ON p.product_id =
                       si.product_id
                   AND p.business_id =
                       si.business_id
                WHERE ${purchasingItemScope}
                  AND ${purchasingSalesScope}
                  AND s.customer_id IS NOT NULL
                  AND s.sale_status =
                      'Completed'
                  AND s.created_at >= ?
                  AND s.created_at < ?
                GROUP BY
                    COALESCE(
                        NULLIF(
                            TRIM(p.category),
                            ''
                        ),
                        'Uncategorized'
                    )
                ORDER BY
                    revenue DESC,
                    quantity DESC
                `,
                [
                    ...purchasingParams,
                    ...purchasingParams,
                    period.start ||
                        "1000-01-01",
                    period.end ||
                        "9999-12-31"
                ]
            );

        const purchasingCategories =
            purchasingCategoryRows.map(
                row => ({
                    category:
                        row.category,
                    quantity:
                        Number(
                            row.quantity || 0
                        ),
                    revenue:
                        Number(
                            row.revenue || 0
                        ),
                    transactions:
                        Number(
                            row.transactions || 0
                        ),
                    customers:
                        Number(
                            row.customers || 0
                        ),
                    products:
                        Number(
                            row.products || 0
                        ),
                    revenueShare:
                        purchasingRevenue > 0
                            ? Number(
                                (
                                    (
                                        Number(
                                            row.revenue || 0
                                        ) /
                                        purchasingRevenue
                                    ) * 100
                                ).toFixed(2)
                            )
                            : 0
                })
            );

        /* ============================================================
           CUSTOMER PREFERRED PRODUCTS
           ============================================================ */

        const [customerProductRows] =
            await db.query(
                `
                SELECT
                    s.customer_id,
                    si.product_id,
                    si.product_name,
                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS quantity,
                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,
                    COUNT(
                        DISTINCT si.sale_id
                    ) AS transactions
                FROM sales s
                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id
                   AND ${purchasingItemScope}
                WHERE ${purchasingSalesScope}
                  AND s.customer_id IS NOT NULL
                  AND s.sale_status =
                      'Completed'
                  AND s.created_at >= ?
                  AND s.created_at < ?
                GROUP BY
                    s.customer_id,
                    si.product_id,
                    si.product_name
                ORDER BY
                    s.customer_id ASC,
                    quantity DESC,
                    revenue DESC
                `,
                [
                    ...purchasingParams,
                    ...purchasingParams,
                    period.start ||
                        "1000-01-01",
                    period.end ||
                        "9999-12-31"
                ]
            );

        const preferredProductByCustomer =
            new Map();

        customerProductRows.forEach(
            row => {
                const customerId =
                    Number(
                        row.customer_id
                    );

                if (
                    !preferredProductByCustomer.has(
                        customerId
                    )
                ) {
                    preferredProductByCustomer.set(
                        customerId,
                        {
                            productId:
                                Number(
                                    row.product_id
                                ),
                            productName:
                                row.product_name,
                            quantity:
                                Number(
                                    row.quantity || 0
                                ),
                            revenue:
                                Number(
                                    row.revenue || 0
                                ),
                            transactions:
                                Number(
                                    row.transactions || 0
                                )
                        }
                    );
                }
            }
        );

        /* ============================================================
           CUSTOMER PURCHASING RESPONSE
           ============================================================ */

        const purchasingCustomersDetails =
            purchasingCustomerDetails.map(
                customer => {
                    const preferredProduct =
                        preferredProductByCustomer.get(
                            customer.customerId
                        );

                    return {
                        customerId:
                            customer.customerId,
                        transactions:
                            customer.transactions,
                        quantity:
                            Number(
                                customer.quantity
                                    .toFixed(3)
                            ),
                        revenue:
                            formatMoney(
                                customer.revenue
                            ),
                        averageTransactionValue:
                            formatMoney(
                                customer
                                    .averageTransactionValue
                            ),
                        averageBasketQuantity:
                            Number(
                                customer
                                    .averageBasketQuantity
                                    .toFixed(3)
                            ),
                        firstPurchase:
                            customer.firstPurchase,
                        lastPurchase:
                            customer.lastPurchase,
                        firstPurchaseInPeriod:
                            customer.firstPurchaseInPeriod,
                        lastPurchaseInPeriod:
                            customer.lastPurchaseInPeriod,
                        preferredProduct:
                            preferredProduct || null
                    };
                }
            );

        const customerPurchasingBehavior = {
            purchasingCustomers,
            totalTransactions:
                purchasingTransactions,
            totalQuantity:
                Number(
                    purchasingQuantity.toFixed(3)
                ),
            revenue:
                formatMoney(
                    purchasingRevenue
                ),
            averageTransactionValue:
                formatMoney(
                    averageTransactionValue
                ),
            averageBasketQuantity:
                Number(
                    averageBasketQuantity.toFixed(3)
                ),
            averageTransactionsPerCustomer:
                Number(
                    averageTransactionsPerCustomer
                        .toFixed(2)
                ),
            products:
                purchasingProducts.map(
                    product => ({
                        productId:
                            product.productId,
                        productName:
                            product.productName,
                        quantity:
                            Number(
                                product.quantity
                                    .toFixed(3)
                            ),
                        revenue:
                            formatMoney(
                                product.revenue
                            ),
                        transactions:
                            product.transactions,
                        customers:
                            product.customers
                    })
                ),
            categories:
                purchasingCategories.map(
                    category => ({
                        category:
                            category.category,
                        quantity:
                            Number(
                                category.quantity
                                    .toFixed(3)
                            ),
                        revenue:
                            formatMoney(
                                category.revenue
                            ),
                        transactions:
                            category.transactions,
                        customers:
                            category.customers,
                        products:
                            category.products,
                        revenueShare:
                            category.revenueShare
                    })
                ),
            customers:
                purchasingCustomersDetails
        };

                /* ============================================================
           CUSTOMER CONCENTRATION
           ============================================================ */

        const concentrationSalesScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const concentrationParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        /* ============================================================
           CURRENT CUSTOMER CONCENTRATION
           ============================================================ */

        const concentrationCustomers =
            purchasingCustomerDetails
                .map(customer => ({
                    customerId:
                        customer.customerId,
                    revenue:
                        Number(
                            customer.revenue || 0
                        ),
                    transactions:
                        Number(
                            customer.transactions || 0
                        )
                }))
                .sort(
                    (a, b) =>
                        b.revenue -
                        a.revenue
                );

        const concentrationTotalRevenue =
            concentrationCustomers.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    customer.revenue,
                0
            );

        const calculateConcentration =
            limit => {
                const topCustomers =
                    concentrationCustomers
                        .slice(0, limit);

                const revenue =
                    topCustomers.reduce(
                        (
                            total,
                            customer
                        ) =>
                            total +
                            customer.revenue,
                        0
                    );

                const percentage =
                    concentrationTotalRevenue > 0
                        ? (
                            revenue /
                            concentrationTotalRevenue
                        ) * 100
                        : 0;

                return {
                    customers:
                        topCustomers.length,
                    revenue,
                    percentage:
                        Number(
                            percentage.toFixed(2)
                        )
                };
            };

        const top5Concentration =
            calculateConcentration(5);

        const top10Concentration =
            calculateConcentration(10);

        const top20Concentration =
            calculateConcentration(20);

        /* ============================================================
           TOP CUSTOMER RANKING
           ============================================================ */

        const topConcentrationCustomers =
            concentrationCustomers
                .slice(0, 20)
                .map(
                    (
                        customer,
                        index
                    ) => ({
                        rank:
                            index + 1,
                        customerId:
                            customer.customerId,
                        revenue:
                            formatMoney(
                                customer.revenue
                            ),
                        transactions:
                            customer.transactions,
                        revenueShare:
                            concentrationTotalRevenue > 0
                                ? Number(
                                    (
                                        (
                                            customer.revenue /
                                            concentrationTotalRevenue
                                        ) * 100
                                    ).toFixed(2)
                                )
                                : 0
                    })
                );

        /* ============================================================
           CONCENTRATION TREND
           ============================================================ */

        const concentrationTrendPeriod =
            period.key === "all"
                ? "month"
                : getAcquisitionTrendPeriod(
                    period.key
                );

        let concentrationTrendRows = [];

        if (period.key === "all") {
            [concentrationTrendRows] =
                await db.query(
                    `
                    WITH customer_period_revenue AS (
                        SELECT
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-01'
                            ) AS period_start,
                            s.customer_id,
                            COALESCE(
                                SUM(si.total_price),
                                0
                            ) AS revenue
                        FROM sales s
                        INNER JOIN sales_item si
                            ON si.sale_id =
                               s.sale_id
                           AND si.business_id =
                               s.business_id
                           AND (
                               ? = 'business'
                               OR si.branch_id = ?
                           )
                        WHERE s.business_id = ?
                          AND (
                              ? = 'business'
                              OR s.branch_id = ?
                          )
                          AND s.customer_id IS NOT NULL
                          AND s.sale_status =
                              'Completed'
                        GROUP BY
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-01'
                            ),
                            s.customer_id
                    ),
                    ranked_customers AS (
                        SELECT
                            period_start,
                            customer_id,
                            revenue,
                            SUM(revenue) OVER (
                                PARTITION BY
                                    period_start
                            ) AS total_revenue,
                            ROW_NUMBER() OVER (
                                PARTITION BY
                                    period_start
                                ORDER BY
                                    revenue DESC,
                                    customer_id ASC
                            ) AS customer_rank
                        FROM customer_period_revenue
                    )
                    SELECT
                        period_start,
                        MAX(total_revenue)
                            AS total_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 5
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top5_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 10
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top10_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 20
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top20_revenue
                    FROM ranked_customers
                    GROUP BY
                        period_start
                    ORDER BY
                        period_start ASC
                    `,
                    [
                        scope,
                        branchId,
                        businessId,
                        scope,
                        branchId
                    ]
                );
        } else if (
            concentrationTrendPeriod === "day"
        ) {
            [concentrationTrendRows] =
                await db.query(
                    `
                    WITH customer_period_revenue AS (
                        SELECT
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-%d'
                            ) AS period_start,
                            s.customer_id,
                            COALESCE(
                                SUM(si.total_price),
                                0
                            ) AS revenue
                        FROM sales s
                        INNER JOIN sales_item si
                            ON si.sale_id =
                               s.sale_id
                           AND si.business_id =
                               s.business_id
                           AND (
                               ? = 'business'
                               OR si.branch_id = ?
                           )
                        WHERE s.business_id = ?
                          AND (
                              ? = 'business'
                              OR s.branch_id = ?
                          )
                          AND s.customer_id IS NOT NULL
                          AND s.sale_status =
                              'Completed'
                          AND s.created_at >= ?
                          AND s.created_at < ?
                        GROUP BY
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-%d'
                            ),
                            s.customer_id
                    ),
                    ranked_customers AS (
                        SELECT
                            period_start,
                            customer_id,
                            revenue,
                            SUM(revenue) OVER (
                                PARTITION BY
                                    period_start
                            ) AS total_revenue,
                            ROW_NUMBER() OVER (
                                PARTITION BY
                                    period_start
                                ORDER BY
                                    revenue DESC,
                                    customer_id ASC
                            ) AS customer_rank
                        FROM customer_period_revenue
                    )
                    SELECT
                        period_start,
                        MAX(total_revenue)
                            AS total_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 5
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top5_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 10
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top10_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 20
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top20_revenue
                    FROM ranked_customers
                    GROUP BY
                        period_start
                    ORDER BY
                        period_start ASC
                    `,
                    [
                        scope,
                        branchId,
                        businessId,
                        scope,
                        branchId,
                        period.start,
                        period.end
                    ]
                );
        } else {
            [concentrationTrendRows] =
                await db.query(
                    `
                    WITH customer_period_revenue AS (
                        SELECT
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-01'
                            ) AS period_start,
                            s.customer_id,
                            COALESCE(
                                SUM(si.total_price),
                                0
                            ) AS revenue
                        FROM sales s
                        INNER JOIN sales_item si
                            ON si.sale_id =
                               s.sale_id
                           AND si.business_id =
                               s.business_id
                           AND (
                               ? = 'business'
                               OR si.branch_id = ?
                           )
                        WHERE s.business_id = ?
                          AND (
                              ? = 'business'
                              OR s.branch_id = ?
                          )
                          AND s.customer_id IS NOT NULL
                          AND s.sale_status =
                              'Completed'
                          AND s.created_at >= ?
                          AND s.created_at < ?
                        GROUP BY
                            DATE_FORMAT(
                                s.created_at,
                                '%Y-%m-01'
                            ),
                            s.customer_id
                    ),
                    ranked_customers AS (
                        SELECT
                            period_start,
                            customer_id,
                            revenue,
                            SUM(revenue) OVER (
                                PARTITION BY
                                    period_start
                            ) AS total_revenue,
                            ROW_NUMBER() OVER (
                                PARTITION BY
                                    period_start
                                ORDER BY
                                    revenue DESC,
                                    customer_id ASC
                            ) AS customer_rank
                        FROM customer_period_revenue
                    )
                    SELECT
                        period_start,
                        MAX(total_revenue)
                            AS total_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 5
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top5_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 10
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top10_revenue,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN customer_rank <= 20
                                    THEN revenue
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS top20_revenue
                    FROM ranked_customers
                    GROUP BY
                        period_start
                    ORDER BY
                        period_start ASC
                    `,
                    [
                        scope,
                        branchId,
                        businessId,
                        scope,
                        branchId,
                        period.start,
                        period.end
                    ]
                );
        }

        const concentrationTrend =
            concentrationTrendRows.map(
                row => {
                    const totalRevenue =
                        Number(
                            row.total_revenue || 0
                        );

                    const top5Revenue =
                        Number(
                            row.top5_revenue || 0
                        );

                    const top10Revenue =
                        Number(
                            row.top10_revenue || 0
                        );

                    const top20Revenue =
                        Number(
                            row.top20_revenue || 0
                        );

                    return {
                        period:
                            row.period_start,
                        revenue:
                            formatMoney(
                                totalRevenue
                            ),
                        top5Revenue:
                            formatMoney(
                                top5Revenue
                            ),
                        top10Revenue:
                            formatMoney(
                                top10Revenue
                            ),
                        top20Revenue:
                            formatMoney(
                                top20Revenue
                            ),
                        top5Percentage:
                            totalRevenue > 0
                                ? Number(
                                    (
                                        (
                                            top5Revenue /
                                            totalRevenue
                                        ) * 100
                                    ).toFixed(2)
                                )
                                : 0,
                        top10Percentage:
                            totalRevenue > 0
                                ? Number(
                                    (
                                        (
                                            top10Revenue /
                                            totalRevenue
                                        ) * 100
                                    ).toFixed(2)
                                )
                                : 0,
                        top20Percentage:
                            totalRevenue > 0
                                ? Number(
                                    (
                                        (
                                            top20Revenue /
                                            totalRevenue
                                        ) * 100
                                    ).toFixed(2)
                                )
                                : 0
                    };
                }
            );

        /* ============================================================
           CONCENTRATION DIRECTION
           ============================================================ */

        let customerConcentrationDirection = "→";

        if (
            concentrationTrend.length >= 2
        ) {
            const current =
                Number(
                    concentrationTrend[
                        concentrationTrend.length - 1
                    ].top10Percentage || 0
                );

            const previous =
                Number(
                    concentrationTrend[
                        concentrationTrend.length - 2
                    ].top10Percentage || 0
                );

            const difference =
                current - previous;

            if (difference > 0.5) {
                customerConcentrationDirection = "↑";
            } else if (difference < -0.5) {
                customerConcentrationDirection = "↓";
            }
        }

        /* ============================================================
           CUSTOMER CONCENTRATION RESPONSE
           ============================================================ */

        const customerConcentration = {
            totalCustomers:
                concentrationCustomers.length,

            totalRevenue:
                formatMoney(
                    concentrationTotalRevenue
                ),

            top5: {
                customers:
                    top5Concentration.customers,
                revenue:
                    formatMoney(
                        top5Concentration.revenue
                    ),
                percentage:
                    top5Concentration.percentage
            },

            top10: {
                customers:
                    top10Concentration.customers,
                revenue:
                    formatMoney(
                        top10Concentration.revenue
                    ),
                percentage:
                    top10Concentration.percentage
            },

            top20: {
                customers:
                    top20Concentration.customers,
                revenue:
                    formatMoney(
                        top20Concentration.revenue
                    ),
                percentage:
                    top20Concentration.percentage
            },

            concentrationDirection:
                customerConcentrationDirection,

            trend:
                concentrationTrend,

            customers:
                topConcentrationCustomers
        };


                /* ============================================================
           CUSTOMER GEOGRAPHIC ANALYSIS
           ============================================================ */

        const geographicSalesScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const geographicSalesParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        /* ============================================================
           CUSTOMERS BY CITY
           ============================================================ */

        const geographicCustomerScope =
            scope === "branch"
                ? `
                    c.business_id = ?
                    AND c.branch_id = ?
                `
                : `
                    c.business_id = ?
                `;

        const geographicCustomerParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        const [
            geographicCustomerRows
        ] = await db.query(
            `
            SELECT
                COALESCE(
                    NULLIF(
                        TRIM(c.city),
                        ''
                    ),
                    'Unknown'
                ) AS city,
                COUNT(*) AS customer_count
            FROM customers c
            WHERE
                ${geographicCustomerScope}
            GROUP BY
                COALESCE(
                    NULLIF(
                        TRIM(c.city),
                        ''
                    ),
                    'Unknown'
                )
            ORDER BY
                customer_count DESC,
                city ASC
            `,
            geographicCustomerParams
        );

        /* ============================================================
           CITY REVENUE AND SPENDING
           ============================================================ */

        const [
            geographicRevenueRows
        ] = await db.query(
            `
            SELECT
                COALESCE(
                    NULLIF(
                        TRIM(c.city),
                        ''
                    ),
                    'Unknown'
                ) AS city,
                COUNT(
                    DISTINCT s.customer_id
                ) AS purchasing_customers,
                COUNT(
                    DISTINCT s.sale_id
                ) AS transactions,
                COALESCE(
                    SUM(si.total_price),
                    0
                ) AS revenue,
                COALESCE(
                    SUM(
                        si.quantity *
                        si.cost_price
                    ),
                    0
                ) AS cost,
                COALESCE(
                    SUM(si.total_price),
                    0
                ) -
                COALESCE(
                    SUM(
                        si.quantity *
                        si.cost_price
                    ),
                    0
                ) AS gross_profit,
                COALESCE(
                    SUM(si.quantity),
                    0
                ) AS quantity
            FROM sales s
            INNER JOIN customers c
                ON c.customer_id =
                   s.customer_id
               AND c.business_id =
                   s.business_id
            INNER JOIN sales_item si
                ON si.sale_id =
                   s.sale_id
               AND si.business_id =
                   s.business_id
            WHERE
                ${geographicSalesScope}
                AND s.customer_id IS NOT NULL
                AND s.sale_status =
                    'Completed'
                AND (
                    ${scope === "branch"
                        ? "si.branch_id = ?"
                        : "1 = 1"}
                )
                AND (
                    ? IS NULL
                    OR s.created_at >= ?
                )
                AND (
                    ? IS NULL
                    OR s.created_at < ?
                )
            GROUP BY
                COALESCE(
                    NULLIF(
                        TRIM(c.city),
                        ''
                    ),
                    'Unknown'
                )
            ORDER BY
                revenue DESC,
                city ASC
            `,
            scope === "branch"
                ? [
                    ...geographicSalesParams,
                    branchId,
                    period.start,
                    period.start,
                    period.end,
                    period.end
                ]
                : [
                    ...geographicSalesParams,
                    period.start,
                    period.start,
                    period.end,
                    period.end
                ]
        );

        /* ============================================================
           HIGH-VALUE LOCATIONS
           ============================================================ */

        const geographicRevenueByCity =
            geographicRevenueRows.map(
                row => ({
                    city:
                        row.city,

                    purchasingCustomers:
                        Number(
                            row.purchasing_customers ||
                            0
                        ),

                    transactions:
                        Number(
                            row.transactions ||
                            0
                        ),

                    revenue:
                        Number(
                            row.revenue ||
                            0
                        ),

                    cost:
                        Number(
                            row.cost ||
                            0
                        ),

                    grossProfit:
                        Number(
                            row.gross_profit ||
                            0
                        ),

                    quantity:
                        Number(
                            row.quantity ||
                            0
                        )
                })
            );

        const geographicTotalRevenue =
            geographicRevenueByCity.reduce(
                (
                    total,
                    city
                ) =>
                    total +
                    city.revenue,
                0
            );

        const geographicTotalCustomers =
            geographicCustomerRows.reduce(
                (
                    total,
                    city
                ) =>
                    total +
                    Number(
                        city.customer_count ||
                        0
                    ),
                0
            );

        const geographicCities =
            geographicCustomerRows.map(
                row => {
                    const revenueRow =
                        geographicRevenueByCity.find(
                            city =>
                                city.city ===
                                row.city
                        );

                    const customerCount =
                        Number(
                            row.customer_count ||
                            0
                        );

                    const revenue =
                        revenueRow
                            ? revenueRow.revenue
                            : 0;

                    const transactions =
                        revenueRow
                            ? revenueRow.transactions
                            : 0;

                    const grossProfit =
                        revenueRow
                            ? revenueRow.grossProfit
                            : 0;

                    const quantity =
                        revenueRow
                            ? revenueRow.quantity
                            : 0;

                    return {
                        city:
                            row.city,

                        customers:
                            customerCount,

                        purchasingCustomers:
                            revenueRow
                                ? revenueRow.purchasingCustomers
                                : 0,

                        transactions,

                        revenue:
                            formatMoney(
                                revenue
                            ),

                        grossProfit:
                            formatMoney(
                                grossProfit
                            ),

                        quantity,

                        averageSpend:
                            customerCount > 0
                                ? formatMoney(
                                    revenue /
                                    customerCount
                                )
                                : "0.00",

                        revenueShare:
                            geographicTotalRevenue > 0
                                ? Number(
                                    (
                                        (
                                            revenue /
                                            geographicTotalRevenue
                                        ) * 100
                                    ).toFixed(2)
                                )
                                : 0,

                        customerShare:
                            geographicTotalCustomers > 0
                                ? Number(
                                    (
                                        (
                                            customerCount /
                                            geographicTotalCustomers
                                        ) * 100
                                    ).toFixed(2)
                                )
                                : 0
                    };
                }
            );

        const highValueLocations =
            [...geographicCities]
                .sort(
                    (a, b) =>
                        Number(
                            b.revenue
                        ) -
                        Number(
                            a.revenue
                        )
                )
                .slice(0, 10);

        /* ============================================================
           GEOGRAPHIC SUMMARY
           ============================================================ */

        const geographicTopCity =
            geographicCities.length > 0
                ? [...geographicCities]
                    .sort(
                        (a, b) =>
                            Number(
                                b.revenue
                            ) -
                            Number(
                                a.revenue
                            )
                    )[0]
                : null;

        const geographicTopCustomerCity =
            geographicCities.length > 0
                ? [...geographicCities]
                    .sort(
                        (a, b) =>
                            b.customers -
                            a.customers
                    )[0]
                : null;

        const customerGeographicAnalysis = {
            totalCities:
                geographicCities.length,

            totalCustomers:
                geographicTotalCustomers,

            totalRevenue:
                formatMoney(
                    geographicTotalRevenue
                ),

            topRevenueCity:
                geographicTopCity
                    ? geographicTopCity.city
                    : null,

            topRevenueCityRevenue:
                geographicTopCity
                    ? geographicTopCity.revenue
                    : "0.00",

            topCustomerCity:
                geographicTopCustomerCity
                    ? geographicTopCustomerCity.city
                    : null,

            topCustomerCityCustomers:
                geographicTopCustomerCity
                    ? geographicTopCustomerCity.customers
                    : 0,

            cities:
                geographicCities,

            highValueLocations
        };


                /* ============================================================
           CUSTOMER BRANCH ANALYSIS
           ============================================================ */

        const branchAnalysisScope =
            scope === "branch"
                ? `
                    s.business_id = ?
                    AND s.branch_id = ?
                `
                : `
                    s.business_id = ?
                `;

        const branchAnalysisParams =
            scope === "branch"
                ? [
                    businessId,
                    branchId
                ]
                : [
                    businessId
                ];

        /* ============================================================
           BRANCH CUSTOMER PERFORMANCE
           ============================================================ */

        const [
            branchAnalysisRows
        ] = await db.query(
            `
            SELECT
                b.branch_id,
                b.branch_name,
                b.location,

                COUNT(
                    DISTINCT s.customer_id
                ) AS purchasing_customers,

                COUNT(
                    DISTINCT s.sale_id
                ) AS transactions,

                COALESCE(
                    SUM(si.total_price),
                    0
                ) AS revenue,

                COALESCE(
                    SUM(
                        si.quantity *
                        si.cost_price
                    ),
                    0
                ) AS cost,

                COALESCE(
                    SUM(si.total_price),
                    0
                ) -
                COALESCE(
                    SUM(
                        si.quantity *
                        si.cost_price
                    ),
                    0
                ) AS gross_profit,

                COALESCE(
                    SUM(si.quantity),
                    0
                ) AS quantity

            FROM branches b

            LEFT JOIN sales s
                ON s.branch_id =
                   b.branch_id
               AND s.business_id =
                   b.business_id
               AND s.sale_status =
                   'Completed'
               AND s.customer_id IS NOT NULL
               ${
                   scope === "branch"
                       ? "AND s.branch_id = ?"
                       : ""
               }
               AND (
                   ? IS NULL
                   OR s.created_at >= ?
               )
               AND (
                   ? IS NULL
                   OR s.created_at < ?
               )

            LEFT JOIN sales_item si
                ON si.sale_id =
                   s.sale_id
               AND si.business_id =
                   s.business_id
               ${
                   scope === "branch"
                       ? "AND si.branch_id = ?"
                       : ""
               }

            WHERE
                b.business_id = ?
                AND b.is_active = 1
                ${
                    scope === "branch"
                        ? "AND b.branch_id = ?"
                        : ""
                }

            GROUP BY
                b.branch_id,
                b.branch_name,
                b.location

            ORDER BY
                revenue DESC,
                b.branch_name ASC
            `,
            scope === "branch"
                ? [
                    branchId,
                    period.start,
                    period.start,
                    period.end,
                    period.end,
                    branchId,
                    businessId,
                    branchId
                ]
                : [
                    period.start,
                    period.start,
                    period.end,
                    period.end,
                    businessId
                ]
        );

        /* ============================================================
           REGISTERED CUSTOMERS BY BRANCH
           ============================================================ */

        const [
            branchCustomerRows
        ] = await db.query(
            `
            SELECT
                b.branch_id,
                COUNT(
                    c.customer_id
                ) AS registered_customers
            FROM branches b

            LEFT JOIN customers c
                ON c.branch_id =
                   b.branch_id
               AND c.business_id =
                   b.business_id

            WHERE
                b.business_id = ?
                AND b.is_active = 1
                ${
                    scope === "branch"
                        ? "AND b.branch_id = ?"
                        : ""
                }

            GROUP BY
                b.branch_id

            ORDER BY
                registered_customers DESC
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

        /* ============================================================
           NEW CUSTOMER ACQUISITION BY BRANCH
           ============================================================ */

        const [
            branchNewCustomerRows
        ] = await db.query(
            `
            SELECT
                first_purchase.branch_id,
                COUNT(*) AS new_customers
            FROM (
                SELECT
                    s.customer_id,
                    MIN(s.created_at) AS first_purchase_date,
                    SUBSTRING_INDEX(
                        GROUP_CONCAT(
                            s.branch_id
                            ORDER BY
                                s.created_at ASC,
                                s.sale_id ASC
                        ),
                        ',',
                        1
                    ) AS branch_id
                FROM sales s
                WHERE
                    s.business_id = ?
                    AND s.customer_id IS NOT NULL
                    AND s.sale_status =
                        'Completed'
                    ${
                        scope === "branch"
                            ? "AND s.branch_id = ?"
                            : ""
                    }
                GROUP BY
                    s.customer_id
            ) first_purchase

            WHERE
                first_purchase.first_purchase_date >= ?
                AND first_purchase.first_purchase_date < ?

            GROUP BY
                first_purchase.branch_id
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

        /* ============================================================
           RETURNING AND ONE-TIME CUSTOMERS BY BRANCH
           ============================================================ */

        const [
            branchCustomerFrequencyRows
        ] = await db.query(
            `
            SELECT
                s.branch_id,

                COUNT(
                    DISTINCT CASE
                        WHEN customer_orders.order_count > 1
                        THEN s.customer_id
                    END
                ) AS returning_customers,

                COUNT(
                    DISTINCT CASE
                        WHEN customer_orders.order_count = 1
                        THEN s.customer_id
                    END
                ) AS one_time_customers

            FROM sales s

            INNER JOIN (
                SELECT
                    customer_id,
                    COUNT(
                        DISTINCT sale_id
                    ) AS order_count
                FROM sales
                WHERE
                    business_id = ?
                    AND customer_id IS NOT NULL
                    AND sale_status =
                        'Completed'
                    ${
                        scope === "branch"
                            ? "AND branch_id = ?"
                            : ""
                    }
                GROUP BY
                    customer_id
            ) customer_orders
                ON customer_orders.customer_id =
                   s.customer_id

            WHERE
                s.business_id = ?
                AND s.customer_id IS NOT NULL
                AND s.sale_status =
                    'Completed'
                ${
                    scope === "branch"
                        ? "AND s.branch_id = ?"
                        : ""
                }
                AND s.created_at >= ?
                AND s.created_at < ?

            GROUP BY
                s.branch_id
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

        /* ============================================================
           BRANCH PERFORMANCE MAP
           ============================================================ */

        const branchCustomerMap =
            new Map(
                branchCustomerRows.map(
                    row => [
                        Number(
                            row.branch_id
                        ),
                        Number(
                            row.registered_customers ||
                            0
                        )
                    ]
                )
            );

        const branchNewCustomerMap =
            new Map(
                branchNewCustomerRows.map(
                    row => [
                        Number(
                            row.branch_id
                        ),
                        Number(
                            row.new_customers ||
                            0
                        )
                    ]
                )
            );

        const branchFrequencyMap =
            new Map(
                branchCustomerFrequencyRows.map(
                    row => [
                        Number(
                            row.branch_id
                        ),
                        {
                            returningCustomers:
                                Number(
                                    row.returning_customers ||
                                    0
                                ),
                            oneTimeCustomers:
                                Number(
                                    row.one_time_customers ||
                                    0
                                )
                        }
                    ]
                )
            );

        /* ============================================================
           BRANCH PERFORMANCE DETAILS
           ============================================================ */

        const customerBranchPerformance =
            branchAnalysisRows.map(
                row => {
                    const id =
                        Number(
                            row.branch_id
                        );

                    const registeredCustomers =
                        branchCustomerMap.get(
                            id
                        ) || 0;

                    const newCustomers =
                        branchNewCustomerMap.get(
                            id
                        ) || 0;

                    const frequency =
                        branchFrequencyMap.get(
                            id
                        ) || {
                            returningCustomers: 0,
                            oneTimeCustomers: 0
                        };

                    const purchasingCustomers =
                        Number(
                            row.purchasing_customers ||
                            0
                        );

                    const transactions =
                        Number(
                            row.transactions ||
                            0
                        );

                    const revenue =
                        Number(
                            row.revenue ||
                            0
                        );

                    const cost =
                        Number(
                            row.cost ||
                            0
                        );

                    const grossProfit =
                        Number(
                            row.gross_profit ||
                            0
                        );

                    const quantity =
                        Number(
                            row.quantity ||
                            0
                        );

                    return {
                        branchId:
                            id,

                        branchName:
                            row.branch_name,

                        location:
                            row.location ||
                            null,

                        registeredCustomers,

                        newCustomers,

                        purchasingCustomers,

                        returningCustomers:
                            frequency.returningCustomers,

                        oneTimeCustomers:
                            frequency.oneTimeCustomers,

                        transactions,

                        quantity,

                        revenue:
                            formatMoney(
                                revenue
                            ),

                        cost:
                            formatMoney(
                                cost
                            ),

                        grossProfit:
                            formatMoney(
                                grossProfit
                            ),

                        averageCustomerValue:
                            purchasingCustomers > 0
                                ? formatMoney(
                                    revenue /
                                    purchasingCustomers
                                )
                                : "0.00",

                        averageOrderValue:
                            transactions > 0
                                ? formatMoney(
                                    revenue /
                                    transactions
                                )
                                : "0.00",

                        repeatPurchaseRate:
                            purchasingCustomers > 0
                                ? Number(
                                    (
                                        (
                                            frequency.returningCustomers /
                                            purchasingCustomers
                                        ) * 100
                                    ).toFixed(2)
                                )
                                : 0
                    };
                }
            );

        /* ============================================================
           BUSINESS BRANCH TOTALS
           ============================================================ */

        const branchTotalRegisteredCustomers =
            customerBranchPerformance.reduce(
                (
                    total,
                    branch
                ) =>
                    total +
                    branch.registeredCustomers,
                0
            );

        const branchTotalPurchasingCustomers =
            customerBranchPerformance.reduce(
                (
                    total,
                    branch
                ) =>
                    total +
                    branch.purchasingCustomers,
                0
            );

        const branchTotalNewCustomers =
            customerBranchPerformance.reduce(
                (
                    total,
                    branch
                ) =>
                    total +
                    branch.newCustomers,
                0
            );

        const branchTotalReturningCustomers =
            customerBranchPerformance.reduce(
                (
                    total,
                    branch
                ) =>
                    total +
                    branch.returningCustomers,
                0
            );

        const branchTotalOneTimeCustomers =
            customerBranchPerformance.reduce(
                (
                    total,
                    branch
                ) =>
                    total +
                    branch.oneTimeCustomers,
                0
            );

        const branchTotalTransactions =
            customerBranchPerformance.reduce(
                (
                    total,
                    branch
                ) =>
                    total +
                    branch.transactions,
                0
            );

        const branchTotalRevenue =
            customerBranchPerformance.reduce(
                (
                    total,
                    branch
                ) =>
                    total +
                    Number(
                        branch.revenue
                    ),
                0
            );

        const branchTotalGrossProfit =
            customerBranchPerformance.reduce(
                (
                    total,
                    branch
                ) =>
                    total +
                    Number(
                        branch.grossProfit
                    ),
                0
            );

        /* ============================================================
           BRANCH REVENUE SHARE
           ============================================================ */

        customerBranchPerformance.forEach(
            branch => {
                const revenue =
                    Number(
                        branch.revenue
                    );

                branch.revenueShare =
                    branchTotalRevenue > 0
                        ? Number(
                            (
                                (
                                    revenue /
                                    branchTotalRevenue
                                ) * 100
                            ).toFixed(2)
                        )
                        : 0;
            }
        );

        /* ============================================================
           TOP-PERFORMING BRANCH
           ============================================================ */

        const topBranchByRevenue =
            customerBranchPerformance.length
                ? [...customerBranchPerformance]
                    .sort(
                        (a, b) =>
                            Number(
                                b.revenue
                            ) -
                            Number(
                                a.revenue
                            )
                    )[0]
                : null;

        const topBranchByCustomers =
            customerBranchPerformance.length
                ? [...customerBranchPerformance]
                    .sort(
                        (a, b) =>
                            b.purchasingCustomers -
                            a.purchasingCustomers
                    )[0]
                : null;

        const topBranchByProfit =
            customerBranchPerformance.length
                ? [...customerBranchPerformance]
                    .sort(
                        (a, b) =>
                            Number(
                                b.grossProfit
                            ) -
                            Number(
                                a.grossProfit
                            )
                    )[0]
                : null;

        /* ============================================================
           CUSTOMER BRANCH ANALYSIS RESPONSE
           ============================================================ */

        const customerBranchAnalysis = {
            totalBranches:
                customerBranchPerformance.length,

            totalRegisteredCustomers:
                branchTotalRegisteredCustomers,

            totalPurchasingCustomers:
                branchTotalPurchasingCustomers,

            totalNewCustomers:
                branchTotalNewCustomers,

            totalReturningCustomers:
                branchTotalReturningCustomers,

            totalOneTimeCustomers:
                branchTotalOneTimeCustomers,

            totalTransactions:
                branchTotalTransactions,

            totalRevenue:
                formatMoney(
                    branchTotalRevenue
                ),

            totalGrossProfit:
                formatMoney(
                    branchTotalGrossProfit
                ),

            overallRepeatPurchaseRate:
                branchTotalPurchasingCustomers > 0
                    ? Number(
                        (
                            (
                                branchTotalReturningCustomers /
                                branchTotalPurchasingCustomers
                            ) * 100
                        ).toFixed(2)
                    )
                    : 0,

            topBranchByRevenue:
                topBranchByRevenue
                    ? {
                        branchId:
                            topBranchByRevenue.branchId,
                        branchName:
                            topBranchByRevenue.branchName,
                        revenue:
                            topBranchByRevenue.revenue
                    }
                    : null,

            topBranchByCustomers:
                topBranchByCustomers
                    ? {
                        branchId:
                            topBranchByCustomers.branchId,
                        branchName:
                            topBranchByCustomers.branchName,
                        customers:
                            topBranchByCustomers.purchasingCustomers
                    }
                    : null,

            topBranchByProfit:
                topBranchByProfit
                    ? {
                        branchId:
                            topBranchByProfit.branchId,
                        branchName:
                            topBranchByProfit.branchName,
                        grossProfit:
                            topBranchByProfit.grossProfit
                    }
                    : null,

            branches:
                customerBranchPerformance
        };


                /* ============================================================
           CUSTOMER 360
           ============================================================ */

        const requestedCustomerId =
            req.query?.customer_id ??
            req.query?.customerId ??
            null;

        let customer360 = null;

        if (
            requestedCustomerId !== null &&
            requestedCustomerId !== undefined &&
            String(requestedCustomerId).trim() !== ""
        ) {
            const customer360Id =
                Number(
                    requestedCustomerId
                );

            if (
                !Number.isInteger(
                    customer360Id
                ) ||
                customer360Id <= 0
            ) {
                const error = new Error(
                    "Invalid customer selected."
                );

                error.statusCode = 400;
                throw error;
            }

            /* ========================================================
               CUSTOMER IDENTITY
               ======================================================== */

            const customerIdentityScope =
                scope === "branch"
                    ? `
                        c.business_id = ?
                        AND c.branch_id = ?
                        AND c.customer_id = ?
                    `
                    : `
                        c.business_id = ?
                        AND c.customer_id = ?
                    `;

            const customerIdentityParams =
                scope === "branch"
                    ? [
                        businessId,
                        branchId,
                        customer360Id
                    ]
                    : [
                        businessId,
                        customer360Id
                    ];

            const [
                customerIdentityRows
            ] = await db.query(
                `
                SELECT
                    c.customer_id,
                    c.business_id,
                    c.branch_id,
                    c.customer_code,
                    c.customer_name,
                    c.phone,
                    c.Email AS email,
                    c.Address AS address,
                    c.city,
                    c.status,
                    c.created_at,
                    c.updated_at,
                    b.branch_name,
                    b.location AS branch_location
                FROM customers c
                LEFT JOIN branches b
                    ON b.branch_id =
                       c.branch_id
                   AND b.business_id =
                       c.business_id
                WHERE
                    ${customerIdentityScope}
                LIMIT 1
                `,
                customerIdentityParams
            );

            if (!customerIdentityRows.length) {
                const error = new Error(
                    "Customer was not found in the selected business or branch."
                );

                error.statusCode = 404;
                throw error;
            }

            const customerIdentity =
                customerIdentityRows[0];

            /* ========================================================
               CUSTOMER SALES SCOPE
               ======================================================== */

            const customer360SalesScope =
                scope === "branch"
                    ? `
                        s.business_id = ?
                        AND s.branch_id = ?
                        AND s.customer_id = ?
                    `
                    : `
                        s.business_id = ?
                        AND s.customer_id = ?
                    `;

            const customer360SalesParams =
                scope === "branch"
                    ? [
                        businessId,
                        branchId,
                        customer360Id
                    ]
                    : [
                        businessId,
                        customer360Id
                    ];

            /* ========================================================
               LIFETIME CUSTOMER FINANCIALS
               ======================================================== */

            const [
                customerLifetimeRows
            ] = await db.query(
                `
                SELECT
                    COUNT(
                        DISTINCT s.sale_id
                    ) AS transactions,

                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS quantity,

                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,

                    COALESCE(
                        SUM(
                            si.quantity *
                            si.cost_price
                        ),
                        0
                    ) AS cost,

                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) -
                    COALESCE(
                        SUM(
                            si.quantity *
                            si.cost_price
                        ),
                        0
                    ) AS gross_profit,

                    MIN(
                        s.created_at
                    ) AS first_purchase,

                    MAX(
                        s.created_at
                    ) AS last_purchase

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id
                   ${
                       scope === "branch"
                           ? "AND si.branch_id = ?"
                           : ""
                   }

                WHERE
                    ${customer360SalesScope}
                    AND s.sale_status =
                        'Completed'
                `,
                scope === "branch"
                    ? [
                        branchId,
                        ...customer360SalesParams
                    ]
                    : customer360SalesParams
            );

            const customerLifetime =
                customerLifetimeRows[0] || {};

            const lifetimeTransactions =
                Number(
                    customerLifetime.transactions ||
                    0
                );

            const lifetimeQuantity =
                Number(
                    customerLifetime.quantity ||
                    0
                );

            const lifetimeRevenue =
                Number(
                    customerLifetime.revenue ||
                    0
                );

            const lifetimeCost =
                Number(
                    customerLifetime.cost ||
                    0
                );

            const lifetimeGrossProfit =
                Number(
                    customerLifetime.gross_profit ||
                    0
                );

            /* ========================================================
               CUSTOMER RFM
               ======================================================== */

            const customerRfmSalesParams =
                scope === "branch"
                    ? [
                        businessId,
                        branchId,
                        customer360Id
                    ]
                    : [
                        businessId,
                        customer360Id
                    ];

            const [
                customerRfmRows
            ] = await db.query(
                `
                SELECT
                    COUNT(
                        DISTINCT s.sale_id
                    ) AS frequency,

                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS monetary,

                    MAX(
                        s.created_at
                    ) AS last_purchase

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id
                   ${
                       scope === "branch"
                           ? "AND si.branch_id = ?"
                           : ""
                   }

                WHERE
                    ${customer360SalesScope}
                    AND s.sale_status =
                        'Completed'
                `,
                scope === "branch"
                    ? [
                        branchId,
                        ...customerRfmSalesParams
                    ]
                    : customerRfmSalesParams
            );

            const customerRfm =
                customerRfmRows[0] || {};

            const customerFrequency =
                Number(
                    customerRfm.frequency ||
                    0
                );

            const customerMonetary =
                Number(
                    customerRfm.monetary ||
                    0
                );

            const customerLastPurchase =
                customerRfm.last_purchase ||
                null;

            let customerRecencyDays = null;

            if (
                customerLastPurchase
            ) {
                const today =
                    new Date();

                const lastPurchaseDate =
                    new Date(
                        customerLastPurchase
                    );

                today.setHours(
                    0,
                    0,
                    0,
                    0
                );

                lastPurchaseDate.setHours(
                    0,
                    0,
                    0,
                    0
                );

                customerRecencyDays =
                    Math.max(
                        0,
                        Math.floor(
                            (
                                today.getTime() -
                                lastPurchaseDate.getTime()
                            ) /
                            86400000
                        )
                    );
            }

            /* ========================================================
               RFM SCORE
               ======================================================== */

            let customerRecencyScore = 1;
            let customerFrequencyScore = 1;
            let customerMonetaryScore = 1;

            if (
                customerRecencyDays !== null
            ) {
                if (
                    customerRecencyDays <= 30
                ) {
                    customerRecencyScore = 5;
                } else if (
                    customerRecencyDays <= 60
                ) {
                    customerRecencyScore = 4;
                } else if (
                    customerRecencyDays <= 90
                ) {
                    customerRecencyScore = 3;
                } else if (
                    customerRecencyDays <= 180
                ) {
                    customerRecencyScore = 2;
                }
            }

            if (
                customerFrequency >= 10
            ) {
                customerFrequencyScore = 5;
            } else if (
                customerFrequency >= 6
            ) {
                customerFrequencyScore = 4;
            } else if (
                customerFrequency >= 3
            ) {
                customerFrequencyScore = 3;
            } else if (
                customerFrequency >= 2
            ) {
                customerFrequencyScore = 2;
            }

            if (
                customerMonetary >= 10000
            ) {
                customerMonetaryScore = 5;
            } else if (
                customerMonetary >= 5000
            ) {
                customerMonetaryScore = 4;
            } else if (
                customerMonetary >= 2000
            ) {
                customerMonetaryScore = 3;
            } else if (
                customerMonetary >= 500
            ) {
                customerMonetaryScore = 2;
            }

            let customerRfmSegment =
                "Other";

            if (
                customerRecencyScore >= 4 &&
                customerFrequencyScore >= 4 &&
                customerMonetaryScore >= 4
            ) {
                customerRfmSegment =
                    "Champion";
            } else if (
                customerRecencyScore >= 3 &&
                customerFrequencyScore >= 3 &&
                customerMonetaryScore >= 3
            ) {
                customerRfmSegment =
                    "Loyal";
            } else if (
                customerRecencyScore <= 2 &&
                customerFrequencyScore >= 3
            ) {
                customerRfmSegment =
                    "At Risk";
            } else if (
                customerRecencyScore <= 2 &&
                customerFrequencyScore <= 2
            ) {
                customerRfmSegment =
                    "Dormant";
            }

            /* ========================================================
               CUSTOMER SEGMENT
               ======================================================== */

            let customerSegment =
                "One-Time";

            if (
                lifetimeTransactions === 0
            ) {
                customerSegment =
                    "New";
            } else if (
                customerRecencyDays !== null &&
                customerMonetary >=
                    lifetimeRevenue &&
                lifetimeRevenue > 0
            ) {
                customerSegment =
                    "Regular";
            }

            const daysSinceFirstPurchase =
                customerLifetime.first_purchase
                    ? Math.floor(
                        (
                            new Date().getTime() -
                            new Date(
                                customerLifetime.first_purchase
                            ).getTime()
                        ) /
                        86400000
                    )
                    : null;

            if (
                lifetimeTransactions === 1 &&
                (
                    customerRecencyDays === null ||
                    customerRecencyDays > 30
                )
            ) {
                customerSegment =
                    "One-Time";
            } else if (
                lifetimeTransactions >= 3 &&
                customerRecencyDays !== null &&
                customerRecencyDays <= 90
            ) {
                customerSegment =
                    "Loyal";
            } else if (
                lifetimeTransactions >= 2 &&
                customerRecencyDays !== null &&
                customerRecencyDays <= 90
            ) {
                customerSegment =
                    "Regular";
            } else if (
                lifetimeTransactions >= 2 &&
                customerRecencyDays !== null &&
                customerRecencyDays >= 91 &&
                customerRecencyDays <= 180
            ) {
                customerSegment =
                    "At Risk";
            } else if (
                customerRecencyDays !== null &&
                customerRecencyDays > 180
            ) {
                customerSegment =
                    "Dormant";
            } else if (
                customerRecencyDays !== null &&
                customerRecencyDays <= 30
            ) {
                customerSegment =
                    "New";
            }

            /* ========================================================
               CUSTOMER PURCHASE TREND
               ======================================================== */

            const customerTrendPeriod =
                period.key === "all"
                    ? "month"
                    : getAcquisitionTrendPeriod(
                        period.key
                    );

            let customerTrendRows = [];

            if (
                customerTrendPeriod ===
                "day"
            ) {
                [
                    customerTrendRows
                ] = await db.query(
                    `
                    SELECT
                        DATE_FORMAT(
                            s.created_at,
                            '%Y-%m-%d'
                        ) AS period_start,

                        COUNT(
                            DISTINCT s.sale_id
                        ) AS transactions,

                        COALESCE(
                            SUM(si.quantity),
                            0
                        ) AS quantity,

                        COALESCE(
                            SUM(si.total_price),
                            0
                        ) AS revenue,

                        COALESCE(
                            SUM(
                                si.quantity *
                                si.cost_price
                            ),
                            0
                        ) AS cost

                    FROM sales s

                    INNER JOIN sales_item si
                        ON si.sale_id =
                           s.sale_id
                       AND si.business_id =
                           s.business_id
                       ${
                           scope === "branch"
                               ? "AND si.branch_id = ?"
                               : ""
                       }

                    WHERE
                        ${customer360SalesScope}
                        AND s.sale_status =
                            'Completed'
                        AND s.created_at >= ?
                        AND s.created_at < ?

                    GROUP BY
                        DATE_FORMAT(
                            s.created_at,
                            '%Y-%m-%d'
                        )

                    ORDER BY
                        period_start ASC
                    `,
                    scope === "branch"
                        ? [
                            branchId,
                            ...customer360SalesParams,
                            period.start,
                            period.end
                        ]
                        : [
                            ...customer360SalesParams,
                            period.start,
                            period.end
                        ]
                );
            } else {
                [
                    customerTrendRows
                ] = await db.query(
                    `
                    SELECT
                        DATE_FORMAT(
                            s.created_at,
                            '%Y-%m-01'
                        ) AS period_start,

                        COUNT(
                            DISTINCT s.sale_id
                        ) AS transactions,

                        COALESCE(
                            SUM(si.quantity),
                            0
                        ) AS quantity,

                        COALESCE(
                            SUM(si.total_price),
                            0
                        ) AS revenue,

                        COALESCE(
                            SUM(
                                si.quantity *
                                si.cost_price
                            ),
                            0
                        ) AS cost

                    FROM sales s

                    INNER JOIN sales_item si
                        ON si.sale_id =
                           s.sale_id
                       AND si.business_id =
                           s.business_id
                       ${
                           scope === "branch"
                               ? "AND si.branch_id = ?"
                               : ""
                       }

                    WHERE
                        ${customer360SalesScope}
                        AND s.sale_status =
                            'Completed'
                        AND s.created_at >= ?
                        AND s.created_at < ?

                    GROUP BY
                        DATE_FORMAT(
                            s.created_at,
                            '%Y-%m-01'
                        )

                    ORDER BY
                        period_start ASC
                    `,
                    scope === "branch"
                        ? [
                            branchId,
                            ...customer360SalesParams,
                            period.start,
                            period.end
                        ]
                        : [
                            ...customer360SalesParams,
                            period.start,
                            period.end
                        ]
                );
            }

            const customerPurchaseTrend =
                customerTrendRows.map(
                    row => {
                        const revenue =
                            Number(
                                row.revenue ||
                                0
                            );

                        const cost =
                            Number(
                                row.cost ||
                                0
                            );

                        return {
                            period:
                                row.period_start,

                            transactions:
                                Number(
                                    row.transactions ||
                                    0
                                ),

                            quantity:
                                Number(
                                    row.quantity ||
                                    0
                                ),

                            revenue:
                                formatMoney(
                                    revenue
                                ),

                            grossProfit:
                                formatMoney(
                                    revenue -
                                    cost
                                )
                        };
                    }
                );

            /* ========================================================
               CUSTOMER PURCHASE HISTORY
               ======================================================== */

            const [
                customerPurchaseHistoryRows
            ] = await db.query(
                `
                SELECT
                    s.sale_id,
                    s.invoice_number,
                    s.branch_id,
                    b.branch_name,
                    s.created_at,
                    COUNT(
                        DISTINCT si.sale_item_id
                    ) AS item_count,
                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS quantity,
                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,
                    COALESCE(
                        SUM(
                            si.quantity *
                            si.cost_price
                        ),
                        0
                    ) AS cost

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id

                LEFT JOIN branches b
                    ON b.branch_id =
                       s.branch_id
                   AND b.business_id =
                       s.business_id

                WHERE
                    ${customer360SalesScope}
                    AND s.sale_status =
                        'Completed'
                    ${
                        scope === "branch"
                            ? "AND si.branch_id = ?"
                            : ""
                    }

                GROUP BY
                    s.sale_id,
                    s.invoice_number,
                    s.branch_id,
                    b.branch_name,
                    s.created_at

                ORDER BY
                    s.created_at DESC,
                    s.sale_id DESC
                LIMIT 100
                `,
                scope === "branch"
                    ? [
                        ...customer360SalesParams,
                        branchId
                    ]
                    : customer360SalesParams
            );

            const customerPurchaseHistory =
                customerPurchaseHistoryRows.map(
                    row => {
                        const revenue =
                            Number(
                                row.revenue ||
                                0
                            );

                        const cost =
                            Number(
                                row.cost ||
                                0
                            );

                        return {
                            saleId:
                                row.sale_id,

                            invoiceNumber:
                                row.invoice_number,

                            branchId:
                                row.branch_id,

                            branchName:
                                row.branch_name ||
                                null,

                            date:
                                row.created_at,

                            items:
                                Number(
                                    row.item_count ||
                                    0
                                ),

                            quantity:
                                Number(
                                    row.quantity ||
                                    0
                                ),

                            revenue:
                                formatMoney(
                                    revenue
                                ),

                            grossProfit:
                                formatMoney(
                                    revenue -
                                    cost
                                )
                        };
                    }
                );

            /* ========================================================
               CUSTOMER PRODUCT BEHAVIOR
               ======================================================== */

            const [
                customerProductRows
            ] = await db.query(
                `
                SELECT
                    si.product_id,
                    si.product_name,

                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS quantity,

                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,

                    COUNT(
                        DISTINCT s.sale_id
                    ) AS transactions

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id
                   ${
                       scope === "branch"
                           ? "AND si.branch_id = ?"
                           : ""
                   }

                WHERE
                    ${customer360SalesScope}
                    AND s.sale_status =
                        'Completed'

                GROUP BY
                    si.product_id,
                    si.product_name

                ORDER BY
                    quantity DESC,
                    revenue DESC

                LIMIT 20
                `,
                scope === "branch"
                    ? [
                        branchId,
                        ...customer360SalesParams
                    ]
                    : customer360SalesParams
            );

            const customerPreferredProducts =
                customerProductRows.map(
                    row => ({
                        productId:
                            row.product_id,

                        productName:
                            row.product_name,

                        quantity:
                            Number(
                                row.quantity ||
                                0
                            ),

                        revenue:
                            formatMoney(
                                Number(
                                    row.revenue ||
                                    0
                                )
                            ),

                        transactions:
                            Number(
                                row.transactions ||
                                0
                            )
                    })
                );

            /* ========================================================
               CUSTOMER CATEGORY BEHAVIOR
               ======================================================== */

            const [
                customerCategoryRows
            ] = await db.query(
                `
                SELECT
                    COALESCE(
                        NULLIF(
                            TRIM(p.category),
                            ''
                        ),
                        'Uncategorized'
                    ) AS category,

                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS quantity,

                    COALESCE(
                        SUM(si.total_price),
                        0
                    ) AS revenue,

                    COUNT(
                        DISTINCT s.sale_id
                    ) AS transactions

                FROM sales s

                INNER JOIN sales_item si
                    ON si.sale_id =
                       s.sale_id
                   AND si.business_id =
                       s.business_id
                   ${
                       scope === "branch"
                           ? "AND si.branch_id = ?"
                           : ""
                   }

                LEFT JOIN products p
                    ON p.product_id =
                       si.product_id
                   AND p.business_id =
                       si.business_id

                WHERE
                    ${customer360SalesScope}
                    AND s.sale_status =
                        'Completed'

                GROUP BY
                    COALESCE(
                        NULLIF(
                            TRIM(p.category),
                            ''
                        ),
                        'Uncategorized'
                    )

                ORDER BY
                    revenue DESC,
                    category ASC

                LIMIT 20
                `,
                scope === "branch"
                    ? [
                        branchId,
                        ...customer360SalesParams
                    ]
                    : customer360SalesParams
            );

            const customerCategoryBehavior =
                customerCategoryRows.map(
                    row => ({
                        category:
                            row.category,

                        quantity:
                            Number(
                                row.quantity ||
                                0
                            ),

                        revenue:
                            formatMoney(
                                Number(
                                    row.revenue ||
                                    0
                                )
                            ),

                        transactions:
                            Number(
                                row.transactions ||
                                0
                            )
                    })
                );

            /* ========================================================
               CUSTOMER TIMELINE
               ======================================================== */

            const customerTimeline = [];

            customerTimeline.push({
                type:
                    "Customer Registered",

                date:
                    customerIdentity.created_at,

                description:
                    "Customer account was created."
            });

            if (
                customerLifetime.first_purchase
            ) {
                customerTimeline.push({
                    type:
                        "First Purchase",

                    date:
                        customerLifetime.first_purchase,

                    description:
                        "Customer completed their first purchase."
                });
            }

            customerPurchaseHistory.forEach(
                purchase => {
                    customerTimeline.push({
                        type:
                            "Purchase",

                        date:
                            purchase.date,

                        saleId:
                            purchase.saleId,

                        invoiceNumber:
                            purchase.invoiceNumber,

                        branchName:
                            purchase.branchName,

                        revenue:
                            purchase.revenue,

                        description:
                            `Completed purchase ${
                                purchase.invoiceNumber ||
                                purchase.saleId
                            }.`
                    });
                }
            );

            customerTimeline.sort(
                (a, b) =>
                    new Date(a.date).getTime() -
                    new Date(b.date).getTime()
            );

            /* ========================================================
               CUSTOMER 360 RESPONSE
               ======================================================== */

            customer360 = {
                customer: {
                    customerId:
                        customerIdentity.customer_id,

                    customerCode:
                        customerIdentity.customer_code,

                    customerName:
                        customerIdentity.customer_name,

                    phone:
                        customerIdentity.phone,

                    email:
                        customerIdentity.email,

                    address:
                        customerIdentity.address,

                    city:
                        customerIdentity.city,

                    status:
                        customerIdentity.status,

                    branchId:
                        customerIdentity.branch_id,

                    branchName:
                        customerIdentity.branch_name,

                    branchLocation:
                        customerIdentity.branch_location,

                    registeredAt:
                        customerIdentity.created_at
                },

                financials: {
                    lifetimeRevenue:
                        formatMoney(
                            lifetimeRevenue
                        ),

                    lifetimeCost:
                        formatMoney(
                            lifetimeCost
                        ),

                    lifetimeGrossProfit:
                        formatMoney(
                            lifetimeGrossProfit
                        ),

                    grossMargin:
                        lifetimeRevenue > 0
                            ? Number(
                                (
                                    (
                                        lifetimeGrossProfit /
                                        lifetimeRevenue
                                    ) * 100
                                ).toFixed(2)
                            )
                            : 0,

                    lifetimeTransactions,

                    lifetimeQuantity,

                    averageOrderValue:
                        lifetimeTransactions > 0
                            ? formatMoney(
                                lifetimeRevenue /
                                lifetimeTransactions
                            )
                            : "0.00",

                    averageProfitPerOrder:
                        lifetimeTransactions > 0
                            ? formatMoney(
                                lifetimeGrossProfit /
                                lifetimeTransactions
                            )
                            : "0.00",

                    firstPurchase:
                        customerLifetime.first_purchase,

                    lastPurchase:
                        customerLifetime.last_purchase
                },

                segment: {
                    name:
                        customerSegment,

                    recencyDays:
                        customerRecencyDays,

                    frequency:
                        customerFrequency,

                    monetary:
                        formatMoney(
                            customerMonetary
                        )
                },

                rfm: {
                    recencyScore:
                        customerRecencyScore,

                    frequencyScore:
                        customerFrequencyScore,

                    monetaryScore:
                        customerMonetaryScore,

                    totalScore:
                        customerRecencyScore +
                        customerFrequencyScore +
                        customerMonetaryScore,

                    segment:
                        customerRfmSegment
                },

                purchaseTrend:
                    customerPurchaseTrend,

                purchaseHistory:
                    customerPurchaseHistory,

                preferredProducts:
                    customerPreferredProducts,

                categories:
                    customerCategoryBehavior,

                profitability: {
                    revenue:
                        formatMoney(
                            lifetimeRevenue
                        ),

                    cost:
                        formatMoney(
                            lifetimeCost
                        ),

                    grossProfit:
                        formatMoney(
                            lifetimeGrossProfit
                        ),

                    grossMargin:
                        lifetimeRevenue > 0
                            ? Number(
                                (
                                    (
                                        lifetimeGrossProfit /
                                        lifetimeRevenue
                                    ) * 100
                                ).toFixed(2)
                            )
                            : 0
                },

                timeline:
                    customerTimeline,

                period: {
                    key:
                        period.key,

                    start:
                        period.start,

                    end:
                        period.end
                }
            };
        }

                /* ============================================================
           CUSTOMER DECISION INTELLIGENCE
           ============================================================ */

        const decisionCustomerRows =
            segmentationCustomers || [];

        /* ============================================================
           CUSTOMER RISK ANALYSIS
           ============================================================ */

        const decisionAtRiskCustomers =
            decisionCustomerRows.filter(
                customer =>
                    customer.segment ===
                    "At Risk"
            );

        const decisionDormantCustomers =
            decisionCustomerRows.filter(
                customer =>
                    customer.segment ===
                    "Dormant"
            );

        const decisionHighValueCustomers =
            decisionCustomerRows.filter(
                customer =>
                    customer.segment ===
                        "VIP / High Value" ||
                    Number(
                        customer.revenue || 0
                    ) >=
                        (
                            decisionCustomerRows
                                .map(
                                    item =>
                                        Number(
                                            item.revenue ||
                                            0
                                        )
                                )
                                .sort(
                                    (a, b) =>
                                        a - b
                                )[
                                    Math.max(
                                        0,
                                        Math.ceil(
                                            decisionCustomerRows.length *
                                            0.8
                                        ) - 1
                                    )
                                ] || 0
                        )
            );

        const decisionAtRiskRevenue =
            decisionAtRiskCustomers.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    Number(
                        customer.revenue ||
                        0
                    ),
                0
            );

        const decisionDormantRevenue =
            decisionDormantCustomers.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    Number(
                        customer.revenue ||
                        0
                    ),
                0
            );

        const decisionHighValueRevenue =
            decisionHighValueCustomers.reduce(
                (
                    total,
                    customer
                ) =>
                    total +
                    Number(
                        customer.revenue ||
                        0
                    ),
                0
            );

        /* ============================================================
           CUSTOMER GROWTH SIGNAL
           ============================================================ */

        const acquisitionTrend =
            acquisition?.trend || [];

        let customerGrowthDirection =
            "→";

        let customerGrowthPercentage =
            0;

        if (
            acquisitionTrend.length >= 2
        ) {
            const current =
                Number(
                    acquisitionTrend[
                        acquisitionTrend.length - 1
                    ].customers || 0
                );

            const previous =
                Number(
                    acquisitionTrend[
                        acquisitionTrend.length - 2
                    ].customers || 0
                );

            if (previous > 0) {
                customerGrowthPercentage =
                    Number(
                        (
                            (
                                (
                                    current -
                                    previous
                                ) /
                                previous
                            ) * 100
                        ).toFixed(2)
                    );

                if (
                    customerGrowthPercentage >
                    5
                ) {
                    customerGrowthDirection =
                        "↑";
                } else if (
                    customerGrowthPercentage <
                    -5
                ) {
                    customerGrowthDirection =
                        "↓";
                }
            } else if (
                current > 0
            ) {
                customerGrowthDirection =
                    "↑";
            }
        }

        /* ============================================================
           RETENTION SIGNAL
           ============================================================ */

        const retentionRate =
            Number(
                retention?.repeatPurchaseRate ||
                0
            );

        /* ============================================================
           REVENUE CONCENTRATION SIGNAL
           ============================================================ */

        const concentrationTop10 =
            Number(
                customerConcentration?.top10
                    ?.percentage ||
                0
            );

        const concentrationDirection =
            customerConcentration
                ?.concentrationDirection ||
            "→";

        let concentrationRisk =
            "Low";

        if (
            concentrationTop10 >= 70
        ) {
            concentrationRisk =
                "High";
        } else if (
            concentrationTop10 >= 50
        ) {
            concentrationRisk =
                "Moderate";
        }

        /* ============================================================
           HIGH-VALUE PROFITABILITY
           ============================================================ */

        const highValueProfitability =
            customerProfitability
                ?.customers || [];

        const highValueProfit =
            highValueProfitability
                .filter(
                    customer =>
                        decisionHighValueCustomers
                            .some(
                                highValue =>
                                    Number(
                                        highValue.customerId
                                    ) ===
                                    Number(
                                        customer.customerId
                                    )
                            )
                )
                .reduce(
                    (
                        total,
                        customer
                    ) =>
                        total +
                        Number(
                            customer.grossProfit ||
                            0
                        ),
                    0
                );

        /* ============================================================
           EXECUTIVE SIGNALS
           ============================================================ */

        const decisionSignals = [];

        if (
            decisionAtRiskCustomers.length > 0
        ) {
            decisionSignals.push({
                type:
                    "customer_risk",

                severity:
                    decisionAtRiskRevenue >
                    decisionHighValueRevenue *
                        0.2
                        ? "high"
                        : "medium",

                title:
                    "Customers at risk",

                metric:
                    decisionAtRiskCustomers.length,

                revenue:
                    formatMoney(
                        decisionAtRiskRevenue
                    ),

                message:
                    `${decisionAtRiskCustomers.length} customers are classified as at risk, representing ${formatMoney(
                        decisionAtRiskRevenue
                    )} in historical customer revenue.`,

                action:
                    "Prioritize targeted reactivation campaigns for high-value at-risk customers."
            });
        }

        if (
            decisionDormantCustomers.length > 0
        ) {
            decisionSignals.push({
                type:
                    "customer_dormancy",

                severity:
                    "medium",

                title:
                    "Dormant customer base",

                metric:
                    decisionDormantCustomers.length,

                revenue:
                    formatMoney(
                        decisionDormantRevenue
                    ),

                message:
                    `${decisionDormantCustomers.length} customers have become dormant, with ${formatMoney(
                        decisionDormantRevenue
                    )} in historical revenue.`,

                action:
                    "Review dormant customers by value and test structured win-back offers."
            });
        }

        if (
            decisionHighValueCustomers.length > 0
        ) {
            decisionSignals.push({
                type:
                    "high_value_customers",

                severity:
                    "positive",

                title:
                    "High-value customer base",

                metric:
                    decisionHighValueCustomers.length,

                revenue:
                    formatMoney(
                        decisionHighValueRevenue
                    ),

                grossProfit:
                    formatMoney(
                        highValueProfit
                    ),

                message:
                    `${decisionHighValueCustomers.length} high-value customers generate ${formatMoney(
                        decisionHighValueRevenue
                    )} in historical revenue.`,

                action:
                    "Protect retention of high-value customers and prioritize them for relationship management."
            });
        }

        if (
            concentrationRisk ===
            "High"
        ) {
            decisionSignals.push({
                type:
                    "revenue_concentration",

                severity:
                    "high",

                title:
                    "High customer concentration",

                metric:
                    concentrationTop10,

                message:
                    `The top 10 customers account for ${concentrationTop10}% of customer revenue.`,

                action:
                    "Reduce dependency risk by expanding the active customer base and increasing mid-tier customer spend."
            });
        } else if (
            concentrationRisk ===
            "Moderate"
        ) {
            decisionSignals.push({
                type:
                    "revenue_concentration",

                severity:
                    "medium",

                title:
                    "Moderate customer concentration",

                metric:
                    concentrationTop10,

                message:
                    `The top 10 customers account for ${concentrationTop10}% of customer revenue.`,

                action:
                    "Monitor concentration and strengthen the next tier of valuable customers."
            });
        }

        if (
            customerGrowthDirection ===
            "↑"
        ) {
            decisionSignals.push({
                type:
                    "customer_growth",

                severity:
                    "positive",

                title:
                    "Customer base growing",

                metric:
                    customerGrowthPercentage,

                message:
                    `Customer acquisition is trending upward by ${customerGrowthPercentage}%.`,

                action:
                    "Maintain acquisition channels while converting new customers into repeat buyers."
            });
        } else if (
            customerGrowthDirection ===
            "↓"
        ) {
            decisionSignals.push({
                type:
                    "customer_growth",

                severity:
                    "high",

                title:
                    "Customer acquisition slowing",

                metric:
                    customerGrowthPercentage,

                message:
                    `Customer acquisition is trending downward by ${Math.abs(
                        customerGrowthPercentage
                    )}%.`,

                action:
                    "Review acquisition sources and strengthen customer acquisition activity."
            });
        }

        if (
            retentionRate > 0 &&
            retentionRate < 30
        ) {
            decisionSignals.push({
                type:
                    "retention",

                severity:
                    "high",

                title:
                    "Low repeat purchase rate",

                metric:
                    retentionRate,

                message:
                    `Only ${retentionRate}% of purchasing customers are returning customers.`,

                action:
                    "Focus on post-purchase engagement, repeat-purchase incentives and customer follow-up."
            });
        } else if (
            retentionRate >= 30 &&
            retentionRate < 50
        ) {
            decisionSignals.push({
                type:
                    "retention",

                severity:
                    "medium",

                title:
                    "Retention opportunity",

                metric:
                    retentionRate,

                message:
                    `${retentionRate}% of purchasing customers are returning customers.`,

                action:
                    "Increase repeat purchasing through personalized offers and customer engagement."
            });
        } else if (
            retentionRate >= 50
        ) {
            decisionSignals.push({
                type:
                    "retention",

                severity:
                    "positive",

                title:
                    "Strong customer retention",

                metric:
                    retentionRate,

                message:
                    `${retentionRate}% of purchasing customers are returning customers.`,

                action:
                    "Protect existing loyalty while identifying opportunities to increase customer value."
            });
        }

        /* ============================================================
           TOP BRANCH CUSTOMER SIGNAL
           ============================================================ */

        const branchDecision =
            customerBranchAnalysis
                ?.topBranchByRevenue || null;

        if (
            branchDecision
        ) {
            decisionSignals.push({
                type:
                    "branch_performance",

                severity:
                    "info",

                title:
                    "Leading customer branch",

                metric:
                    branchDecision.revenue,

                branchId:
                    branchDecision.branchId,

                branchName:
                    branchDecision.branchName,

                message:
                    `${branchDecision.branchName} currently leads branch customer revenue at ${branchDecision.revenue}.`,

                action:
                    "Compare the leading branch's customer acquisition, retention and spending patterns with other branches."
            });
        }

        /* ============================================================
           EXECUTIVE SUMMARY
           ============================================================ */

        let primaryManagementPriority =
            "Maintain customer growth and strengthen retention.";

        if (
            concentrationRisk ===
            "High"
        ) {
            primaryManagementPriority =
                "Reduce customer revenue concentration risk.";
        } else if (
            decisionAtRiskCustomers.length >
            0 &&
            decisionAtRiskRevenue >
                decisionHighValueRevenue *
                    0.2
        ) {
            primaryManagementPriority =
                "Protect high-value revenue from customer churn.";
        } else if (
            retentionRate > 0 &&
            retentionRate < 30
        ) {
            primaryManagementPriority =
                "Improve repeat purchasing and customer retention.";
        } else if (
            customerGrowthDirection ===
            "↓"
        ) {
            primaryManagementPriority =
                "Rebuild customer acquisition momentum.";
        }

        /* ============================================================
           CUSTOMER DECISION INTELLIGENCE RESPONSE
           ============================================================ */

        const customerDecisionIntelligence = {
            primaryManagementPriority,

            customerGrowth: {
                direction:
                    customerGrowthDirection,

                percentage:
                    customerGrowthPercentage,

                trend:
                    acquisitionTrend
            },

            retention: {
                rate:
                    retentionRate,

                direction:
                    retentionDirection,

                returningCustomers:
                    retention?.returningCustomers ||
                    0,

                oneTimeCustomers:
                    retention?.oneTimeCustomers ||
                    0
            },

            customerRisk: {
                atRiskCustomers:
                    decisionAtRiskCustomers.length,

                atRiskRevenue:
                    formatMoney(
                        decisionAtRiskRevenue
                    ),

                dormantCustomers:
                    decisionDormantCustomers.length,

                dormantRevenue:
                    formatMoney(
                        decisionDormantRevenue
                    )
            },

            highValue: {
                customers:
                    decisionHighValueCustomers.length,

                revenue:
                    formatMoney(
                        decisionHighValueRevenue
                    ),

                grossProfit:
                    formatMoney(
                        highValueProfit
                    )
            },

            concentration: {
                top5Percentage:
                    Number(
                        customerConcentration
                            ?.top5
                            ?.percentage ||
                        0
                    ),

                top10Percentage:
                    concentrationTop10,

                top20Percentage:
                    Number(
                        customerConcentration
                            ?.top20
                            ?.percentage ||
                        0
                    ),

                risk:
                    concentrationRisk,

                direction:
                    concentrationDirection
            },

            branchPerformance: {
                topRevenueBranch:
                    branchDecision
                        ? {
                            branchId:
                                branchDecision.branchId,

                            branchName:
                                branchDecision.branchName,

                            revenue:
                                branchDecision.revenue
                        }
                        : null
            },

            signals:
                decisionSignals
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
                    customerSegmentationSummary,

                rfm:    rfmSummary,
                customerLifetimeValue,
                customerProfitability,
                customerPurchasingBehavior,
                customerConcentration,
                customerGeographicAnalysis,
                customerBranchAnalysis,
                customer360,
                customerDecisionIntelligence  

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