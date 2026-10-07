"use strict";

const axios = require("axios");
const crypto = require("crypto");
const db = require("../Database/db");

const {
    finalizeSaleIfEligible
} = require("./splitPaymentController");

const {
    initiateSplitMobileMoneyPayment
} = require("../services/paystackMobileMoney");

// CONFIGURATION


const PAYSTACK_BASE_URL = "https://api.paystack.co";

const MOBILE_MONEY_PROVIDERS = {
    MTN: "mtn",
    Telecel: "vod",
    AirtelTigo: "atl"
};

// AUTH / USER

function getSessionUser(req) {
    const sessionUser = req.session?.user;

    if (!sessionUser) {
        throw new Error("AUTH_REQUIRED");
    }

    const userId = Number(
        sessionUser.UserID ?? sessionUser.id
    );

    const businessId = Number(
        sessionUser.business_id
    );

    const branchId =
        sessionUser.branch_id === null ||
        sessionUser.branch_id === undefined ||
        sessionUser.branch_id === ""
            ? null
            : Number(sessionUser.branch_id);

    if (
        !Number.isInteger(userId) ||
        userId <= 0
    ) {
        throw new Error("INVALID_SESSION");
    }

    if (
        !Number.isInteger(businessId) ||
        businessId <= 0
    ) {
        throw new Error("INVALID_SESSION");
    }

    if (
        branchId !== null &&
        (
            !Number.isInteger(branchId) ||
            branchId <= 0
        )
    ) {
        throw new Error("INVALID_BRANCH");
    }

    return {
        userId,
        businessId,
        branchId,
        email:
            sessionUser.Email ||
            sessionUser.email ||
            null
    };
}

// ============================================================
// MONEY
// ============================================================

function money(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.round(number * 100) / 100;
}

function pesewas(value) {
    return Math.round(money(value) * 100);
}

// ============================================================
// BRANCH SQL CONDITION
// ============================================================

function branchCondition(column = "branch_id") {
    return `
        (
            ${column} = ?
            OR (
                ? IS NULL
                AND ${column} IS NULL
            )
        )
    `;
}

// ============================================================
// PAYSTACK REFERENCE
// ============================================================

function generatePaymentReference() {
    const timestamp = Date.now();

    const random = crypto
        .randomBytes(6)
        .toString("hex");

    return `MF-${timestamp}-${random}`;
}

// ============================================================
// INVOICE NUMBER
// ============================================================

function generateInvoiceNumber() {
    const timestamp =
        Date.now().toString();

    const random =
        crypto
            .randomBytes(3)
            .toString("hex")
            .toUpperCase();

    return `INV-${timestamp}-${random}`;
}

// ============================================================
// PAYSTACK HEADERS
// ============================================================

function paystackHeaders() {
    if (!process.env.PAYSTACK_SECRET_KEY) {
        throw new Error(
            "PAYSTACK_NOT_CONFIGURED"
        );
    }

    return {
        Authorization:
            `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

        "Content-Type":
            "application/json"
    };
}

// ============================================================
// CART
// ============================================================

async function getCart(
    connection,
    user,
    lockRows = false
) {
    const lockClause =
        lockRows ? "FOR UPDATE" : "";

    const [cart] =
        await connection.query(
            `
            SELECT
                UserID,
                business_id,
                branch_id,
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
            AND ${branchCondition("branch_id")}
            ORDER BY sale_date ASC
            ${lockClause}
            `,
            [
                user.userId,
                user.businessId,
                user.branchId,
                user.branchId
            ]
        );

    return cart;
}

// ============================================================
// CUSTOMER
// ============================================================

async function validateCustomer(
    connection,
    user,
    customerId
) {
    if (
        customerId === null ||
        customerId === undefined ||
        customerId === ""
    ) {
        return null;
    }

    const id = Number(customerId);

    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {
        throw new Error(
            "Invalid customer selected."
        );
    }

    const [rows] =
        await connection.query(
            `
            SELECT
                customer_id,
                customer_name,
                phone,
                status
            FROM customers
            WHERE customer_id = ?
            AND business_id = ?
            AND (
                branch_id = ?
                OR branch_id IS NULL
            )
            LIMIT 1
            `,
            [
                id,
                user.businessId,
                user.branchId
            ]
        );

    if (rows.length === 0) {
        throw new Error(
            "Selected customer was not found."
        );
    }

    if (rows[0].status !== "Active") {
        throw new Error(
            "Selected customer is inactive."
        );
    }

    return rows[0].customer_id;
}

// ============================================================
// TAX + DISCOUNT
// ============================================================

async function getTaxDiscount(
    connection,
    user
) {
    const [rows] =
        await connection.query(
            `
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
                    WHEN branch_id = ?
                    THEN 0
                    ELSE 1
                END,
                effective_from DESC,
                tax_discount_id DESC
            LIMIT 1
            `,
            [
                user.businessId,
                user.branchId,
                user.branchId
            ]
        );

    if (rows.length === 0) {
        return {
            taxRate: 0,
            discountRate: 0
        };
    }

    return {
        taxRate:
            Number(rows[0].tax_rate) || 0,

        discountRate:
            Number(rows[0].discount_rate) || 0
    };
}

// ============================================================
// SALE TOTALS
// ============================================================

async function calculateSaleTotals(
    connection,
    user,
    cart
) {
    let subtotal = 0;

    for (const item of cart) {
        const quantity =
            Number(item.quantity);

        const sellingPrice =
            Number(item.Selling_price);

        if (
            !Number.isFinite(quantity) ||
            quantity <= 0
        ) {
            throw new Error(
                `Invalid quantity for ${item.product_name}.`
            );
        }

        if (
            !Number.isFinite(sellingPrice) ||
            sellingPrice < 0
        ) {
            throw new Error(
                `Invalid selling price for ${item.product_name}.`
            );
        }

        subtotal +=
            quantity * sellingPrice;
    }

    subtotal = money(subtotal);

    const {
        taxRate,
        discountRate
    } = await getTaxDiscount(
        connection,
        user
    );

    const discountAmount =
        money(
            subtotal *
            (discountRate / 100)
        );

    const taxableAmount =
        money(
            subtotal -
            discountAmount
        );

    const taxAmount =
        money(
            taxableAmount *
            (taxRate / 100)
        );

    const grandTotal =
        money(
            taxableAmount +
            taxAmount
        );

    return {
        subtotal,
        discountRate,
        discountAmount,
        taxRate,
        taxAmount,
        grandTotal
    };
}

// ============================================================
// STOCK VALIDATION
// ============================================================

async function validateStock(
    connection,
    user,
    cart
) {
    for (const item of cart) {
        const required =
            Number(item.quantity);

        const [rows] =
            await connection.query(
                `
                SELECT
                    COALESCE(
                        SUM(quantity_available),
                        0
                    ) AS total_available
                FROM stock
                WHERE product_id = ?
                AND business_id = ?
                AND quantity_available > 0
                AND ${branchCondition("branch_id")}
                `,
                [
                    item.product_id,
                    user.businessId,
                    user.branchId,
                    user.branchId
                ]
            );

        const available =
            Number(
                rows[0]?.total_available
            ) || 0;

        if (available < required) {
            throw new Error(
                `Insufficient stock for ${item.product_name}. ` +
                `Available: ${available}, ` +
                `Required: ${required}.`
            );
        }
    }
}

// ============================================================
// CHECK EXISTING PENDING PAYMENT
// ============================================================

async function checkExistingPendingPayment(
    connection,
    user
) {
    const [rows] =
        await connection.query(
            `
            SELECT
                p.payment_id,
                p.sale_id,
                p.transaction_ref,
                s.invoice_number,
                s.created_at
            FROM payments p
            INNER JOIN sales s
                ON s.sale_id = p.sale_id
                AND s.business_id = p.business_id
            WHERE p.business_id = ?
            AND p.payment_method = 'Mobile Money'
            AND p.payment_status = 'Pending'
            AND s.sale_status = 'Pending'
            AND s.cashier_id = ?
            AND ${branchCondition("p.branch_id")}
            AND s.created_at >=
                DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            ORDER BY p.payment_id DESC
            LIMIT 1
            `,
            [
                user.businessId,
                user.userId,
                user.branchId,
                user.branchId
            ]
        );

    return rows[0] || null;
}

// ============================================================
// COPY CART TO SALE
// ============================================================

async function copyCartToSale(
    connection,
    user,
    saleId,
    cart
) {
    for (const item of cart) {
        await connection.query(
            `
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
                total_price,
                sale_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `,
            [
                user.businessId,
                user.branchId,
                saleId,
                user.userId,
                item.product_id,
                item.product_name,
                item.quantity,
                item.Selling_price,
                item.cost_price,
                item.product_discount,
                item.total_price
            ]
        );
    }
}

// ============================================================
// CLEAR CART
// ============================================================

async function clearCart(
    connection,
    user
) {
    await connection.query(
        `
        DELETE FROM sales_item_initial
        WHERE UserID = ?
        AND business_id = ?
        AND ${branchCondition("branch_id")}
        `,
        [
            user.userId,
            user.businessId,
            user.branchId,
            user.branchId
        ]
    );
}

// ============================================================
// FIFO STOCK DEDUCTION
// ============================================================

async function deductStockForSale(
    connection,
    saleId,
    user
) {
    const [saleItems] =
        await connection.query(
            `
            SELECT
                sale_item_id,
                product_id,
                product_name,
                quantity
            FROM sales_item
            WHERE sale_id = ?
            AND business_id = ?
            AND ${branchCondition("branch_id")}
            FOR UPDATE
            `,
            [
                saleId,
                user.businessId,
                user.branchId,
                user.branchId
            ]
        );

    if (saleItems.length === 0) {
        throw new Error(
            "No sale items were found."
        );
    }

    /*
     * stock_movements.branch_id is NOT NULL.
     *
     * Therefore a stock sale must have a branch.
     */
    if (user.branchId === null) {
        throw new Error(
            "A branch is required to complete a stock sale."
        );
    }

    for (const item of saleItems) {
        let remaining =
            Number(item.quantity);

        const [batches] =
            await connection.query(
                `
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
                `,
                [
                    item.product_id,
                    user.businessId,
                    user.branchId
                ]
            );

        const available =
            batches.reduce(
                (sum, batch) =>
                    sum +
                    Number(
                        batch.quantity_available
                    ),
                0
            );

        if (available < remaining) {
            throw new Error(
                `Insufficient stock for ${item.product_name}.`
            );
        }

        for (const batch of batches) {
            if (remaining <= 0) {
                break;
            }

            const availableInBatch =
                Number(
                    batch.quantity_available
                );

            const deduction =
                Math.min(
                    availableInBatch,
                    remaining
                );

            const newQuantity =
                availableInBatch -
                deduction;

            await connection.query(
                `
                UPDATE stock
                SET quantity_available = ?
                WHERE stock_id = ?
                AND product_id = ?
                AND business_id = ?
                AND branch_id = ?
                `,
                [
                    newQuantity,
                    batch.stock_id,
                    item.product_id,
                    user.businessId,
                    user.branchId
                ]
            );

            await connection.query(
                `
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
                VALUES
                (
                    ?, ?, ?, ?,
                    'OUT',
                    'SALE',
                    ?,
                    'SALE',
                    ?,
                    ?,
                    ?,
                    NOW()
                )
                `,
                [
                    user.businessId,
                    item.product_id,
                    batch.stock_id,
                    user.branchId,
                    deduction,
                    saleId,
                    user.userId,
                    "Stock deducted for completed sale"
                ]
            );

            remaining -= deduction;
        }
    }
}

// ============================================================
// RECEIPT
// ============================================================

async function buildReceipt(
    connection,
    saleId,
    user
) {
    const [saleRows] =
        await connection.query(
            `
            SELECT
                s.sale_id,
                s.invoice_number,
                s.cashier_id,
                s.customer_id,
                c.customer_name,
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
            LEFT JOIN customers c
                ON c.customer_id =
                    s.customer_id
                AND c.business_id =
                    s.business_id
            WHERE s.sale_id = ?
            AND s.business_id = ?
            AND ${branchCondition("s.branch_id")}
            LIMIT 1
            `,
            [
                saleId,
                user.businessId,
                user.branchId,
                user.branchId
            ]
        );

    if (saleRows.length === 0) {
        throw new Error(
            "Completed sale could not be retrieved."
        );
    }

    const sale =
        saleRows[0];

    const [items] =
        await connection.query(
            `
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
            AND ${branchCondition("branch_id")}
            ORDER BY sale_item_id ASC
            `,
            [
                saleId,
                user.businessId,
                user.branchId,
                user.branchId
            ]
        );

    return {
        sale_id:
            sale.sale_id,

        invoice_number:
            sale.invoice_number,

        cashier_id:
            sale.cashier_id,

        customer_id:
            sale.customer_id,

        customer_name:
            sale.customer_name || null,

        subtotal:
            sale.subtotal,

        discount:
            sale.discount,

        tax:
            sale.tax,

        GrandTotal:
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

        items
    };
}


async function completeMobileMoneySale(
    connection,
    payment,
    transaction,
    user
) {
   

    if (
        payment.payment_status === "Paid"
    ) {
        return buildReceipt(
            connection,
            payment.sale_id,
            user
        );
    }


    if (
        payment.payment_status !== "Pending"
    ) {
        throw new Error(
            "Payment is no longer pending."
        );
    }


    if (
        transaction.status !== "success"
    ) {
        throw new Error(
            "Payment has not been confirmed as successful."
        );
    }


    if (
        transaction.currency &&
        transaction.currency !== "GHS"
    ) {
        throw new Error(
            "Payment currency does not match GHS."
        );
    }


    if (
        Number(transaction.amount) !==
        pesewas(payment.amount)
    ) {
        throw new Error(
            "Paystack payment amount does not match the payment amount."
        );
    }


    const [paymentUpdate] =
        await connection.query(
            `
            UPDATE payments
            SET
                payment_status = 'Paid',
                paid_at = NOW()
            WHERE payment_id = ?
              AND business_id = ?
              AND branch_id = ?
              AND payment_status = 'Pending'
            `,
            [
                payment.payment_id,
                user.businessId,
                user.branchId
            ]
        );

    if (
        paymentUpdate.affectedRows !== 1
    ) {

        const [currentPaymentRows] =
            await connection.query(
                `
                SELECT
                    payment_id,
                    sale_id,
                    payment_status

                FROM payments

                WHERE payment_id = ?
                  AND business_id = ?
                  AND branch_id = ?

                LIMIT 1

                FOR UPDATE
                `,
                [
                    payment.payment_id,
                    user.businessId,
                    user.branchId
                ]
            );

        const currentPayment =
            currentPaymentRows.length > 0
                ? currentPaymentRows[0]
                : null;

        if (
            currentPayment &&
            currentPayment.payment_status === "Paid"
        ) {
            return buildReceipt(
                connection,
                payment.sale_id,
                user
            );
        }

        throw new Error(
            "Payment could not be marked as paid."
        );
    }

    const splitUser = {
        id: user.userId,
        business_id: user.businessId,
        branch_id: user.branchId
    };

    const finalization =
        await finalizeSaleIfEligible(
            connection,
            splitUser,
            payment.sale_id
        );

    // --------------------------------------------------------
    // 8. CLEAR CART ONLY WHEN SALE IS COMPLETED
    // --------------------------------------------------------

    if (
        finalization.finalized
    ) {
        await clearCart(
            connection,
            user
        );
    }

    // --------------------------------------------------------
    // 9. RETURN RECEIPT / CURRENT SALE
    // --------------------------------------------------------

    return buildReceipt(
        connection,
        payment.sale_id,
        user
    );
}



// ============================================================
// INITIATE MOBILE MONEY
// ============================================================

exports.initiateMobileMoneyPayment =
async (req, res) => {
    let connection = null;

    try {
        const user =
            getSessionUser(req);

        const {
            total_amount,
            network,
            phone,
            customer_id
        } = req.body;

        const requestedAmount =
            Number(total_amount);

        if (
            !Number.isFinite(
                requestedAmount
            ) ||
            requestedAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid payment amount."
            });
        }

        const provider =
            MOBILE_MONEY_PROVIDERS[
                String(network || "").trim()
            ];

        if (!provider) {
            return res.status(400).json({
                success: false,
                message:
                    "Please select a valid Mobile Money network."
            });
        }

        const cleanedPhone =
            String(phone || "")
                .replace(/\s+/g, "");

        if (
            !/^0\d{9}$/.test(
                cleanedPhone
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Please enter a valid Ghana phone number."
            });
        }

        if (!user.email) {
            return res.status(400).json({
                success: false,
                message:
                    "An email address is required for payment."
            });
        }

        // ----------------------------------------------------
        // PREPARE SALE
        //
        // No external Paystack request is made while a
        // database transaction is open.
        // ----------------------------------------------------

        connection =
            await db.getConnection();

        await connection.beginTransaction();

        // ----------------------------------------------------
        // PREVENT DUPLICATE PAYMENT ATTEMPTS
        // ----------------------------------------------------

        const existing =
            await checkExistingPendingPayment(
                connection,
                user
            );

        if (existing) {
            await connection.rollback();

            connection.release();
            connection = null;

            return res.status(409).json({
                success: false,
                payment_in_progress: true,
                reference:
                    existing.transaction_ref,
                invoice_number:
                    existing.invoice_number,
                message:
                    "A Mobile Money payment is already in progress for this cashier."
            });
        }

        // ----------------------------------------------------
        // CART
        // ----------------------------------------------------

        const cart =
            await getCart(
                connection,
                user,
                true
            );

        if (cart.length === 0) {
            throw new Error(
                "Your cart is empty."
            );
        }

        // ----------------------------------------------------
        // CUSTOMER
        // ----------------------------------------------------

        const customerId =
            await validateCustomer(
                connection,
                user,
                customer_id
            );

        // ----------------------------------------------------
        // TOTALS
        // ----------------------------------------------------

        const totals =
            await calculateSaleTotals(
                connection,
                user,
                cart
            );

        if (
            Math.abs(
                money(requestedAmount) -
                totals.grandTotal
            ) > 0.01
        ) {
            throw new Error(
                "Payment amount does not match the actual sale total."
            );
        }

        // ----------------------------------------------------
        // STOCK
        // ----------------------------------------------------

        await validateStock(
            connection,
            user,
            cart
        );

        // ----------------------------------------------------
        // GENERATE IDENTIFIERS
        // ----------------------------------------------------

        const invoiceNumber =
            generateInvoiceNumber();

        const reference =
            generatePaymentReference();

        // ----------------------------------------------------
        // CREATE PENDING SALE
        // ----------------------------------------------------

        const [saleResult] =
            await connection.query(
                `
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
                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    user.businessId,
                    invoiceNumber,
                    user.userId,
                    user.branchId,
                    customerId,
                    totals.subtotal,
                    totals.discountAmount,
                    totals.taxAmount,
                    totals.grandTotal,
                    0,
                    0,
                    "Mobile Money",
                    "Pending"
                ]
            );

        const saleId =
            saleResult.insertId;

        // ----------------------------------------------------
        // COPY CART
        // ----------------------------------------------------

        await copyCartToSale(
            connection,
            user,
            saleId,
            cart
        );

        // ----------------------------------------------------
        // CREATE PENDING PAYMENT
        //
        // We use our own reference and send the same
        // reference to Paystack.
        // ----------------------------------------------------

        await connection.query(
            `
            INSERT INTO payments
            (
                business_id,
                branch_id,
                sale_id,
                payment_method,
                amount,
                change_given,
                transaction_ref,
                payment_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                user.businessId,
                user.branchId,
                saleId,
                "Mobile Money",
                totals.grandTotal,
                0,
                reference,
                "Pending"
            ]
        );

        await connection.commit();

        connection.release();
        connection = null;

        // ----------------------------------------------------
        // PAYSTACK REQUEST
        //
        // IMPORTANT:
        // No database transaction is held here.
        // ----------------------------------------------------

        let paystackResponse;

        try {
            paystackResponse =
                await axios.post(
                    `${PAYSTACK_BASE_URL}/charge`,
                    {
                        email:
                            user.email,

                        amount:
                            pesewas(
                                totals.grandTotal
                            ),

                        currency:
                            "GHS",

                        reference,

                        mobile_money: {
                            phone:
                                cleanedPhone,

                            provider
                        },

                        metadata: {
                            sale_id:
                                String(saleId),

                            invoice_number:
                                invoiceNumber,

                            business_id:
                                String(
                                    user.businessId
                                ),

                            branch_id:
                                user.branchId === null
                                    ? null
                                    : String(
                                        user.branchId
                                    ),

                            mobile_money_network:
                                String(network),

                            mobile_money_phone:
                                cleanedPhone
                        }
                    },
                    {
                        headers:
                            paystackHeaders(),

                        timeout: 15000
                    }
                );

        } catch (paystackError) {

            /*
             * A network timeout/error does NOT automatically
             * mean the charge failed. Paystack recommends
             * checking a pending charge after waiting.
             *
             * Therefore leave our payment as Pending.
             */

            console.error(
                "Paystack charge request error:",
                paystackError.response?.data ||
                paystackError.message
            );

            return res.status(202).json({
                success: true,
                pending: true,
                sale_id: saleId,
                invoice_number:
                    invoiceNumber,
                reference,
                status: "pending",
                message:
                    "The payment request is being processed. Please wait for confirmation."
            });
        }

        const paystackData =
            paystackResponse.data;

        if (
            !paystackData?.status ||
            !paystackData?.data
        ) {
            await markPaymentFailed(
                saleId,
                user
            );

            return res.status(400).json({
                success: false,
                message:
                    paystackData?.message ||
                    "Paystack could not initiate the payment."
            });
        }

        const transaction =
            paystackData.data;

        /*
         * Paystack should return the same reference
         * we supplied.
         */
        if (
            transaction.reference &&
            transaction.reference !== reference
        ) {
            await markPaymentFailed(
                saleId,
                user
            );

            return res.status(400).json({
                success: false,
                message:
                    "Payment reference mismatch."
            });
        }

        return res.status(200).json({
            success: true,

            sale_id:
                saleId,

            invoice_number:
                invoiceNumber,

            reference,

            status:
                transaction.status,

            message:
                transaction.display_text ||
                "Payment request sent. Please approve the payment on your phone."
        });

    } catch (error) {

        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Rollback error:",
                    rollbackError
                );
            }

            connection.release();
        }

        console.error(
            "Mobile Money initiation error:",
            error.response?.data ||
            error.message
        );

        if (
            error.message ===
            "AUTH_REQUIRED"
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Your session has expired. Please log in again."
            });
        }

        if (
            error.message ===
            "INVALID_SESSION"
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Invalid user session."
            });
        }

        if (
            error.message ===
            "INVALID_BRANCH"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid branch information."
            });
        }

        if (
            error.message ===
            "PAYSTACK_NOT_CONFIGURED"
        ) {
            return res.status(500).json({
                success: false,
                message:
                    "Payment service is not configured."
            });
        }

        return res.status(400).json({
            success: false,
            message:
                error.message ||
                "Unable to initiate Mobile Money payment."
        });
    }
};

// ============================================================
// MARK PAYMENT FAILED
// ============================================================

async function markPaymentFailed(
    saleId,
    user
) {
    let connection = null;

    try {
        connection =
            await db.getConnection();

        await connection.beginTransaction();

        await connection.query(
            `
            UPDATE payments
            SET payment_status = 'Failed'
            WHERE sale_id = ?
            AND business_id = ?
            AND payment_status = 'Pending'
            `,
            [
                saleId,
                user.businessId
            ]
        );

        await connection.query(
            `
            UPDATE sales
            SET sale_status = 'Cancelled'
            WHERE sale_id = ?
            AND business_id = ?
            AND sale_status = 'Pending'
            `,
            [
                saleId,
                user.businessId
            ]
        );

        await connection.commit();

    } catch (error) {

        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {}
        }

        console.error(
            "Unable to mark payment failed:",
            error.message
        );

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// ============================================================
// VERIFY MOBILE MONEY STATUS
// ============================================================
exports.checkMobileMoneyStatus =
async (req, res) => {
    let connection = null;

    try {
        const user =
            getSessionUser(req);

        const reference =
            String(
                req.params.reference || ""
            ).trim();

        if (!reference) {
            return res.status(400).json({
                success: false,
                message:
                    "Payment reference is required."
            });
        }


        const response =
            await axios.get(
                `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
                {
                    headers:
                        paystackHeaders(),

                    timeout: 15000
                }
            );

        const paystackData =
            response.data;

        if (
            !paystackData?.status ||
            !paystackData?.data
        ) {
            return res.status(400).json({
                success: false,
                message:
                    paystackData?.message ||
                    "Unable to verify payment."
            });
        }

        const transaction =
            paystackData.data;


        connection =
            await db.getConnection();

        await connection.beginTransaction();


        const [payments] =
            await connection.query(
                `
                SELECT
                    p.payment_id,
                    p.sale_id,
                    p.amount,
                    p.payment_status,
                    p.payment_method,
                    p.business_id,
                    p.branch_id,
                    s.cashier_id

                FROM payments p

                INNER JOIN sales s
                    ON s.sale_id = p.sale_id
                    AND s.business_id = p.business_id
                    AND s.branch_id = p.branch_id

                WHERE p.transaction_ref = ?
                  AND p.business_id = ?
                  AND ${branchCondition("p.branch_id")}

                LIMIT 1

                FOR UPDATE
                `,
                [
                    reference,
                    user.businessId,
                    user.branchId,
                    user.branchId
                ]
            );

        if (payments.length === 0) {
            throw new Error(
                "Payment record was not found."
            );
        }

        const payment =
            payments[0];


        if (
            Number(payment.cashier_id) !==
            Number(user.userId)
        ) {
            throw new Error(
                "You are not authorized to access this payment."
            );
        }


        if (
            payment.payment_method !==
            "Mobile Money"
        ) {
            throw new Error(
                "This payment reference does not belong to a Mobile Money payment."
            );
        }



        if (
            payment.payment_status ===
            "Paid"
        ) {
            const receipt =
                await buildReceipt(
                    connection,
                    payment.sale_id,
                    user
                );

            await connection.commit();

            connection.release();
            connection = null;

            return res.json({
                success: true,
                status: "success",
                reference,

                message:
                    "Mobile Money payment successful.",

                receipt: {
                    ...receipt,

                    transaction_ref:
                        reference,

                    payment_status:
                        "PAID"
                }
            });
        }


        if (
            transaction.status ===
            "success"
        ) {
          

            const receipt =
                await completeMobileMoneySale(
                    connection,
                    payment,
                    transaction,
                    user
                );

            await connection.commit();

            connection.release();
            connection = null;

            return res.json({
                success: true,
                status: "success",
                reference,

                message:
                    "Mobile Money payment successful.",

                receipt: {
                    ...receipt,

                    network:
                        transaction.metadata
                            ?.mobile_money_network ||
                        "---",

                    phone:
                        transaction.metadata
                            ?.mobile_money_phone ||
                        transaction.authorization
                            ?.mobile_money_number ||
                        "---",

                    transaction_ref:
                        reference,

                    payment_status:
                        "PAID"
                }
            });
        }


        if (
            transaction.status === "failed" ||
            transaction.status === "abandoned" ||
            transaction.status === "timeout"
        ) {
            
            await connection.query(
                `
                UPDATE payments

                SET
                    payment_status = 'Failed'

                WHERE payment_id = ?
                  AND business_id = ?
                  AND branch_id = ?
                  AND payment_status = 'Pending'
                `,
                [
                    payment.payment_id,
                    user.businessId,
                    user.branchId
                ]
            );

            /*
             * Do NOT cancel the sale here.
             *
             * The sale remains Pending if money is
             * still outstanding.
             */

            await connection.commit();

            connection.release();
            connection = null;

            return res.json({
                success: true,

                status:
                    transaction.status,

                reference,

                message:
                    transaction.message ||
                    "Mobile Money payment failed.",

                payment_status:
                    "FAILED"
            });
        }

        // ----------------------------------------------------
        // STILL PENDING
        // ----------------------------------------------------

        await connection.rollback();

        connection.release();
        connection = null;

        return res.json({
            success: true,

            status:
                transaction.status ||
                "pending",

            reference,

            message:
                transaction.display_text ||
                "Payment is still waiting for confirmation."
        });

    } catch (error) {

        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Rollback error:",
                    rollbackError
                );
            }

            connection.release();
        }

        console.error(
            "Mobile Money verification error:",
            error.response?.data ||
            error.message
        );

        if (
            error.message ===
            "AUTH_REQUIRED"
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Your session has expired. Please log in again."
            });
        }

        if (
            error.message ===
            "INVALID_SESSION"
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Invalid user session."
            });
        }

        return res.status(400).json({
            success: false,
            message:
                error.message ||
                error.response?.data?.message ||
                "Unable to verify payment."
        });
    }
};


// PAYSTACK WEBHOOK

exports.paystackWebhook =
async (req, res) => {
    let connection = null;

    try {
        const signature =
            req.headers[
                "x-paystack-signature"
            ];

        if (!signature) {
            return res.sendStatus(400);
        }

        if (
            !process.env.PAYSTACK_SECRET_KEY
        ) {
            console.error(
                "Paystack secret key is missing."
            );

            return res.sendStatus(500);
        }


        const rawBody =
            Buffer.isBuffer(req.body)
                ? req.body
                : Buffer.from(
                    JSON.stringify(
                        req.body
                    )
                );

        const expectedHash =
            crypto
                .createHmac(
                    "sha512",
                    process.env.PAYSTACK_SECRET_KEY
                )
                .update(rawBody)
                .digest("hex");

        const receivedSignature =
            String(signature)
                .trim()
                .toLowerCase();

        if (
            expectedHash.length !==
            receivedSignature.length
        ) {
            return res.sendStatus(401);
        }

        const validSignature =
            crypto.timingSafeEqual(
                Buffer.from(
                    expectedHash,
                    "utf8"
                ),
                Buffer.from(
                    receivedSignature,
                    "utf8"
                )
            );

        if (!validSignature) {
            return res.sendStatus(401);
        }


        let event;

        try {
            event =
                JSON.parse(
                    rawBody.toString(
                        "utf8"
                    )
                );
        } catch (parseError) {
            return res.sendStatus(400);
        }

        if (
            event.event !==
            "charge.success"
        ) {
            return res.sendStatus(200);
        }

        const transaction =
            event.data;

        if (
            !transaction ||
            transaction.status !== "success"
        ) {
            return res.sendStatus(200);
        }

        const reference =
            transaction.reference;

        if (!reference) {
            return res.sendStatus(200);
        }


        connection =
            await db.getConnection();

        await connection.beginTransaction();


        const [payments] =
            await connection.query(
                `
                SELECT
                    p.payment_id,
                    p.sale_id,
                    p.amount,
                    p.payment_status,
                    p.business_id,
                    p.branch_id,
                    p.payment_method,
                    s.cashier_id

                FROM payments p

                INNER JOIN sales s
                    ON s.sale_id = p.sale_id
                    AND s.business_id = p.business_id
                    AND s.branch_id = p.branch_id

                WHERE p.transaction_ref = ?

                LIMIT 1

                FOR UPDATE
                `,
                [
                    reference
                ]
            );

        if (payments.length === 0) {

            await connection.rollback();

            connection.release();
            connection = null;

            console.log(
                "Paystack payment not found:",
                reference
            );


            return res.sendStatus(200);
        }

        const payment =
            payments[0];


        if (
            payment.payment_method !==
            "Mobile Money"
        ) {
            await connection.rollback();

            connection.release();
            connection = null;

            return res.sendStatus(200);
        }


        if (
            payment.payment_status ===
            "Paid"
        ) {
            await connection.rollback();

            connection.release();
            connection = null;


            return res.sendStatus(200);
        }


        if (
            Number(transaction.amount) !==
            pesewas(payment.amount)
        ) {
            await connection.rollback();

            connection.release();
            connection = null;

            console.error(
                "Paystack amount mismatch:",
                reference
            );


            return res.sendStatus(200);
        }


        if (
            transaction.currency &&
            transaction.currency !== "GHS"
        ) {
            await connection.rollback();

            connection.release();
            connection = null;

            console.error(
                "Paystack currency mismatch:",
                reference
            );

            return res.sendStatus(200);
        }


        const user = {
            userId:
                Number(
                    payment.cashier_id
                ),

            businessId:
                Number(
                    payment.business_id
                ),

            branchId:
                payment.branch_id === null
                    ? null
                    : Number(
                        payment.branch_id
                    )
        };


        await completeMobileMoneySale(
            connection,
            payment,
            transaction,
            user
        );


        await connection.commit();

        connection.release();
        connection = null;

        console.log(
            "Mobile Money payment processed:",
            reference
        );

        return res.sendStatus(200);

    } catch (error) {

        if (connection) {

            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Webhook rollback error:",
                    rollbackError
                );
            }

            connection.release();
        }

        console.error(
            "Paystack webhook error:",
            error.response?.data ||
            error.message
        );

        return res.sendStatus(500);
    }
};

// ============================================================
// TEST PAYSTACK
// ============================================================

exports.testPaystack =
async (req, res) => {
    try {
        if (
            !process.env.PAYSTACK_SECRET_KEY
        ) {
            return res.status(500).json({
                success: false,
                message:
                    "PAYSTACK_SECRET_KEY is not configured."
            });
        }

        await axios.get(
            `${PAYSTACK_BASE_URL}/balance`,
            {
                headers:
                    paystackHeaders(),

                timeout: 10000
            }
        );

        return res.json({
            success: true,
            message:
                "Paystack connection successful."
        });

    } catch (error) {

        console.error(
            "Paystack authentication error:",
            error.response?.data ||
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Paystack authentication failed."
        });
    }
};

exports.initiateSplitMobileMoneyPayment = initiateSplitMobileMoneyPayment;