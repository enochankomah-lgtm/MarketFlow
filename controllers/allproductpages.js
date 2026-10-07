const db = require("../Database/db");


/* =========================================================================
   AUTHENTICATION / AUTHORIZATION
========================================================================= */

function getUser(req) {
    const source = req.user || req.session?.user || null;

    if (!source) {
        return null;
    }

    return {
        ...source,
        id: source.id ?? source.UserID ?? null,
        UserID: source.UserID ?? source.id ?? null,
        business_id: source.business_id ?? null,
        branch_id: source.branch_id ?? null,
        RoleName: source.RoleName ?? source.role ?? "",
        email: source.email ?? source.Email ?? null,
        Email: source.Email ?? source.email ?? null,
        phone: source.phone ?? source.Phone ?? null,
        Phone: source.Phone ?? source.phone ?? null,
        name:
            source.name ||
            [source.FirstName, source.LastName]
                .filter(Boolean)
                .join(" ")
                .trim()
    };
}


function requireBusinessUser(req, res) {
    const user = getUser(req);

    if (
        !user ||
        user.id === null ||
        user.id === undefined ||
        user.business_id === null ||
        user.business_id === undefined
    ) {
        res.status(401).json({
            success: false,
            message: "You are not logged in."
        });

        return null;
    }

    return user;
}

function requireProductManager(req, res) {
const user = requireBusinessUser(req, res);

if (!user) {
    return null;
}

const role = String(user.RoleName || "")
    .trim()
    .toLowerCase();

const allowedRoles = [
    "owner",
    "admin",
    "administrator",
    "manager"
];

if (!allowedRoles.includes(role)) {
    res.status(403).render("403", {
        title: "Access Denied",
        message: "You are not authorized to manage products."
    });

    return null;
}

return user;

}



function requireBranchUser(req, res) {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return null;
    }

    if (
        user.branch_id === null ||
        user.branch_id === undefined ||
        user.branch_id === ""
    ) {
        res.status(403).json({
            success: false,
            message: "Your account is not assigned to a branch."
        });

        return null;
    }

    return user;
}


/* =========================================================================
   TENANT SCOPES
========================================================================= */

function productReadScope(alias, user, params = []) {
    if (user.branch_id) {
        return {
            sql: `
                AND ${alias}.business_id = ?
                AND (
                    ${alias}.branch_id IS NULL
                    OR ${alias}.branch_id = ?
                )
            `,
            params: [
                ...params,
                user.business_id,
                user.branch_id
            ]
        };
    }

    return {
        sql: `
            AND ${alias}.business_id = ?
        `,
        params: [
            ...params,
            user.business_id
        ]
    };
}


function businessWideWriteScope(alias, user, params = []) {
    return {
        sql: `
            AND ${alias}.business_id = ?
            AND ${alias}.branch_id IS NULL
        `,
        params: [
            ...params,
            user.business_id
        ]
    };
}


function branchWriteScope(alias, user, params = []) {
    return {
        sql: `
            AND ${alias}.business_id = ?
            AND ${alias}.branch_id = ?
        `,
        params: [
            ...params,
            user.business_id,
            user.branch_id
        ]
    };
}


function productWriteScope(alias, user, params = []) {
    if (user.branch_id) {
        return branchWriteScope(alias, user, params);
    }

    return businessWideWriteScope(alias, user, params);
}


function stockReadScope(alias, user, params = []) {
    if (user.branch_id) {
        return {
            sql: `
                AND ${alias}.business_id = ?
                AND ${alias}.branch_id = ?
            `,
            params: [
                ...params,
                user.business_id,
                user.branch_id
            ]
        };
    }

    return {
        sql: `
            AND ${alias}.business_id = ?
        `,
        params: [
            ...params,
            user.business_id
        ]
    };
}


function exactBranchScope(alias, user, params = []) {
    return {
        sql: `
            AND ${alias}.business_id = ?
            AND ${alias}.branch_id = ?
        `,
        params: [
            ...params,
            user.business_id,
            user.branch_id
        ]
    };
}


function businessScope(alias, user, params = []) {
    return {
        sql: `
            AND ${alias}.business_id = ?
        `,
        params: [
            ...params,
            user.business_id
        ]
    };
}


/* =========================================================================
   GENERAL HELPERS
========================================================================= */

function normalizeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
}


function money(value) {
    const number = Number(value) || 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
}


function nullableString(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const valueString = String(value).trim();

    return valueString === ""
        ? null
        : valueString;
}
async function createProductMaster(connection, {
    businessId,
    productName
}) {
    const [result] = await connection.query(`
        INSERT INTO product_masters
        (
            business_id,
            product_name
        )
        VALUES (?, ?)
    `, [
        businessId,
        productName
    ]);

    const productMasterId = result.insertId;

    const productCode =
        `PROD-${String(productMasterId).padStart(6, "0")}`;

    await connection.query(`
        UPDATE product_masters
        SET product_code = ?
        WHERE product_master_id = ?
          AND business_id = ?
    `, [
        productCode,
        productMasterId,
        businessId
    ]);

    return {
        productMasterId,
        productCode
    };
}


function sendAlert(res, message, redirect) {
    const safeMessage = String(message)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, " ");

    const safeRedirect = String(redirect)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

    return res.send(`
        <script>
            alert("${safeMessage}");
            window.location.href="${safeRedirect}";
        </script>
    `);
}


function generateInvoiceNumber() {
    return (
        "INV-" +
        Date.now() +
        "-" +
        Math.floor(
            100000 + Math.random() * 900000
        )
    );
}


function normalizePaymentMethod(value) {
    const method = String(value || "Cash").trim();

    const allowed = [
        "Cash",
        "Mobile Money",
        "Card",
        "Bank Transfer",
        "Split Payment"
    ];

    return allowed.includes(method)
        ? method
        : null;
}


/* =========================================================================
   TAX / DISCOUNT
========================================================================= */

async function getTaxAndDiscount(connection, user) {
    const branchId = user.branch_id ?? null;

    const [rows] = await connection.query(`
        SELECT
            tax_rate,
            discount_rate
        FROM tax_discount
        WHERE business_id = ?
          AND (
                branch_id = ?
                OR branch_id IS NULL
          )
        ORDER BY
            CASE
                WHEN branch_id = ? THEN 0
                WHEN branch_id IS NULL THEN 1
                ELSE 2
            END,
            tax_discount_id DESC
        LIMIT 1
    `, [
        user.business_id,
        branchId,
        branchId
    ]);

    return {
        taxRate: Math.max(
            0,
            Number(rows[0]?.tax_rate) || 0
        ),
        discountRate: Math.max(
            0,
            Number(rows[0]?.discount_rate) || 0
        )
    };
}


/* =========================================================================
   CART TOTAL CALCULATION
========================================================================= */

function calculateCartTotals(cartItems, taxRate, discountRate) {
    const subtotal = money(
        cartItems.reduce(
            (sum, item) =>
                sum + Number(item.total_price || 0),
            0
        )
    );

    const safeDiscountRate = Math.min(
        100,
        Math.max(0, Number(discountRate) || 0)
    );

    const safeTaxRate = Math.max(
        0,
        Number(taxRate) || 0
    );

    const discountAmount = money(
        subtotal *
        (safeDiscountRate / 100)
    );

    const amountAfterDiscount = money(
        subtotal - discountAmount
    );

    const taxAmount = money(
        amountAfterDiscount *
        (safeTaxRate / 100)
    );

    const grandTotal = money(
        amountAfterDiscount + taxAmount
    );

    return {
        subtotal,
        discountRate: safeDiscountRate,
        discountAmount,
        taxRate: safeTaxRate,
        taxAmount,
        grandTotal
    };
}


/* =========================================================================
   PRODUCT FOR POS
========================================================================= */

async function getProductForSale(
    connection,
    user,
    productId
) {
    const branchId = user.branch_id;

    const [rows] = await connection.query(`
        SELECT
            p.product_id,
            p.product_name,
            p.selling_price,
            p.cost_price,
            p.branch_id,

            COALESCE(
                (
                    SELECT pd.discount
                    FROM product_discount pd
                    WHERE pd.product_id = p.product_id
                      AND pd.business_id = p.business_id
                      AND (
                            pd.branch_id IS NULL
                            OR pd.branch_id = ?
                      )
                    ORDER BY
                        CASE
                            WHEN pd.branch_id = ? THEN 0
                            WHEN pd.branch_id IS NULL THEN 1
                            ELSE 2
                        END,
                        pd.discount_id DESC
                    LIMIT 1
                ),
                0
            ) AS product_discount

        FROM products p

        WHERE p.product_id = ?
          AND p.business_id = ?
          AND (
                p.branch_id IS NULL
                OR p.branch_id = ?
          )

        LIMIT 1
    `, [
        branchId,
        branchId,
        productId,
        user.business_id,
        branchId
    ]);

    return rows[0] || null;
}


/* =========================================================================
   INVENTORY PAGES
========================================================================= */

exports.getallproductpages = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    return res.render("inventory");
};


exports.getstockintake = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    if (!user.branch_id) {
        return res.status(403).send(
            "Stock intake requires a branch-assigned account."
        );
    }

    return res.render("stockintake");
};

/* =========================================================================
   ADD PRODUCT
========================================================================= */

exports.add = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    const {
        product_name,
        category,
        brand,
        unit,
        cost_price,
        selling_price,
        msrp,
        description,
        supplier_name
    } = req.body;

    const productName =
        String(product_name || "").trim();

    if (!productName) {
        return sendAlert(
            res,
            "Product name is required.",
            "/productpages/inventory"
        );
    }

    const costPrice =
        normalizeNumber(cost_price);

    const sellingPrice =
        normalizeNumber(selling_price);

    if (
        !Number.isFinite(costPrice) ||
        costPrice < 0
    ) {
        return sendAlert(
            res,
            "Invalid cost price.",
            "/productpages/inventory"
        );
    }

    if (
        !Number.isFinite(sellingPrice) ||
        sellingPrice < 0
    ) {
        return sendAlert(
            res,
            "Invalid selling price.",
            "/productpages/inventory"
        );
    }

    let manufacturePrice =
        nullableString(msrp);

    if (manufacturePrice !== null) {
        manufacturePrice =
            normalizeNumber(manufacturePrice);

        if (
            !Number.isFinite(manufacturePrice) ||
            manufacturePrice < 0
        ) {
            return sendAlert(
                res,
                "Invalid MSRP.",
                "/productpages/inventory"
            );
        }
    }

    const productImage = req.file
        ? "/uploads/products/" + req.file.filename
        : null;

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        /* -----------------------------------------------------------------
           AUTHENTICATED TENANT CONTEXT
        ----------------------------------------------------------------- */

        const businessId =
            user.business_id;

        const branchId =
            user.branch_id ?? null;

        if (
            businessId === null ||
            businessId === undefined
        ) {
            await connection.rollback();

            return sendAlert(
                res,
                "Business information is missing.",
                "/productpages/inventory"
            );
        }

        /* -----------------------------------------------------------------
           CREATE PRODUCT MASTER
          ----------------------------------------------------- */

       const { productMasterId } =
            await createProductMaster(connection, {
                businessId,
                productName
            });

        /* -----------------------------------------------------------------
           CREATE BRANCH/BUSINESS PRODUCT
        ----------------------------------------------------------------- */

        const [result] =
            await connection.query(`
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
                productMasterId,
                businessId,
                branchId,
                productName,
                nullableString(category),
                nullableString(brand),
                nullableString(unit),
                nullableString(description),
                productImage,
                money(costPrice),
                money(sellingPrice),
                manufacturePrice === null
                    ? null
                    : money(manufacturePrice),
                nullableString(supplier_name)
            ]);

        /* -----------------------------------------------------------------
           CREATE PRODUCT DISCOUNT RECORD
        ----------------------------------------------------------------- */

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
            businessId,
            branchId,
            result.insertId,
            productName
        ]);

        /* -----------------------------------------------------------------
           COMPLETE TRANSACTION
        ----------------------------------------------------------------- */

        await connection.commit();

        return sendAlert(
            res,
            "Product inserted successfully.",
            "/productpages/inventory"
        );

    } catch (error) {
        await connection.rollback();

        console.error(
            "PRODUCT ADD ERROR:",
            error
        );

        return sendAlert(
            res,
            "Product failed to add.",
            "/productpages/inventory"
        );

    } finally {
        connection.release();
    }
};


/* =========================================================================
   ALL PRODUCTS
========================================================================= */

exports.getallproducts = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    try {
        const productScope =
            productReadScope("p", user);

        const stockScope =
            stockReadScope("s", user);

        const [[summary]] =
            await db.query(`
                SELECT
                    COALESCE(
                        SUM(
                            p.selling_price *
                            s.quantity_received
                        ),
                        0
                    ) AS totalSales,

                    COALESCE(
                        SUM(
                            p.cost_price *
                            s.quantity_received
                        ),
                        0
                    ) AS totalCost,

                    COALESCE(
                        SUM(
                            (
                                p.selling_price -
                                p.cost_price
                            ) *
                            s.quantity_received
                        ),
                        0
                    ) AS totalProfit

                FROM products p

                LEFT JOIN stock s
                    ON p.product_id = s.product_id
                    ${stockScope.sql}

                WHERE 1 = 1
                    ${productScope.sql}
            `, [
                ...stockScope.params,
                ...productScope.params
            ]);

        const [expiryRows] =
            await db.query(`
                SELECT COUNT(*) AS expiringSoon
                FROM stock s
                WHERE s.expiry_date IS NOT NULL
                  AND s.expiry_date <= DATE_ADD(
                        CURDATE(),
                        INTERVAL 30 DAY
                      )
                  ${stockScope.sql}
            `, stockScope.params);

        const [products] =
            await db.query(`
                SELECT
                    p.product_id,
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
                    p.created_at,

                    COALESCE(
                        SUM(s.quantity_received),
                        0
                    ) AS totalreceived,

                    COALESCE(
                        SUM(s.quantity_available),
                        0
                    ) AS totalavailable,

                    COUNT(s.stock_id)
                        AS total_batches

                FROM products p

                LEFT JOIN stock s
                    ON p.product_id = s.product_id
                    ${stockScope.sql}

                WHERE 1 = 1
                    ${productScope.sql}

                GROUP BY
                    p.product_id,
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
                    p.created_at

                ORDER BY p.product_name ASC
            `, [
                ...stockScope.params,
                ...productScope.params
            ]);

        return res.render("products", {
            products,
            totalsales:
                Number(summary.totalSales) || 0,
            totalcost:
                Number(summary.totalCost) || 0,
            totalProfit:
                Number(summary.totalProfit) || 0,
            expiringdate:
                Number(
                    expiryRows[0]?.expiringSoon
                ) || 0
        });

    } catch (error) {
        console.error(
            "GET PRODUCTS ERROR:",
            error
        );

        return res.status(500).send(
            "Failed to get products."
        );
    }
};


/* =========================================================================
   UPDATE PRODUCT
========================================================================= */

exports.updateProduct = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    const {
        product_id,
        product_name,
        category,
        brand,
        unit,
        description,
        cost_price,
        selling_price,
        msrp,
        supplier_name
    } = req.body;

    const productId =
        Number(product_id);

    if (
        !Number.isInteger(productId) ||
        productId <= 0
    ) {
        return res.status(400).send(
            "Valid product ID is required."
        );
    }

    const productName =
        String(product_name || "").trim();

    if (!productName) {
        return res.status(400).send(
            "Product name is required."
        );
    }

    const costPrice =
        normalizeNumber(cost_price);

    const sellingPrice =
        normalizeNumber(selling_price);

    if (!Number.isFinite(costPrice) || costPrice < 0) {
        return res.status(400).send(
            "Invalid cost price."
        );
    }

    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
        return res.status(400).send(
            "Invalid selling price."
        );
    }

    let manufacturePrice =
        nullableString(msrp);

    if (manufacturePrice !== null) {
        manufacturePrice =
            normalizeNumber(manufacturePrice);

        if (
            !Number.isFinite(manufacturePrice) ||
            manufacturePrice < 0
        ) {
            return res.status(400).send(
                "Invalid MSRP."
            );
        }
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        const productScope =
            productWriteScope(
                "p",
                user,
                [productId]
            );

        const [existingProduct] =
            await connection.query(`
                SELECT
                    p.product_id,
                    p.product_image
                FROM products p
                WHERE p.product_id = ?
                ${productScope.sql}
                LIMIT 1
                FOR UPDATE
            `, productScope.params);

        if (existingProduct.length === 0) {
            await connection.rollback();

            return res.status(404).send(
                "Product not found."
            );
        }

        let productImage =
            existingProduct[0].product_image;

        if (req.file) {
            productImage =
                "/uploads/products/" +
                req.file.filename;
        }

        await connection.query(`
            UPDATE products p
            SET
                p.product_name = ?,
                p.category = ?,
                p.brand = ?,
                p.unit = ?,
                p.description = ?,
                p.product_image = ?,
                p.cost_price = ?,
                p.selling_price = ?,
                p.msrp = ?,
                p.supplier_name = ?
            WHERE p.product_id = ?
            ${productScope.sql}
        `, [
            productName,
            nullableString(category),
            nullableString(brand),
            nullableString(unit),
            nullableString(description),
            productImage,
            money(costPrice),
            money(sellingPrice),
            manufacturePrice === null
                ? null
                : money(manufacturePrice),
            nullableString(supplier_name),
            productId,
            ...productScope.params.slice(1)
        ]);

        const discountScope =
            productWriteScope(
                "pd",
                user,
                [productId]
            );

        const [discountRows] =
            await connection.query(`
                SELECT
                    pd.discount_id
                FROM product_discount pd
                WHERE pd.product_id = ?
                ${discountScope.sql}
                ORDER BY pd.discount_id DESC
                LIMIT 1
                FOR UPDATE
            `, discountScope.params);

        if (discountRows.length > 0) {
            await connection.query(`
                UPDATE product_discount pd
                SET pd.product_name = ?
                WHERE pd.discount_id = ?
            `, [
                productName,
                discountRows[0].discount_id
            ]);
        } else {
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
                user.branch_id || null,
                productId,
                productName
            ]);
        }

        await connection.commit();

        return sendAlert(
            res,
            "Product is updated successfully.",
            "/productpages/products"
        );

    } catch (error) {
        await connection.rollback();

        console.error(
            "UPDATE PRODUCT ERROR:",
            error
        );

        return res.status(500).send(
            "Update failed."
        );

    } finally {
        connection.release();
    }
};


/* =========================================================================
   SHOW EDIT PRODUCT
========================================================================= */

exports.showEditProduct = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    try {
        const productId =
            Number(req.params.id);

        if (
            !Number.isInteger(productId) ||
            productId <= 0
        ) {
            return res.status(400).send(
                "Invalid product ID."
            );
        }

        const productScope =
            productReadScope(
                "p",
                user,
                [productId]
            );

        const [rows] =
            await db.query(`
                SELECT p.*
                FROM products p
                WHERE p.product_id = ?
                ${productScope.sql}
                LIMIT 1
            `, productScope.params);

        if (rows.length === 0) {
            return res.status(404).send(
                "Product not found."
            );
        }

        return res.render(
            "edit-product",
            {
                product: rows[0]
            }
        );

    } catch (error) {
        console.error(
            "SHOW EDIT PRODUCT ERROR:",
            error
        );

        return res.status(500).send(
            "Unable to load edit product page."
        );
    }
};

/* =========================================================================
   SEARCH PRODUCTS
========================================================================= */

exports.searchProducts = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    try {
        const search =
            String(req.query.search || "").trim();

        if (search.length < 2) {
            return res.json([]);
        }

        const businessId =
            user.business_id;

        const branchId =
            user.branch_id ?? null;

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message:
                    "Business information is missing."
            });
        }

        let sql = `
            SELECT
                p.product_id,
                p.product_name,
                p.brand,
                p.category,
                p.unit,
                p.supplier_name,

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

            LEFT JOIN stock s
                ON s.product_id = p.product_id
                AND s.business_id = p.business_id
        `;

        const params = [];

        sql += `
            WHERE p.business_id = ?
              AND p.product_name LIKE ?
        `;

        params.push(
            businessId,
            `%${search}%`
        );

        /*
         * Branch users can see:
         * - products belonging to their branch
         * - business-wide products
         */
        if (branchId !== null) {
            sql += `
                AND (
                    p.branch_id = ?
                    OR p.branch_id IS NULL
                )
            `;

            params.push(branchId);

            /*
             * Stock must belong to the user's branch.
             */
            sql += `
                AND (
                    s.branch_id = ?
                    OR s.branch_id IS NULL
                )
            `;

            params.push(branchId);
        }

        sql += `
            GROUP BY
                p.product_id,
                p.product_name,
                p.brand,
                p.category,
                p.unit,
                p.supplier_name

            ORDER BY p.product_name ASC

            LIMIT 20
        `;

        const [products] =
            await db.query(sql, params);

        return res.json(products);

    } catch (error) {
        console.error(
            "SEARCH PRODUCTS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to search products."
        });
    }
};


/* =========================================================================
   ADD PRODUCT TO POS CART
========================================================================= */

exports.addsalesproduct = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    const productId =
        Number(
            req.body.ProductId ??
            req.body.product_id
        );

    const quantityValue =
        normalizeNumber(
            req.body.quantity
        );

    if (
        !Number.isInteger(productId) ||
        productId <= 0
    ) {
        return sendAlert(
            res,
            "Invalid product.",
            "/productpages/main"
        );
    }

    if (
        !Number.isFinite(quantityValue) ||
        !Number.isInteger(quantityValue) ||
        quantityValue <= 0
    ) {
        return sendAlert(
            res,
            "Quantity must be a whole number greater than zero.",
            "/productpages/main"
        );
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        const product =
            await getProductForSale(
                connection,
                user,
                productId
            );

        if (!product) {
            await connection.rollback();

            return sendAlert(
                res,
                "Product not found.",
                "/productpages/main"
            );
        }

        const [stockRows] =
            await connection.query(`
                SELECT
                    COALESCE(
                        SUM(quantity_available),
                        0
                    ) AS available
                FROM stock
                WHERE product_id = ?
                  AND business_id = ?
                  AND branch_id = ?
                  AND quantity_available > 0
            `, [
                productId,
                user.business_id,
                user.branch_id
            ]);

        const available =
            Number(
                stockRows[0]?.available
            ) || 0;

        if (available < quantityValue) {
            await connection.rollback();

            return sendAlert(
                res,
                `Insufficient stock. Available: ${available}`,
                "/productpages/main"
            );
        }

        const productDiscount =
            Math.min(
                100,
                Math.max(
                    0,
                    Number(
                        product.product_discount
                    ) || 0
                )
            );

        const sellingPrice =
            money(product.selling_price);

        const discountedSellingPrice =
            money(
                sellingPrice *
                (1 - productDiscount / 100)
            );

        const totalPrice =
            money(
                discountedSellingPrice *
                quantityValue
            );

        await connection.query(`
            INSERT INTO sales_item_initial
            (
                business_id,
                branch_id,
                UserID,
                product_id,
                product_name,
                quantity,
                Selling_price,
                cost_price,
                product_discount,
                total_price
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            user.business_id,
            user.branch_id,
            user.id,
            product.product_id,
            product.product_name,
            quantityValue,
            discountedSellingPrice,
            money(product.cost_price),
            productDiscount,
            totalPrice
        ]);

        await connection.commit();

        return res.redirect(
            "/productpages/main"
        );

    } catch (error) {
        await connection.rollback();

        console.error(
            "ADD SALES PRODUCT ERROR:",
            error
        );

        return res.status(500).send(`
            <script>
                alert("Unable to add product to sale.");
                window.location.href="/productpages/main";
            </script>
        `);

    } finally {
        connection.release();
    }
};


/* =========================================================================
   UPDATE CART QUANTITY
========================================================================= */

exports.updateCartQuantity = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    const salesId =
        Number(req.params.sales_id);

    const quantity =
        Number(req.body.quantity);

    if (
        !Number.isInteger(salesId) ||
        salesId <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid cart item."
        });
    }

    if (
        !Number.isInteger(quantity) ||
        quantity <= 0
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Quantity must be a whole number greater than zero."
        });
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        const [cartRows] =
            await connection.query(`
                SELECT
                    sales_id,
                    product_id,
                    Selling_price,
                    product_discount
                FROM sales_item_initial
                WHERE sales_id = ?
                  AND UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
                LIMIT 1
                FOR UPDATE
            `, [
                salesId,
                user.id,
                user.business_id,
                user.branch_id
            ]);

        if (cartRows.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Cart item not found."
            });
        }

        const item =
            cartRows[0];

        const [stockRows] =
            await connection.query(`
                SELECT
                    COALESCE(
                        SUM(quantity_available),
                        0
                    ) AS available
                FROM stock
                WHERE product_id = ?
                  AND business_id = ?
                  AND branch_id = ?
                  AND quantity_available > 0
            `, [
                item.product_id,
                user.business_id,
                user.branch_id
            ]);

        const available =
            Number(
                stockRows[0]?.available
            ) || 0;

        if (quantity > available) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    `Insufficient stock. Available: ${available}`
            });
        }

        const sellingPrice =
            money(item.Selling_price);

        const productDiscount =
            Math.min(
                100,
                Math.max(
                    0,
                    Number(
                        item.product_discount
                    ) || 0
                )
            );

        const totalPrice =
            money(
                sellingPrice *
                quantity
            );

        await connection.query(`
            UPDATE sales_item_initial
            SET
                quantity = ?,
                total_price = ?
            WHERE sales_id = ?
              AND UserID = ?
              AND business_id = ?
              AND branch_id = ?
        `, [
            quantity,
            totalPrice,
            salesId,
            user.id,
            user.business_id,
            user.branch_id
        ]);

        const [cartTotals] =
            await connection.query(`
                SELECT
                    COALESCE(
                        SUM(total_price),
                        0
                    ) AS subtotal
                FROM sales_item_initial
                WHERE UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
            `, [
                user.id,
                user.business_id,
                user.branch_id
            ]);

        const {
            taxRate,
            discountRate
        } = await getTaxAndDiscount(
            connection,
            user
        );

        const totals =
            calculateCartTotals(
                [{ total_price: cartTotals[0].subtotal }],
                taxRate,
                discountRate
            );

        await connection.commit();

        return res.json({
            success: true,
            quantity,
            total_price: totalPrice,
            subtotal: totals.subtotal,
            discount: totals.discountAmount,
            tax: totals.taxAmount,
            grandTotal: totals.grandTotal
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "UPDATE CART QUANTITY ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to update cart quantity."
        });

    } finally {
        connection.release();
    }
};


/* =========================================================================
   ADD STOCK
========================================================================= */
exports.addStock = async (req, res) => {
    const user = requireProductManager(req, res);

    if (!user) {
        return;
    }

    if (!user.branch_id) {
        return sendAlert(
            res,
            "Stock intake requires a branch-assigned account.",
            "/productpages/stockintake"
        );
    }

    const {
        product_id,
        quantity_received,
        expiry_date
    } = req.body;

    const productId =
        Number(product_id);

    const quantityReceived =
        normalizeNumber(quantity_received);

    if (
        !Number.isInteger(productId) ||
        productId <= 0
    ) {
        return sendAlert(
            res,
            "Please select a valid product.",
            "/productpages/stockintake"
        );
    }

    if (
        !Number.isFinite(quantityReceived) ||
        quantityReceived <= 0
    ) {
        return sendAlert(
            res,
            "Quantity received must be greater than zero.",
            "/productpages/stockintake"
        );
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        const [products] =
            await connection.query(`
                SELECT
                    product_id
                FROM products
                WHERE product_id = ?
                  AND business_id = ?
                  AND (
                        branch_id IS NULL
                        OR branch_id = ?
                  )
                LIMIT 1
                FOR UPDATE
            `, [
                productId,
                user.business_id,
                user.branch_id
            ]);

        if (products.length === 0) {
            await connection.rollback();

            return sendAlert(
                res,
                "The selected product does not belong to your business or branch.",
                "/productpages/stockintake"
            );
        }

        const [stockResult] =
            await connection.query(`
                INSERT INTO stock
                (
                    business_id,
                    branch_id,
                    product_id,
                    quantity_received,
                    quantity_available,
                    stock_date,
                    expiry_date
                )
                VALUES (?, ?, ?, ?, ?, CURDATE(), ?)
            `, [
                user.business_id,
                user.branch_id,
                productId,
                quantityReceived,
                quantityReceived,
                nullableString(expiry_date)
            ]);

        const stockId =
            stockResult.insertId;

        const batchNumber =
            `BATCH-${String(stockId).padStart(6, "0")}`;

        await connection.query(`
            UPDATE stock
            SET batch_number = ?
            WHERE stock_id = ?
              AND business_id = ?
              AND branch_id = ?
        `, [
            batchNumber,
            stockId,
            user.business_id,
            user.branch_id
        ]);

        await connection.commit();

        return sendAlert(
            res,
            `Stock added successfully. Batch: ${batchNumber}`,
            "/productpages/stockintake"
        );

    } catch (error) {
        await connection.rollback();

        console.error(
            "ADD STOCK ERROR:",
            error
        );

        return sendAlert(
            res,
            "Failed to add stock.",
            "/productpages/stockintake"
        );

    } finally {
        connection.release();
    }
};


/* =========================================================================
   POS MAIN PAGE
========================================================================= */

exports.getallproductsinmain = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    try {
        const productScope =
            productReadScope("p", user);

        const stockScope =
            stockReadScope("s", user);

        const [categories] =
            await db.query(`
                SELECT DISTINCT
                    p.category
                FROM products p
                WHERE p.category IS NOT NULL
                  AND p.category <> ''
                  ${productScope.sql}
                ORDER BY p.category
            `, productScope.params);

        const [initialsales] =
            await db.query(`
                SELECT
                    sales_id,
                    product_id,
                    product_name,
                    quantity,
                    Selling_price,
                    cost_price,
                    product_discount,
                    total_price,
                    sale_date
                FROM sales_item_initial
                WHERE UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
                ORDER BY sales_id ASC
            `, [
                user.id,
                user.business_id,
                user.branch_id
            ]);

        const [[Subtotal]] =
            await db.query(`
                SELECT
                    COALESCE(
                        SUM(total_price),
                        0
                    ) AS subtotal
                FROM sales_item_initial
                WHERE UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
            `, [
                user.id,
                user.business_id,
                user.branch_id
            ]);

        const [products] =
            await db.query(`
                SELECT
                    p.product_id,
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
                    p.created_at,

                    COALESCE(
                        SUM(s.quantity_received),
                        0
                    ) AS totalreceived,

                    COALESCE(
                        SUM(s.quantity_available),
                        0
                    ) AS totalavailable,

                    COUNT(s.stock_id)
                        AS total_batches

                FROM products p

                LEFT JOIN stock s
                    ON p.product_id = s.product_id
                    ${stockScope.sql}

                WHERE 1 = 1
                    ${productScope.sql}

                GROUP BY
                    p.product_id,
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
                    p.created_at

                ORDER BY p.product_name ASC
            `, [
                ...stockScope.params,
                ...productScope.params
            ]);

        const {
            taxRate,
            discountRate
        } = await getTaxAndDiscount(
            db,
            user
        );

        const [temporalsales] =
            await db.query(`
                SELECT
                    invoice_number,
                    cashier_id,
                    customer_id,
                    hold_status,
                    DATE_FORMAT(
                        created_at,
                        '%d %b %Y %h:%i %p'
                    ) AS created_at
                FROM held_sales
                WHERE cashier_id = ?
                  AND business_id = ?
                  AND branch_id = ?
                ORDER BY created_at DESC
            `, [
                user.id,
                user.business_id,
                user.branch_id
            ]);

        const totals =
            calculateCartTotals(
                initialsales,
                taxRate,
                discountRate
            );

        return res.render("main", {
            name:
                user.name ||
                [user.FirstName, user.LastName]
                    .filter(Boolean)
                    .join(" "),
            email:
                user.email,
            location:
                user.Business_location,
            phone:
                user.phone,
            RoleName:
                user.RoleName,
            Business_name:
                user.Business_name,
            products,
            initialsales,
            temporalsales,
            categories,
            discount:
                totals.discountRate.toFixed(2) + "%",
            tax:
                totals.taxRate.toFixed(2) + "%",
            subtotal:
                totals.subtotal,
            discountAmount:
                totals.discountAmount,
            taxAmount:
                totals.taxAmount,
            grandTotal:
                totals.grandTotal
        });

    } catch (error) {
        console.error(
            "GET POS PRODUCTS ERROR:",
            error
        );

        return res.status(500).send(
            "Failed to get products."
        );
    }
};


/* =========================================================================
   GET CART
========================================================================= */

exports.getallsalesinit = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    try {
        const [initialsales] =
            await db.query(`
                SELECT
                    sales_id,
                    product_id,
                    product_name,
                    quantity,
                    Selling_price,
                    cost_price,
                    product_discount,
                    total_price,
                    sale_date
                FROM sales_item_initial
                WHERE UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
                ORDER BY sales_id ASC
            `, [
                user.id,
                user.business_id,
                user.branch_id
            ]);

        return res.render("main", {
            initialsales
        });

    } catch (error) {
        console.error(
            "GET CART ERROR:",
            error
        );

        return res.status(500).send(
            "Failed to get sales."
        );
    }
};


/* =========================================================================
   CLEAR CURRENT CART
========================================================================= */

exports.ClearAllCarts = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    try {
        await db.query(`
            DELETE FROM sales_item_initial
            WHERE UserID = ?
              AND business_id = ?
              AND branch_id = ?
        `, [
            user.id,
            user.business_id,
            user.branch_id
        ]);

        return res.redirect(
            "/productpages/main"
        );

    } catch (error) {
        console.error(
            "CLEAR CART ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to clear cart."
        });
    }
};


/* =========================================================================
   DELETE CART ITEM
========================================================================= */

exports.deleteitem = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    try {
        const salesId =
            Number(req.params.sales_id);

        if (
            !Number.isInteger(salesId) ||
            salesId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid cart item."
            });
        }

        const [result] =
            await db.query(`
                DELETE FROM sales_item_initial
                WHERE sales_id = ?
                  AND UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
            `, [
                salesId,
                user.id,
                user.business_id,
                user.branch_id
            ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Cart item not found."
            });
        }

        return res.json({
            success: true,
            message:
                "Item deleted successfully."
        });

    } catch (error) {
        console.error(
            "DELETE CART ITEM ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to delete this item."
        });
    }
};


/* =========================================================================
   HOLD SALE
========================================================================= */

exports.holdSale = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        const [cartItems] =
            await connection.query(`
                SELECT
                    product_id,
                    product_name,
                    quantity,
                    Selling_price,
                    cost_price,
                    product_discount,
                    total_price
                FROM sales_item_initial
                WHERE UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
                ORDER BY sales_id ASC
                FOR UPDATE
            `, [
                user.id,
                user.business_id,
                user.branch_id
            ]);

        if (cartItems.length === 0) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Cart is empty."
            });
        }

        const invoice =
            generateInvoiceNumber();

        const [holdSaleResult] =
            await connection.query(`
                INSERT INTO held_sales
                (
                    business_id,
                    branch_id,
                    invoice_number,
                    cashier_id,
                    customer_id,
                    hold_status
                )
                VALUES (?, ?, ?, ?, NULL, 'Held')
            `, [
                user.business_id,
                user.branch_id,
                invoice,
                user.id
            ]);

        const holdId =
            holdSaleResult.insertId;

        for (const item of cartItems) {
            await connection.query(`
                INSERT INTO held_sale_items
                (
                    business_id,
                    branch_id,
                    UserID,
                    hold_id,
                    product_id,
                    product_name,
                    quantity,
                    selling_price,
                    cost_price,
                    product_discount,
                    total_price
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                user.business_id,
                user.branch_id,
                user.id,
                holdId,
                item.product_id,
                item.product_name,
                item.quantity,
                item.Selling_price,
                item.cost_price,
                item.product_discount,
                item.total_price
            ]);
        }

        await connection.query(`
            DELETE FROM sales_item_initial
            WHERE UserID = ?
              AND business_id = ?
              AND branch_id = ?
        `, [
            user.id,
            user.business_id,
            user.branch_id
        ]);

        await connection.commit();

        return res.json({
            success: true,
            message:
                "Sale held successfully.",
            invoice_number:
                invoice
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "HOLD SALE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to hold sale."
        });

    } finally {
        connection.release();
    }
};


/* =========================================================================
   RECALL HELD SALE
========================================================================= */

exports.recallHoldSale = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        const invoiceNumber =
            String(
                req.params.invoiceNumber || ""
            ).trim();

        if (!invoiceNumber) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Invoice number is required."
            });
        }

        const [heldSale] =
            await connection.query(`
                SELECT hold_id
                FROM held_sales
                WHERE invoice_number = ?
                  AND business_id = ?
                  AND branch_id = ?
                  AND cashier_id = ?
                  AND hold_status = 'Held'
                LIMIT 1
                FOR UPDATE
            `, [
                invoiceNumber,
                user.business_id,
                user.branch_id,
                user.id
            ]);

        if (heldSale.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message:
                    "Held sale not found."
            });
        }

        const holdId =
            heldSale[0].hold_id;

        const [existingCart] =
            await connection.query(`
                SELECT sales_id
                FROM sales_item_initial
                WHERE UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
                LIMIT 1
            `, [
                user.id,
                user.business_id,
                user.branch_id
            ]);

        if (existingCart.length > 0) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Your current cart is not empty. Clear it before recalling a held sale."
            });
        }

        const [items] =
            await connection.query(`
                SELECT
                    UserID,
                    product_id,
                    product_name,
                    quantity,
                    selling_price,
                    cost_price,
                    product_discount,
                    total_price
                FROM held_sale_items
                WHERE hold_id = ?
                  AND business_id = ?
                  AND branch_id = ?
                  AND UserID = ?
                ORDER BY hold_item_id ASC
            `, [
                holdId,
                user.business_id,
                user.branch_id,
                user.id
            ]);

        if (items.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message:
                    "The held sale has no items."
            });
        }

        for (const item of items) {
            await connection.query(`
                INSERT INTO sales_item_initial
                (
                    business_id,
                    branch_id,
                    UserID,
                    product_id,
                    product_name,
                    quantity,
                    Selling_price,
                    cost_price,
                    product_discount,
                    total_price
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                user.business_id,
                user.branch_id,
                user.id,
                item.product_id,
                item.product_name,
                item.quantity,
                item.selling_price,
                item.cost_price,
                item.product_discount,
                item.total_price
            ]);
        }

        await connection.query(`
            DELETE FROM held_sale_items
            WHERE hold_id = ?
              AND business_id = ?
              AND branch_id = ?
              AND UserID = ?
        `, [
            holdId,
            user.business_id,
            user.branch_id,
            user.id
        ]);

        await connection.query(`
            DELETE FROM held_sales
            WHERE hold_id = ?
              AND business_id = ?
              AND branch_id = ?
              AND cashier_id = ?
        `, [
            holdId,
            user.business_id,
            user.branch_id,
            user.id
        ]);

        await connection.commit();

        return res.json({
            success: true
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "RECALL HOLD SALE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to recall held sale."
        });

    } finally {
        connection.release();
    }
};


/* =========================================================================
   DELETE CURRENT CASHIER SALES DATA
========================================================================= */

exports.deleteallsales = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(`
            DELETE FROM sales_item_initial
            WHERE UserID = ?
              AND business_id = ?
              AND branch_id = ?
        `, [
            user.id,
            user.business_id,
            user.branch_id
        ]);

        await connection.query(`
            DELETE FROM held_sale_items
            WHERE UserID = ?
              AND business_id = ?
              AND branch_id = ?
        `, [
            user.id,
            user.business_id,
            user.branch_id
        ]);

        await connection.query(`
            DELETE FROM held_sales
            WHERE cashier_id = ?
              AND business_id = ?
              AND branch_id = ?
        `, [
            user.id,
            user.business_id,
            user.branch_id
        ]);

        await connection.commit();

        return sendAlert(
            res,
            "All current sales transactions have been deleted successfully.",
            "/productpages/main"
        );

    } catch (error) {
        await connection.rollback();

        console.error(
            "DELETE ALL SALES ERROR:",
            error
        );

        return sendAlert(
            res,
            "Unable to delete sales records.",
            "/productpages/main"
        );

    } finally {
        connection.release();
    }
};


/* =========================================================================
   SEARCH CUSTOMERS
========================================================================= */

exports.searchCustomers = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    try {
        const search =
            String(
                req.query.search || ""
            ).trim();

        if (!search) {
            return res.json({
                success: true,
                customers: []
            });
        }

        const searchTerm =
            `%${search}%`;

        const customerScope =
            productReadScope("c", user);

        const [customers] =
            await db.query(`
                SELECT
                    c.customer_id,
                    c.customer_code,
                    c.customer_name,
                    c.phone,
                    c.Email,
                    c.Address,
                    c.city,
                    c.status

                FROM customers c

                WHERE c.status = 'Active'
                  AND (
                        c.customer_name LIKE ?
                        OR c.phone LIKE ?
                        OR c.customer_code LIKE ?
                  )
                  ${customerScope.sql}

                ORDER BY c.customer_name ASC
                LIMIT 20
            `, [
                searchTerm,
                searchTerm,
                searchTerm,
                ...customerScope.params
            ]);

        return res.json({
            success: true,
            customers
        });

    } catch (error) {
        console.error(
            "CUSTOMER SEARCH ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to search customers."
        });
    }
};


/* =========================================================================
   POINT OF SALE — CASH / MANUAL PAYMENT
========================================================================= */

exports.pointofsales = async (req, res) => {
    const user = requireBranchUser(req, res);

    if (!user) {
        return;
    }

    const amountPaid =
        normalizeNumber(
            req.body.amount_paid
        );

    if (
        !Number.isFinite(amountPaid) ||
        amountPaid <= 0
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Please enter a valid amount paid."
        });
    }

    const paymentMethod =
        normalizePaymentMethod(
            req.body.payment_method
        );

    if (!paymentMethod) {
        return res.status(400).json({
            success: false,
            message:
                "Invalid payment method."
        });
    }

    if ( paymentMethod === "Mobile Money") {
            return res.status(400).json({
                success: false,
                message:
                    "Mobile Money payments must be processed through the Mobile Money payment flow."
            });
        }

    const customerId =
        req.body.customer_id === null ||
        req.body.customer_id === undefined ||
        req.body.customer_id === ""
            ? null
            : Number(req.body.customer_id);

    const transactionRef =
        nullableString(
            req.body.transaction_ref
        );

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        /* -----------------------------------------------------------------
           CART
        ----------------------------------------------------------------- */

        const [cartItems] =
            await connection.query(`
                SELECT
                    sales_id,
                    UserID,
                    product_id,
                    product_name,
                    quantity,
                    Selling_price,
                    cost_price,
                    product_discount,
                    total_price,
                    sale_date
                FROM sales_item_initial
                WHERE UserID = ?
                  AND business_id = ?
                  AND branch_id = ?
                ORDER BY sales_id ASC
                FOR UPDATE
            `, [
                user.id,
                user.business_id,
                user.branch_id
            ]);

        if (cartItems.length === 0) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Your cart is empty."
            });
        }

        /* -----------------------------------------------------------------
           TAX / DISCOUNT
        ----------------------------------------------------------------- */

        const {
            taxRate,
            discountRate
        } = await getTaxAndDiscount(
            connection,
            user
        );

        const totals =
            calculateCartTotals(
                cartItems,
                taxRate,
                discountRate
            );

        const {
            subtotal,
            discountAmount,
            taxAmount,
            grandTotal
        } = totals;

        const paid =
            money(amountPaid);

        if (paid < grandTotal) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    `Insufficient payment. Amount required: ${grandTotal.toFixed(2)}`
            });
        }

        const changeAmount =
            money(paid - grandTotal);

        /* -----------------------------------------------------------------
           CUSTOMER
        ----------------------------------------------------------------- */

        if (customerId !== null) {
            if (
                !Number.isInteger(customerId) ||
                customerId <= 0
            ) {
                throw new Error(
                    "Invalid customer selected."
                );
            }

            const customerScope =
                productReadScope(
                    "c",
                    user,
                    [customerId]
                );

            const [customerRows] =
                await connection.query(`
                    SELECT customer_id
                    FROM customers c
                    WHERE c.customer_id = ?
                      AND c.status = 'Active'
                      ${customerScope.sql}
                    LIMIT 1
                    FOR UPDATE
                `, customerScope.params);

            if (customerRows.length === 0) {
                throw new Error(
                    "Selected customer was not found or is inactive."
                );
            }
        }

        /* -----------------------------------------------------------------
           STOCK PLAN
        ----------------------------------------------------------------- */

        const stockPlan = [];

        for (const item of cartItems) {
            const requiredQuantity =
                Number(item.quantity);

            if (
                !Number.isInteger(
                    requiredQuantity
                ) ||
                requiredQuantity <= 0
            ) {
                throw new Error(
                    `Invalid quantity for ${item.product_name}.`
                );
            }

            const [stockBatches] =
                await connection.query(`
                    SELECT
                        stock_id,
                        product_id,
                        quantity_available,
                        stock_date,
                        expiry_date
                    FROM stock
                    WHERE product_id = ?
                      AND business_id = ?
                      AND branch_id = ?
                      AND quantity_available > 0
                    ORDER BY
                        stock_date ASC,
                        stock_id ASC
                    FOR UPDATE
                `, [
                    item.product_id,
                    user.business_id,
                    user.branch_id
                ]);

            const totalAvailable =
                stockBatches.reduce(
                    (total, batch) =>
                        total +
                        Number(
                            batch.quantity_available
                        ),
                    0
                );

            if (
                totalAvailable <
                requiredQuantity
            ) {
                throw new Error(
                    `Insufficient stock for ${item.product_name}. ` +
                    `Available: ${totalAvailable}, ` +
                    `Required: ${requiredQuantity}.`
                );
            }

            let remaining =
                requiredQuantity;

            const deductions = [];

            for (
                const batch
                of stockBatches
            ) {
                if (remaining <= 0) {
                    break;
                }

                const available =
                    Number(
                        batch.quantity_available
                    );

                const deduction =
                    Math.min(
                        available,
                        remaining
                    );

                deductions.push({
                    stock_id:
                        batch.stock_id,
                    quantity:
                        deduction
                });

                remaining -= deduction;
            }

            stockPlan.push({
                item,
                deductions
            });
        }

        /* -----------------------------------------------------------------
           SALE
        ----------------------------------------------------------------- */

        const invoiceNumber =
            generateInvoiceNumber();

        const [saleResult] =
            await connection.query(`
                INSERT INTO sales
                (
                    business_id,
                    invoice_number,
                    cashier_id,
                    branch_id,
                    customer_id,
                    subtotal,
                    discount,
                    tax,
                    GrandTotal,
                    amount_paid,
                    change_given,
                    payment_method,
                    sale_status
                )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed'
                )
            `, [
                user.business_id,
                invoiceNumber,
                user.id,
                user.branch_id,
                customerId,
                subtotal,
                discountAmount,
                taxAmount,
                grandTotal,
                paid,
                changeAmount,
                paymentMethod
            ]);

        const saleId =
            saleResult.insertId;

        /* -----------------------------------------------------------------
           SALE ITEMS
        ----------------------------------------------------------------- */

        for (const item of cartItems) {
            await connection.query(`
                INSERT INTO sales_item
                (
                    business_id,
                    branch_id,
                    sale_id,
                    UserID,
                    product_id,
                    product_name,
                    quantity,
                    Selling_price,
                    cost_price,
                    product_discount,
                    total_price
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                user.business_id,
                user.branch_id,
                saleId,
                user.id,
                item.product_id,
                item.product_name,
                item.quantity,
                item.Selling_price,
                item.cost_price,
                item.product_discount,
                item.total_price
            ]);
        }

        /* -----------------------------------------------------------------
           STOCK DEDUCTION + MOVEMENTS
        ----------------------------------------------------------------- */

        for (const plan of stockPlan) {
            for (const deduction of plan.deductions) {
                const [updateResult] =
                    await connection.query(`
                        UPDATE stock
                        SET quantity_available =
                            quantity_available - ?
                        WHERE stock_id = ?
                          AND business_id = ?
                          AND branch_id = ?
                          AND quantity_available >= ?
                    `, [
                        deduction.quantity,
                        deduction.stock_id,
                        user.business_id,
                        user.branch_id,
                        deduction.quantity
                    ]);

                if (
                    updateResult.affectedRows !== 1
                ) {
                    throw new Error(
                        `Unable to update stock for ${plan.item.product_name}.`
                    );
                }

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
                        performed_by,
                        reason,
                        movement_date
                    )
                    VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        'OUT',
                        'SALE',
                        ?,
                        'SALE',
                        ?,
                        ?,
                        ?,
                        NOW()
                    )
                `, [
                    user.business_id,
                    plan.item.product_id,
                    deduction.stock_id,
                    user.branch_id,
                    deduction.quantity,
                    saleId,
                    user.id,
                    "Stock deducted for completed sale"
                ]);
            }
        }

        /* -----------------------------------------------------------------
           PAYMENT
        ----------------------------------------------------------------- */

        await connection.query(`
            INSERT INTO payments
            (
                business_id,
                branch_id,
                sale_id,
                payment_method,
                amount,
                change_given,
                transaction_ref,
                payment_status,
                paid_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Paid', NOW())
        `, [
            user.business_id,
            user.branch_id,
            saleId,
            paymentMethod,
            paid,
            changeAmount,
            transactionRef
        ]);

        /* -----------------------------------------------------------------
           RECEIPT
        ----------------------------------------------------------------- */

        const [saleRows] =
            await connection.query(`
                SELECT
                    s.sale_id,
                    s.invoice_number,
                    s.cashier_id,
                    CONCAT(
                        COALESCE(u.FirstName, ''),
                        ' ',
                        COALESCE(u.LastName, '')
                    ) AS cashier_name,
                    s.customer_id,
                    c.customer_code,
                    c.customer_name,
                    c.phone AS customer_phone,
                    s.subtotal,
                    s.discount,
                    s.tax,
                    s.GrandTotal,
                    s.amount_paid,
                    s.change_given,
                    s.payment_method,
                    s.sale_status,
                    s.created_at

                FROM sales s

                LEFT JOIN users u
                    ON u.UserID = s.cashier_id
                   AND u.business_id = s.business_id

                LEFT JOIN customers c
                    ON c.customer_id = s.customer_id
                   AND c.business_id = s.business_id
                   AND (
                        c.branch_id IS NULL
                        OR c.branch_id = s.branch_id
                   )

                WHERE s.sale_id = ?
                  AND s.business_id = ?
                  AND s.branch_id = ?

                LIMIT 1
            `, [
                saleId,
                user.business_id,
                user.branch_id
            ]);

        if (saleRows.length === 0) {
            throw new Error(
                "Sale was created but receipt data could not be retrieved."
            );
        }

        const sale =
            saleRows[0];

        const [receiptItems] =
            await connection.query(`
                SELECT
                    sale_item_id,
                    product_id,
                    product_name,
                    quantity,
                    Selling_price,
                    cost_price,
                    product_discount,
                    total_price
                FROM sales_item
                WHERE sale_id = ?
                  AND business_id = ?
                  AND branch_id = ?
                ORDER BY sale_item_id ASC
            `, [
                saleId,
                user.business_id,
                user.branch_id
            ]);

        /* -----------------------------------------------------------------
           CLEAR CURRENT CASHIER CART
        ----------------------------------------------------------------- */

        await connection.query(`
            DELETE FROM sales_item_initial
            WHERE UserID = ?
              AND business_id = ?
              AND branch_id = ?
        `, [
            user.id,
            user.business_id,
            user.branch_id
        ]);

        await connection.commit();

        return res.json({
            success: true,
            message:
                "Sale completed successfully.",
            receipt: {
                sale_id:
                    sale.sale_id,
                invoice_number:
                    sale.invoice_number,
                cashier_id:
                    sale.cashier_id,
                cashier_name:
                    sale.cashier_name,
                customer_id:
                    sale.customer_id,
                customer_code:
                    sale.customer_code,
                customer_name:
                    sale.customer_name,
                customer_phone:
                    sale.customer_phone,
                subtotal:
                    sale.subtotal,
                discount:
                    sale.discount,
                tax:
                    sale.tax,
                GrandTotal:
                    sale.GrandTotal,
                grand_total:
                    sale.GrandTotal,
                amount_paid:
                    sale.amount_paid,
                change_given:
                    sale.change_given,
                payment_method:
                    sale.payment_method,
                sale_status:
                    sale.sale_status,
                created_at:
                    sale.created_at,
                items:
                    receiptItems
            }
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "POINT OF SALE ERROR:",
            error
        );

        return res.status(400).json({
            success: false,
            message:
                error.message ||
                "Unable to complete sale."
        });

    } finally {
        connection.release();
    }
};


/* =========================================================================
   REGISTER CUSTOMER
========================================================================= */

exports.registerCustomer = async (req, res) => {
    const user = requireBusinessUser(req, res);

    if (!user) {
        return;
    }

    const {
        customer_name,
        phone,
        Email,
        Address,
        city
    } = req.body;

    const customerName =
        String(
            customer_name || ""
        ).trim();

    const customerPhone =
        String(
            phone || ""
        ).trim();

    if (!customerName) {
        return res.status(400).json({
            success: false,
            message:
                "Customer name is required."
        });
    }

    if (!customerPhone) {
        return res.status(400).json({
            success: false,
            message:
                "Phone number is required."
        });
    }

    const connection =
        await db.getConnection();

    try {
        await connection.beginTransaction();

        let duplicateSql = `
            SELECT
                customer_id,
                customer_code,
                customer_name,
                phone
            FROM customers
            WHERE business_id = ?
              AND phone = ?
        `;

        const duplicateParams = [
            user.business_id,
            customerPhone
        ];

        if (user.branch_id) {
            duplicateSql += `
                AND (
                    branch_id IS NULL
                    OR branch_id = ?
                )
            `;

            duplicateParams.push(
                user.branch_id
            );
        } else {
            duplicateSql += `
                AND branch_id IS NULL
            `;
        }

        duplicateSql += `
            LIMIT 1
            FOR UPDATE
        `;

        const [existingCustomer] =
            await connection.query(
                duplicateSql,
                duplicateParams
            );

        if (existingCustomer.length > 0) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "A customer with this phone number already exists.",
                customer:
                    existingCustomer[0]
            });
        }

        const branchId =
            user.branch_id || null;

        const [customerResult] =
            await connection.query(`
                INSERT INTO customers
                (
                    business_id,
                    branch_id,
                    customer_name,
                    phone,
                    Email,
                    Address,
                    city,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
            `, [
                user.business_id,
                branchId,
                customerName,
                customerPhone,
                nullableString(Email),
                nullableString(Address),
                nullableString(city)
            ]);

        const customerId =
            customerResult.insertId;

        const customerScope =
            productReadScope(
                "c",
                user,
                [customerId]
            );

        const [customerRows] =
            await connection.query(`
                SELECT
                    c.customer_id,
                    c.customer_code,
                    c.customer_name,
                    c.phone,
                    c.Email,
                    c.Address,
                    c.city,
                    c.status
                FROM customers c
                WHERE c.customer_id = ?
                  ${customerScope.sql}
                LIMIT 1
            `, customerScope.params);

        if (customerRows.length === 0) {
            throw new Error(
                "Customer was registered but could not be retrieved."
            );
        }

        const customer =
            customerRows[0];

        await connection.commit();

        return res.status(201).json({
            success: true,
            message:
                "Customer registered successfully.",
            customer
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "REGISTER CUSTOMER ERROR:",
            error
        );

        if (
            error.code ===
            "ER_DUP_ENTRY"
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "A customer with this information already exists."
            });
        }

        return res.status(500).json({
            success: false,
            message:
                "Failed to register customer."
        });

    } finally {
        connection.release();
    }
};