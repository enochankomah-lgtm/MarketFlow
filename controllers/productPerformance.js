const db = require("../Database/db");

/*
===========================================================
PRODUCT PERFORMANCE CONTROLLER
===========================================================

Purpose:
Handles all Product Performance Dashboard data.

Scope rules:
1. Business mode = all branches belonging to the business.
2. Branch mode = only the selected active branch.
3. Selected branch must belong to the authenticated business.
4. Only Completed sales are included.
5. sales.discount is stored as a percentage.
6. Net Revenue = Gross Sales - Allocated Discount.
7. COGS = quantity × sales_item.cost_price.
8. Historical COGS uses sales_item.cost_price.
9. Current inventory value uses products.cost_price.
10. Tax is NOT included in revenue or gross profit.
===========================================================
*/


/*
===========================================================
SCOPE HELPERS
===========================================================
*/

const normalizeMode = value =>
    String(value || "").trim().toLowerCase() === "branch"
        ? "branch"
        : "business";


const getSessionScope = req =>
    req.session?.inventoryScope ||
    req.session?.productPerformanceScope ||
    null;


/*
===========================================================
RESOLVE BUSINESS / BRANCH SCOPE
===========================================================
*/

async function resolveProductPerformanceScope(req) {

    const user =
        req.user ||
        req.session?.user;

    if (!user?.business_id) {

        const error = new Error(
            "Missing authenticated business context."
        );

        error.statusCode = 403;

        throw error;
    }


    const businessId =
        Number(user.business_id);


    if (
        !Number.isInteger(businessId) ||
        businessId <= 0
    ) {

        const error = new Error(
            "Invalid business context."
        );

        error.statusCode = 403;

        throw error;
    }


    const sessionScope =
        getSessionScope(req);


    const requestedMode =
        req.query?.scope ??
        req.query?.mode ??
        sessionScope?.mode;


    const mode =
        normalizeMode(requestedMode);


    let branchId = null;


    /*
    =======================================================
    BRANCH MODE
    =======================================================
    */

    if (mode === "branch") {

        const requestedBranch =
            req.query?.branch_id ??
            req.query?.branchId ??
            sessionScope?.branch_id;


        branchId =
            Number(requestedBranch);


        if (
            !Number.isInteger(branchId) ||
            branchId <= 0
        ) {

            const error = new Error(
                "A valid branch must be selected."
            );

            error.statusCode = 400;

            throw error;
        }


        /*
        ---------------------------------------------------
        VERIFY BRANCH BELONGS TO BUSINESS
        ---------------------------------------------------
        */

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
            [
                branchId,
                businessId
            ]
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

            businessName:
                user.Business_name ||
                null,

            branchName:
                branches[0].branch_name,

            branchLocation:
                branches[0].location ||
                null
        };
    }


    /*
    =======================================================
    BUSINESS MODE
    =======================================================
    */

    return {

        businessId,

        branchId: null,

        mode: "business",

        businessName:
            user.Business_name ||
            null,

        branchName: null,

        branchLocation: null
    };
}


/*
===========================================================
SCOPE CTE
===========================================================

This gives every query:

business_id
branch_id
mode
===========================================================
*/

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


/*
===========================================================
SCOPING HELPERS
===========================================================
*/

function scopedProducts(
    alias = "p",
    scopeAlias = "sc"
) {

    return `
        ${alias}.business_id =
            ${scopeAlias}.business_id

        AND (
            ${scopeAlias}.mode = 'business'

            OR

            ${alias}.branch_id =
                ${scopeAlias}.branch_id
        )
    `;
}


function scopedStock(
    alias = "st",
    scopeAlias = "sc"
) {

    return `
        ${alias}.business_id =
            ${scopeAlias}.business_id

        AND (
            ${scopeAlias}.mode = 'business'

            OR

            ${alias}.branch_id =
                ${scopeAlias}.branch_id
        )
    `;
}


function scopedSales(
    alias = "s",
    scopeAlias = "sc"
) {

    return `
        ${alias}.business_id =
            ${scopeAlias}.business_id

        AND (
            ${scopeAlias}.mode = 'business'

            OR

            ${alias}.branch_id =
                ${scopeAlias}.branch_id
        )
    `;
}


function scopedSalesItem(
    alias = "si",
    scopeAlias = "sc"
) {

    return `
        ${alias}.business_id =
            ${scopeAlias}.business_id

        AND (
            ${scopeAlias}.mode = 'business'

            OR

            ${alias}.branch_id =
                ${scopeAlias}.branch_id
        )
    `;
}


/*
===========================================================
QUERY EXECUTOR
===========================================================
*/

async function execute(scope, query) {

    return db.query(
        query.sql,
        query.params || []
    );
}


/*
===========================================================
PP01 — KPI SUMMARY
===========================================================
*/

function kpiQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH

            ${scopeInfo.sql},

            product_sales AS (

                SELECT

                    si.product_id,

                    SUM(
                        COALESCE(si.quantity, 0)
                    ) AS units_sold,

                    SUM(
                        COALESCE(si.total_price, 0)
                    ) AS gross_sales,

                    SUM(
                        CASE

                            WHEN COALESCE(s.subtotal, 0) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END
                    ) AS allocated_discount,

                    SUM(
                        COALESCE(si.quantity, 0)
                        *
                        COALESCE(si.cost_price, 0)
                    ) AS cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                CROSS JOIN scope sc

                WHERE

                    s.sale_status = 'Completed'

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                GROUP BY
                    si.product_id
            ),

            product_metrics AS (

                SELECT

                    product_id,

                    units_sold,

                    gross_sales,

                    allocated_discount,

                    (
                        gross_sales
                        - allocated_discount
                    ) AS net_revenue,

                    cogs,

                    (
                        gross_sales
                        - allocated_discount
                        - cogs
                    ) AS gross_profit

                FROM product_sales
            )

            SELECT

                (
                    SELECT COUNT(*)

                    FROM products p

                    CROSS JOIN scope sc

                    WHERE ${scopedProducts("p", "sc")}

                ) AS total_products,

                COUNT(*) AS products_sold,

                ROUND(
                    COALESCE(
                        SUM(units_sold),
                        0
                    ),
                    3
                ) AS total_units_sold,

                ROUND(
                    COALESCE(
                        SUM(gross_sales),
                        0
                    ),
                    2
                ) AS gross_sales,

                ROUND(
                    COALESCE(
                        SUM(allocated_discount),
                        0
                    ),
                    2
                ) AS total_discount,

                ROUND(
                    COALESCE(
                        SUM(net_revenue),
                        0
                    ),
                    2
                ) AS net_revenue,

                ROUND(
                    COALESCE(
                        SUM(net_revenue),
                        0
                    ),
                    2
                ) AS product_revenue,

                ROUND(
                    COALESCE(
                        SUM(cogs),
                        0
                    ),
                    2
                ) AS total_cogs,

                ROUND(
                    COALESCE(
                        SUM(cogs),
                        0
                    ),
                    2
                ) AS estimated_cogs,

                ROUND(
                    COALESCE(
                        SUM(gross_profit),
                        0
                    ),
                    2
                ) AS gross_profit,

                ROUND(
                    COALESCE(
                        SUM(gross_profit),
                        0
                    ),
                    2
                ) AS estimated_gross_profit,

                ROUND(

                    CASE

                        WHEN COALESCE(
                            SUM(net_revenue),
                            0
                        ) > 0

                        THEN
                            (
                                SUM(gross_profit)
                                /
                                SUM(net_revenue)
                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS gross_profit_margin,

                ROUND(

                    CASE

                        WHEN COALESCE(
                            SUM(net_revenue),
                            0
                        ) > 0

                        THEN
                            (
                                SUM(gross_profit)
                                /
                                SUM(net_revenue)
                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS profit_margin_percent,

                ROUND(

                    CASE

                        WHEN COALESCE(
                            SUM(units_sold),
                            0
                        ) > 0

                        THEN
                            SUM(net_revenue)
                            /
                            SUM(units_sold)

                        ELSE 0

                    END,

                    2

                ) AS average_revenue_per_unit,

                ROUND(

                    CASE

                        WHEN COALESCE(
                            SUM(units_sold),
                            0
                        ) > 0

                        THEN
                            SUM(gross_profit)
                            /
                            SUM(units_sold)

                        ELSE 0

                    END,

                    2

                ) AS average_profit_per_unit

            FROM product_metrics;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP02 — COMPLETE PRODUCT PERFORMANCE
===========================================================
*/

function productPerformanceQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH

            ${scopeInfo.sql},

            product_sales AS (

                SELECT

                    si.product_id,

                    SUM(
                        COALESCE(si.quantity, 0)
                    ) AS units_sold,

                    SUM(
                        COALESCE(si.total_price, 0)
                    ) AS gross_sales,

                    SUM(
                        CASE

                            WHEN COALESCE(s.subtotal, 0) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END
                    ) AS allocated_discount,

                    SUM(
                        COALESCE(si.quantity, 0)
                        *
                        COALESCE(si.cost_price, 0)
                    ) AS cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                CROSS JOIN scope sc

                WHERE

                    s.sale_status = 'Completed'

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                GROUP BY
                    si.product_id
            ),

            product_metrics AS (

                SELECT

                    ps.product_id,

                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,

                    ps.units_sold,

                    ps.gross_sales,

                    ps.allocated_discount,

                    (
                        ps.gross_sales
                        - ps.allocated_discount
                    ) AS net_revenue,

                    (
                        ps.gross_sales
                        - ps.allocated_discount
                        - ps.cogs
                    ) AS gross_profit,

                    ps.cogs

                FROM product_sales ps

                INNER JOIN products p
                    ON p.product_id =
                       ps.product_id

                CROSS JOIN scope sc

                WHERE ${scopedProducts("p", "sc")}
            ),

            total_revenue AS (

                SELECT

                    COALESCE(
                        SUM(net_revenue),
                        0
                    ) AS total_product_revenue

                FROM product_metrics
            )

            SELECT

                pm.product_id,

                pm.product_name,

                pm.category,

                pm.brand,

                pm.unit,

                ROUND(
                    pm.units_sold,
                    3
                ) AS units_sold,

                ROUND(
                    pm.gross_sales,
                    2
                ) AS gross_sales,

                ROUND(
                    pm.allocated_discount,
                    2
                ) AS discount,

                ROUND(
                    pm.allocated_discount,
                    2
                ) AS allocated_discount,

                ROUND(
                    pm.net_revenue,
                    2
                ) AS net_revenue,

                ROUND(
                    pm.net_revenue,
                    2
                ) AS revenue,

                ROUND(
                    pm.cogs,
                    2
                ) AS cogs,

                ROUND(
                    pm.cogs,
                    2
                ) AS estimated_cogs,

                ROUND(
                    pm.gross_profit,
                    2
                ) AS gross_profit,

                ROUND(
                    pm.gross_profit,
                    2
                ) AS estimated_profit,

                ROUND(

                    CASE

                        WHEN pm.net_revenue > 0

                        THEN
                            (
                                pm.gross_profit
                                /
                                pm.net_revenue
                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS profit_margin,

                ROUND(

                    CASE

                        WHEN pm.net_revenue > 0

                        THEN
                            (
                                pm.gross_profit
                                /
                                pm.net_revenue
                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS profit_margin_percent,

                ROUND(

                    CASE

                        WHEN
                            tr.total_product_revenue > 0

                        THEN
                            (
                                pm.net_revenue
                                /
                                tr.total_product_revenue
                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS revenue_contribution_percent

            FROM product_metrics pm

            CROSS JOIN total_revenue tr

            ORDER BY
                pm.net_revenue DESC;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP03 — TOP 10 BY UNITS SOLD
===========================================================
*/

function topUnitsQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH ${scopeInfo.sql}

            SELECT

                si.product_id,

                p.product_name,

                p.category,

                p.brand,

                ROUND(
                    SUM(
                        COALESCE(si.quantity, 0)
                    ),
                    3
                ) AS units_sold,

                ROUND(
                    SUM(
                        COALESCE(si.total_price, 0)
                    ),
                    2
                ) AS gross_sales

            FROM sales_item si

            INNER JOIN sales s
                ON s.sale_id = si.sale_id

            INNER JOIN products p
                ON p.product_id = si.product_id

            CROSS JOIN scope sc

            WHERE

                s.sale_status = 'Completed'

                AND ${scopedSalesItem("si", "sc")}

                AND ${scopedSales("s", "sc")}

                AND ${scopedProducts("p", "sc")}

            GROUP BY

                si.product_id,
                p.product_name,
                p.category,
                p.brand

            ORDER BY
                units_sold DESC,
                gross_sales DESC,
                p.product_name ASC

            LIMIT 10;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP04 — TOP 10 BY REVENUE
===========================================================
*/

function topRevenueQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH

            ${scopeInfo.sql},

            product_sales AS (

                SELECT

                    si.product_id,

                    SUM(
                        COALESCE(si.quantity, 0)
                    ) AS units_sold,

                    SUM(
                        COALESCE(si.total_price, 0)
                    ) AS gross_sales,

                    SUM(
                        CASE

                            WHEN COALESCE(s.subtotal, 0) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END
                    ) AS allocated_discount,

                    SUM(
                        COALESCE(si.quantity, 0)
                        *
                        COALESCE(si.cost_price, 0)
                    ) AS cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                CROSS JOIN scope sc

                WHERE

                    s.sale_status = 'Completed'

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                GROUP BY
                    si.product_id
            ),

            product_metrics AS (

                SELECT

                    ps.product_id,

                    p.product_name,
                    p.category,
                    p.brand,

                    ps.units_sold,
                    ps.gross_sales,
                    ps.allocated_discount,

                    (
                        ps.gross_sales
                        -
                        ps.allocated_discount
                    ) AS net_revenue,

                    (
                        ps.gross_sales
                        -
                        ps.allocated_discount
                        -
                        ps.cogs
                    ) AS gross_profit,

                    ps.cogs

                FROM product_sales ps

                INNER JOIN products p
                    ON p.product_id =
                       ps.product_id

                CROSS JOIN scope sc

                WHERE ${scopedProducts("p", "sc")}
            )

            SELECT

                pm.product_id,

                pm.product_name,

                pm.category,

                pm.brand,

                ROUND(
                    pm.units_sold,
                    3
                ) AS units_sold,

                ROUND(
                    pm.gross_sales,
                    2
                ) AS gross_sales,

                ROUND(
                    pm.allocated_discount,
                    2
                ) AS discount,

                ROUND(
                    pm.net_revenue,
                    2
                ) AS net_revenue,

                ROUND(
                    pm.cogs,
                    2
                ) AS cogs,

                ROUND(
                    pm.gross_profit,
                    2
                ) AS gross_profit,

                ROUND(

                    CASE

                        WHEN pm.net_revenue > 0

                        THEN
                            (
                                pm.gross_profit
                                /
                                pm.net_revenue
                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS profit_margin

            FROM product_metrics pm

            ORDER BY
                pm.net_revenue DESC,
                pm.gross_profit DESC,
                pm.product_name ASC

            LIMIT 10;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP05 — TOP 10 MOST PROFITABLE
===========================================================
*/

function topProfitQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH ${scopeInfo.sql}

            SELECT

                si.product_id,

                p.product_name,

                p.category,

                ROUND(

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    )

                    -

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ),

                    2

                ) AS gross_profit

            FROM sales_item si

            INNER JOIN sales s
                ON s.sale_id = si.sale_id

            INNER JOIN products p
                ON p.product_id = si.product_id

            CROSS JOIN scope sc

            WHERE

                s.sale_status = 'Completed'

                AND ${scopedSalesItem("si", "sc")}

                AND ${scopedSales("s", "sc")}

                AND ${scopedProducts("p", "sc")}

            GROUP BY

                si.product_id,
                p.product_name,
                p.category

            ORDER BY
                gross_profit DESC,
                product_name ASC

            LIMIT 10;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP06 — LOWEST PROFIT PRODUCTS
===========================================================
*/

function lowestProfitQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH

            ${scopeInfo.sql},

            product_sales AS (

                SELECT

                    si.product_id,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                    ) AS units_sold,

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    ) AS gross_sales,

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ) AS allocated_discount,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ) AS cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                CROSS JOIN scope sc

                WHERE

                    s.sale_status = 'Completed'

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                GROUP BY
                    si.product_id
            ),

            product_metrics AS (

                SELECT

                    product_id,

                    units_sold,

                    (
                        gross_sales
                        -
                        allocated_discount
                    ) AS net_revenue,

                    (
                        gross_sales
                        -
                        allocated_discount
                        -
                        cogs
                    ) AS gross_profit

                FROM product_sales
            )

            SELECT

                pm.product_id,

                p.product_name,

                p.category,

                ROUND(
                    pm.units_sold,
                    3
                ) AS units_sold,

                ROUND(
                    pm.net_revenue,
                    2
                ) AS net_revenue,

                ROUND(
                    pm.gross_profit,
                    2
                ) AS gross_profit,

                ROUND(

                    CASE

                        WHEN pm.net_revenue > 0

                        THEN
                            (
                                pm.gross_profit
                                /
                                pm.net_revenue
                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS profit_margin

            FROM product_metrics pm

            INNER JOIN products p
                ON p.product_id =
                   pm.product_id

            CROSS JOIN scope sc

            WHERE ${scopedProducts("p", "sc")}

            ORDER BY
                pm.gross_profit ASC,
                p.product_name ASC

            LIMIT 10;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP07 — HIGHEST PROFIT MARGIN
===========================================================
*/

function marginQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH

            ${scopeInfo.sql},

            product_sales AS (

                SELECT

                    si.product_id,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                    ) AS units_sold,

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    ) AS gross_sales,

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ) AS allocated_discount,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ) AS cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                CROSS JOIN scope sc

                WHERE

                    s.sale_status = 'Completed'

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                GROUP BY
                    si.product_id
            ),

            product_metrics AS (

                SELECT

                    product_id,

                    units_sold,

                    (
                        gross_sales
                        -
                        allocated_discount
                    ) AS net_revenue,

                    (
                        gross_sales
                        -
                        allocated_discount
                        -
                        cogs
                    ) AS gross_profit

                FROM product_sales
            )

            SELECT

                pm.product_id,

                p.product_name,

                p.category,

                ROUND(
                    pm.units_sold,
                    3
                ) AS units_sold,

                ROUND(
                    pm.net_revenue,
                    2
                ) AS net_revenue,

                ROUND(
                    pm.gross_profit,
                    2
                ) AS gross_profit,

                ROUND(

                    CASE

                        WHEN pm.net_revenue > 0

                        THEN
                            (
                                pm.gross_profit
                                /
                                pm.net_revenue
                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS profit_margin

            FROM product_metrics pm

            INNER JOIN products p
                ON p.product_id =
                   pm.product_id

            CROSS JOIN scope sc

            WHERE ${scopedProducts("p", "sc")}

            ORDER BY
                profit_margin DESC,
                pm.gross_profit DESC,
                p.product_name ASC

            LIMIT 10;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP11 — CATEGORY PERFORMANCE
===========================================================
*/

function categoryQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH ${scopeInfo.sql}

            SELECT

                COALESCE(
                    p.category,
                    'Uncategorized'
                ) AS category,

                SUM(
                    COALESCE(
                        si.quantity,
                        0
                    )
                ) AS units_sold,

                ROUND(

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ),

                    2

                ) AS net_revenue,

                ROUND(

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ),

                    2

                ) AS cogs,

                ROUND(

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    )

                    -

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ),

                    2

                ) AS gross_profit

            FROM sales_item si

            INNER JOIN sales s
                ON s.sale_id = si.sale_id

            INNER JOIN products p
                ON p.product_id = si.product_id

            CROSS JOIN scope sc

            WHERE

                s.sale_status = 'Completed'

                AND ${scopedSalesItem("si", "sc")}

                AND ${scopedSales("s", "sc")}

                AND ${scopedProducts("p", "sc")}

            GROUP BY
                COALESCE(
                    p.category,
                    'Uncategorized'
                )

            ORDER BY
                net_revenue DESC,
                category ASC;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP13 — PRODUCT SALES TREND BY MONTH
===========================================================
*/

function salesTrendQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH ${scopeInfo.sql}

            SELECT

                DATE_FORMAT(
                    s.created_at,
                    '%Y-%m'
                ) AS month,

                p.product_id,

                p.product_name,

                SUM(
                    COALESCE(
                        si.quantity,
                        0
                    )
                ) AS units_sold,

                ROUND(

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ),

                    2

                ) AS net_revenue

            FROM sales_item si

            INNER JOIN sales s
                ON s.sale_id = si.sale_id

            INNER JOIN products p
                ON p.product_id = si.product_id

            CROSS JOIN scope sc

            WHERE

                s.sale_status = 'Completed'

                AND ${scopedSalesItem("si", "sc")}

                AND ${scopedSales("s", "sc")}

                AND ${scopedProducts("p", "sc")}

            GROUP BY

                DATE_FORMAT(
                    s.created_at,
                    '%Y-%m'
                ),

                p.product_id,

                p.product_name

            ORDER BY
                month ASC,
                net_revenue DESC,
                p.product_name ASC;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP14 — PRODUCT PROFIT TREND BY MONTH
===========================================================
*/

function profitTrendQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH ${scopeInfo.sql}

            SELECT

                DATE_FORMAT(
                    s.created_at,
                    '%Y-%m'
                ) AS month,

                p.product_id,

                p.product_name,

                ROUND(

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ),

                    2

                ) AS net_revenue,

                ROUND(

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ),

                    2

                ) AS cogs,

                ROUND(

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    )

                    -

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ),

                    2

                ) AS gross_profit

            FROM sales_item si

            INNER JOIN sales s
                ON s.sale_id = si.sale_id

            INNER JOIN products p
                ON p.product_id = si.product_id

            CROSS JOIN scope sc

            WHERE

                s.sale_status = 'Completed'

                AND ${scopedSalesItem("si", "sc")}

                AND ${scopedSales("s", "sc")}

                AND ${scopedProducts("p", "sc")}

            GROUP BY

                DATE_FORMAT(
                    s.created_at,
                    '%Y-%m'
                ),

                p.product_id,

                p.product_name

            ORDER BY
                month ASC,
                gross_profit DESC,
                p.product_name ASC;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP15 — PRODUCT PERFORMANCE + CURRENT INVENTORY
===========================================================
*/

function inventoryQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH

            ${scopeInfo.sql},

            product_sales AS (

                SELECT

                    si.product_id,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                    ) AS units_sold,

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ) AS net_revenue,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ) AS cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                CROSS JOIN scope sc

                WHERE

                    s.sale_status = 'Completed'

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                GROUP BY
                    si.product_id
            ),

            current_stock AS (

                SELECT

                    st.product_id,

                    SUM(
                        COALESCE(
                            st.quantity_available,
                            0
                        )
                    ) AS quantity_available

                FROM stock st

                CROSS JOIN scope sc

                WHERE
                    ${scopedStock("st", "sc")}

                GROUP BY
                    st.product_id
            )

            SELECT

                p.product_id,

                p.product_name,

                p.category,

                ps.units_sold,

                ROUND(
                    ps.net_revenue,
                    2
                ) AS net_revenue,

                ROUND(
                    ps.cogs,
                    2
                ) AS cogs,

                ROUND(
                    ps.net_revenue - ps.cogs,
                    2
                ) AS gross_profit,

                COALESCE(
                    cs.quantity_available,
                    0
                ) AS current_stock,

                ROUND(

                    COALESCE(
                        cs.quantity_available,
                        0
                    )
                    *
                    COALESCE(
                        p.cost_price,
                        0
                    ),

                    2

                ) AS current_inventory_value

            FROM product_sales ps

            INNER JOIN products p
                ON p.product_id =
                   ps.product_id

            LEFT JOIN current_stock cs
                ON cs.product_id =
                   ps.product_id

            CROSS JOIN scope sc

            WHERE
                ${scopedProducts("p", "sc")}

            ORDER BY
                net_revenue DESC,
                p.product_name ASC;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP16 — PRODUCTS NEVER SOLD / DEAD STOCK
===========================================================
*/

function neverSoldQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH

            ${scopeInfo.sql},

            never_sold_products AS (

                SELECT

                    p.product_id,

                    p.product_name,

                    p.category,

                    p.brand,

                    p.unit,

                    p.selling_price,

                    p.cost_price

                FROM products p

                CROSS JOIN scope sc

                WHERE

                    ${scopedProducts("p", "sc")}

                    AND NOT EXISTS (

                        SELECT 1

                        FROM sales_item si

                        INNER JOIN sales s
                            ON s.sale_id =
                               si.sale_id

                        WHERE

                            si.product_id =
                                p.product_id

                            AND s.sale_status =
                                'Completed'

                            AND si.business_id =
                                sc.business_id

                            AND s.business_id =
                                sc.business_id

                            AND (
                                sc.mode = 'business'

                                OR

                                si.branch_id =
                                    sc.branch_id
                            )

                            AND (
                                sc.mode = 'business'

                                OR

                                s.branch_id =
                                    sc.branch_id
                            )
                    )
            ),

            current_stock AS (

                SELECT

                    st.product_id,

                    SUM(
                        COALESCE(
                            st.quantity_available,
                            0
                        )
                    ) AS current_stock

                FROM stock st

                CROSS JOIN scope sc

                WHERE
                    ${scopedStock("st", "sc")}

                GROUP BY
                    st.product_id
            )

            SELECT

                nsp.product_id,

                nsp.product_name,

                nsp.category,

                COALESCE(
                    nsp.brand,
                    'No Brand'
                ) AS brand,

                nsp.unit,

                COALESCE(
                    cs.current_stock,
                    0
                ) AS current_stock,

                ROUND(
                    COALESCE(
                        nsp.cost_price,
                        0
                    ),
                    2
                ) AS cost_price,

                ROUND(

                    COALESCE(
                        cs.current_stock,
                        0
                    )
                    *
                    COALESCE(
                        nsp.cost_price,
                        0
                    ),

                    2

                ) AS inventory_value,

                ROUND(
                    COALESCE(
                        nsp.selling_price,
                        0
                    ),
                    2
                ) AS selling_price,

                ROUND(

                    COALESCE(
                        cs.current_stock,
                        0
                    )
                    *
                    COALESCE(
                        nsp.selling_price,
                        0
                    ),

                    2

                ) AS potential_sales_value

            FROM never_sold_products nsp

            LEFT JOIN current_stock cs
                ON cs.product_id =
                   nsp.product_id

            ORDER BY

                inventory_value DESC,

                nsp.product_name ASC;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP17 — BRAND PERFORMANCE
===========================================================
*/

function brandQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH ${scopeInfo.sql}

            SELECT

                COALESCE(
                    p.brand,
                    'No Brand'
                ) AS brand,

                SUM(
                    COALESCE(
                        si.quantity,
                        0
                    )
                ) AS units_sold,

                ROUND(

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ),

                    2

                ) AS net_revenue,

                ROUND(

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ),

                    2

                ) AS cogs,

                ROUND(

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    )

                    -

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    )

                    -

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ),

                    2

                ) AS gross_profit

            FROM sales_item si

            INNER JOIN sales s
                ON s.sale_id = si.sale_id

            INNER JOIN products p
                ON p.product_id = si.product_id

            CROSS JOIN scope sc

            WHERE

                s.sale_status = 'Completed'

                AND ${scopedSalesItem("si", "sc")}

                AND ${scopedSales("s", "sc")}

                AND ${scopedProducts("p", "sc")}

            GROUP BY
                COALESCE(
                    p.brand,
                    'No Brand'
                )

            ORDER BY
                net_revenue DESC,
                brand ASC;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
PP18 — DAILY SALES & PROFIT — LAST 7 DAYS
===========================================================
*/

function dailyTrendQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH RECURSIVE

            ${scopeInfo.sql},

            calendar AS (

                SELECT
                    CURDATE()
                    - INTERVAL 6 DAY
                    AS report_date

                UNION ALL

                SELECT
                    report_date
                    + INTERVAL 1 DAY

                FROM calendar

                WHERE report_date <
                      CURDATE()
            ),

            daily_sales AS (

                SELECT

                    DATE(
                        s.created_at
                    ) AS report_date,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                    ) AS units_sold,

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    ) AS gross_sales,

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ) AS allocated_discount,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ) AS cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                CROSS JOIN scope sc

                WHERE

                    s.sale_status = 'Completed'

                    AND s.created_at >=
                        CURDATE()
                        - INTERVAL 6 DAY

                    AND s.created_at <
                        CURDATE()
                        + INTERVAL 1 DAY

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                GROUP BY
                    DATE(s.created_at)
            )

            SELECT

                c.report_date,

                DATE_FORMAT(
                    c.report_date,
                    '%a'
                ) AS day_name,

                DATE_FORMAT(
                    c.report_date,
                    '%d %b'
                ) AS display_date,

                ROUND(
                    COALESCE(
                        ds.units_sold,
                        0
                    ),
                    3
                ) AS units_sold,

                ROUND(
                    COALESCE(
                        ds.gross_sales,
                        0
                    ),
                    2
                ) AS gross_sales,

                ROUND(
                    COALESCE(
                        ds.allocated_discount,
                        0
                    ),
                    2
                ) AS discount,

                ROUND(

                    COALESCE(
                        ds.gross_sales,
                        0
                    )

                    -

                    COALESCE(
                        ds.allocated_discount,
                        0
                    ),

                    2

                ) AS net_revenue,

                ROUND(
                    COALESCE(
                        ds.cogs,
                        0
                    ),
                    2
                ) AS cogs,

                ROUND(

                    COALESCE(
                        ds.gross_sales,
                        0
                    )

                    -

                    COALESCE(
                        ds.allocated_discount,
                        0
                    )

                    -

                    COALESCE(
                        ds.cogs,
                        0
                    ),

                    2

                ) AS gross_profit,

                ROUND(

                    CASE

                        WHEN

                            (
                                COALESCE(
                                    ds.gross_sales,
                                    0
                                )

                                -

                                COALESCE(
                                    ds.allocated_discount,
                                    0
                                )
                            ) > 0

                        THEN

                            (

                                (
                                    COALESCE(
                                        ds.gross_sales,
                                        0
                                    )

                                    -

                                    COALESCE(
                                        ds.allocated_discount,
                                        0
                                    )

                                    -

                                    COALESCE(
                                        ds.cogs,
                                        0
                                    )
                                )

                                /

                                (
                                    COALESCE(
                                        ds.gross_sales,
                                        0
                                    )

                                    -

                                    COALESCE(
                                        ds.allocated_discount,
                                        0
                                    )
                                )

                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS profit_margin

            FROM calendar c

            LEFT JOIN daily_sales ds
                ON ds.report_date =
                   c.report_date

            ORDER BY
                c.report_date ASC;
        `,

        params:
            scopeInfo.params
    };
}


function weeklyTrendQuery(scope) {

    const scopeInfo =
        scopeCte(scope);

    return {

        sql: `
            WITH RECURSIVE

            ${scopeInfo.sql},

            weeks AS (

                SELECT

                    DATE_SUB(

                        DATE_SUB(
                            CURDATE(),
                            INTERVAL
                            WEEKDAY(CURDATE())
                            DAY
                        ),

                        INTERVAL 7 DAY

                    ) AS week_start

                UNION ALL

                SELECT

                    week_start
                    - INTERVAL 7 DAY

                FROM weeks

                WHERE week_start >

                    DATE_SUB(

                        DATE_SUB(
                            CURDATE(),
                            INTERVAL
                            WEEKDAY(CURDATE())
                            DAY
                        ),

                        INTERVAL 49 DAY
                    )
            ),

            weekly_sales AS (

                SELECT

                    DATE_SUB(

                        DATE(
                            s.created_at
                        ),

                        INTERVAL
                        WEEKDAY(
                            s.created_at
                        )
                        DAY

                    ) AS week_start,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                    ) AS units_sold,

                    SUM(
                        COALESCE(
                            si.total_price,
                            0
                        )
                    ) AS gross_sales,

                    SUM(

                        CASE

                            WHEN
                                COALESCE(
                                    s.subtotal,
                                    0
                                ) > 0

                            THEN
                                (
                                    COALESCE(
                                        si.total_price,
                                        0
                                    )
                                    /
                                    s.subtotal
                                )
                                *
                                (
                                    s.subtotal
                                    *
                                    (
                                        COALESCE(
                                            s.discount,
                                            0
                                        ) / 100
                                    )
                                )

                            ELSE 0

                        END

                    ) AS allocated_discount,

                    SUM(
                        COALESCE(
                            si.quantity,
                            0
                        )
                        *
                        COALESCE(
                            si.cost_price,
                            0
                        )
                    ) AS cogs

                FROM sales_item si

                INNER JOIN sales s
                    ON s.sale_id = si.sale_id

                CROSS JOIN scope sc

                WHERE

                    s.sale_status = 'Completed'

                    AND s.created_at >=

                        DATE_SUB(

                            DATE_SUB(
                                CURDATE(),
                                INTERVAL
                                WEEKDAY(CURDATE())
                                DAY
                            ),

                            INTERVAL 49 DAY
                        )

                    AND s.created_at <

                        DATE_SUB(
                            CURDATE(),
                            INTERVAL
                            WEEKDAY(CURDATE())
                            DAY
                        )

                    AND ${scopedSalesItem("si", "sc")}

                    AND ${scopedSales("s", "sc")}

                GROUP BY

                    DATE_SUB(

                        DATE(
                            s.created_at
                        ),

                        INTERVAL
                        WEEKDAY(
                            s.created_at
                        )
                        DAY
                    )
            )

            SELECT

                w.week_start,

                DATE_ADD(
                    w.week_start,
                    INTERVAL 6 DAY
                ) AS week_end,

                CONCAT(

                    DATE_FORMAT(
                        w.week_start,
                        '%d %b'
                    ),

                    ' - ',

                    DATE_FORMAT(

                        DATE_ADD(
                            w.week_start,
                            INTERVAL 6 DAY
                        ),

                        '%d %b'
                    )

                ) AS week_label,

                ROUND(
                    COALESCE(
                        ws.units_sold,
                        0
                    ),
                    3
                ) AS units_sold,

                ROUND(
                    COALESCE(
                        ws.gross_sales,
                        0
                    ),
                    2
                ) AS gross_sales,

                ROUND(
                    COALESCE(
                        ws.allocated_discount,
                        0
                    ),
                    2
                ) AS discount,

                ROUND(

                    COALESCE(
                        ws.gross_sales,
                        0
                    )

                    -

                    COALESCE(
                        ws.allocated_discount,
                        0
                    ),

                    2

                ) AS net_revenue,

                ROUND(
                    COALESCE(
                        ws.cogs,
                        0
                    ),
                    2
                ) AS cogs,

                ROUND(

                    COALESCE(
                        ws.gross_sales,
                        0
                    )

                    -

                    COALESCE(
                        ws.allocated_discount,
                        0
                    )

                    -

                    COALESCE(
                        ws.cogs,
                        0
                    ),

                    2

                ) AS gross_profit,

                ROUND(

                    CASE

                        WHEN

                            (
                                COALESCE(
                                    ws.gross_sales,
                                    0
                                )

                                -

                                COALESCE(
                                    ws.allocated_discount,
                                    0
                                )
                            ) > 0

                        THEN

                            (

                                (
                                    COALESCE(
                                        ws.gross_sales,
                                        0
                                    )

                                    -

                                    COALESCE(
                                        ws.allocated_discount,
                                        0
                                    )

                                    -

                                    COALESCE(
                                        ws.cogs,
                                        0
                                    )
                                )

                                /

                                (
                                    COALESCE(
                                        ws.gross_sales,
                                        0
                                    )

                                    -

                                    COALESCE(
                                        ws.allocated_discount,
                                        0
                                    )
                                )

                            ) * 100

                        ELSE 0

                    END,

                    2

                ) AS profit_margin

            FROM weeks w

            LEFT JOIN weekly_sales ws
                ON ws.week_start =
                   w.week_start

            ORDER BY
                w.week_start ASC

            LIMIT 7;
        `,

        params:
            scopeInfo.params
    };
}


/*
===========================================================
MAIN CONTROLLER
===========================================================
*/

const productPerformance = async (
    req,
    res
) => {

    try {

        const scope =
            await resolveProductPerformanceScope(req);


        const [branchRows] =
            await db.query(
                `
                SELECT

                    branch_id,

                    branch_name,

                    location

                FROM branches

                WHERE business_id = ?

                  AND is_active = 1

                ORDER BY
                    branch_name ASC
                `,
                [
                    scope.businessId
                ]
            );


        const [

            [kpiRows],

            [productRows],

            [topUnitsRows],

            [topRevenueRows],

            [topProfitRows],

            [lowestProfitRows],

            [marginRows],

            [categoryRows],

            [salesTrendRows],

            [profitTrendRows],

            [inventoryRows],

            [neverSoldRows],

            [brandRows],

            [dailyTrendRows],

            [weeklyTrendRows]

        ] = await Promise.all([

            execute(
                scope,
                kpiQuery(scope)
            ),

            execute(
                scope,
                productPerformanceQuery(scope)
            ),

            execute(
                scope,
                topUnitsQuery(scope)
            ),

            execute(
                scope,
                topRevenueQuery(scope)
            ),

            execute(
                scope,
                topProfitQuery(scope)
            ),

            execute(
                scope,
                lowestProfitQuery(scope)
            ),

            execute(
                scope,
                marginQuery(scope)
            ),

            execute(
                scope,
                categoryQuery(scope)
            ),

            execute(
                scope,
                salesTrendQuery(scope)
            ),

            execute(
                scope,
                profitTrendQuery(scope)
            ),

            execute(
                scope,
                inventoryQuery(scope)
            ),

            execute(
                scope,
                neverSoldQuery(scope)
            ),

            execute(
                scope,
                brandQuery(scope)
            ),

            execute(
                scope,
                dailyTrendQuery(scope)
            ),

            execute(
                scope,
                weeklyTrendQuery(scope)
            )
        ]);


        const products =
            productRows.map(product => ({

                ...product,

                profit_positive:
                    Number(
                        product.gross_profit
                    ) > 0
            }));


        const inventoryPerformance =
            inventoryRows.map(item => ({

                ...item,

                in_stock:
                    Number(
                        item.current_stock
                    ) > 0
            }));


        return res.render(
            "product-performance",
            {


                scope,

                branches:
                    branchRows,


                kpis:
                    kpiRows[0] || {},

                products,


                topUnits:
                    topUnitsRows,

                topRevenue:
                    topRevenueRows,

                topProfit:
                    topProfitRows,

                lowestProfit:
                    lowestProfitRows,

                highestMargin:
                    marginRows,

                categories:
                    categoryRows,

                brands:
                    brandRows,

                salesTrend:
                    salesTrendRows,

                profitTrend:
                    profitTrendRows,

                dailyTrend:
                    dailyTrendRows,

                weeklyTrend:
                    weeklyTrendRows,


                inventoryPerformance,

                neverSold:
                    neverSoldRows
            }
        );

    } catch (error) {

        console.error(
            "Product Performance Controller Error:",
            error
        );


        return res.status(
            error.statusCode || 500
        ).send(

            error.statusCode
                ? error.message
                : "Unable to load Product Performance Dashboard."
        );
    }
};



module.exports = {
    productPerformance
};