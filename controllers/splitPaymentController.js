"use strict";

const db = require("../Database/db");

const {
    initiateSplitMobileMoneyPayment
} = require("../services/paystackMobileMoney");

/*  MONEY HELPERS */

function money(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }
    return Math.round(number * 100) / 100;
}


function normalizeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : NaN;
}


function nullableString(value) {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
    ) {
        return null;
    }

    return String(value).trim();
}


/* =========================================================================
   PAYMENT METHOD
========================================================================= */

function normalizePaymentMethod(value) {
    const method =
        String(value || "")
            .trim();

    const allowed = [
        "Cash",
        "Mobile Money",
        "Card",
        "Bank Transfer"
    ];

    return allowed.includes(method)
        ? method
        : null;
}


/* =========================================================================
   AUTHENTICATION
========================================================================= */

function getBranchUser(req, res) {

    const sessionUser =
        req.session?.user;

    if (!sessionUser) {

        res.status(401).json({
            success: false,
            message: "Authentication required."
        });

        return null;
    }


    const userId =
        Number(
            sessionUser.UserID ??
            sessionUser.id
        );


    const businessId =
        Number(
            sessionUser.business_id
        );


    const branchId =
        sessionUser.branch_id === null ||
        sessionUser.branch_id === undefined ||
        sessionUser.branch_id === ""
            ? null
            : Number(
                sessionUser.branch_id
            );


    if (
        !Number.isInteger(userId) ||
        userId <= 0
    ) {

        res.status(401).json({
            success: false,
            message: "Invalid user session."
        });

        return null;
    }


    if (
        !Number.isInteger(businessId) ||
        businessId <= 0
    ) {

        res.status(403).json({
            success: false,
            message:
                "Your account is not assigned to a business."
        });

        return null;
    }


    if (
        !Number.isInteger(branchId) ||
        branchId <= 0
    ) {

        res.status(403).json({
            success: false,
            message:
                "Your account is not assigned to a branch."
        });

        return null;
    }


    return {
        id: userId,
        business_id: businessId,
        branch_id: branchId,

        email:
            sessionUser.Email ||
            sessionUser.email ||
            null,

        role:
            sessionUser.RoleName ||
            sessionUser.role ||
            null
    };
}


/* =========================================================================
   BRANCH CONDITION
========================================================================= */

function branchCondition(
    column = "branch_id"
) {

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


/* =========================================================================
   TAX / DISCOUNT
   -------------------------------------------------------------------------
   This follows the branch-aware structure used by the current POS system.
========================================================================= */

async function getTaxAndDiscount(
    connection,
    user
) {

    const [rows] =
        await connection.query(`
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
        `, [
            user.business_id,
            user.branch_id,
            user.branch_id
        ]);


    if (rows.length === 0) {

        return {
            taxRate: 0,
            discountRate: 0
        };
    }


    return {
        taxRate:
            money(
                rows[0].tax_rate
            ),

        discountRate:
            money(
                rows[0].discount_rate
            )
    };
}


/* =========================================================================
   CART TOTALS
========================================================================= */

function calculateCartTotals(
    cartItems,
    taxRate,
    discountRate
) {

    let subtotal = 0;


    for (const item of cartItems) {

        const quantity =
            Number(item.quantity);

        const sellingPrice =
            Number(item.Selling_price);


        if (
            !Number.isFinite(quantity) ||
            !Number.isFinite(sellingPrice)
        ) {
            throw new Error(
                `Invalid price or quantity for ${item.product_name}.`
            );
        }


        subtotal +=
            quantity *
            sellingPrice;
    }


    subtotal =
        money(subtotal);


    const discountAmount =
        money(
            subtotal *
            (Number(discountRate) / 100)
        );


    const taxableAmount =
        money(
            subtotal -
            discountAmount
        );


    const taxAmount =
        money(
            taxableAmount *
            (Number(taxRate) / 100)
        );


    const grandTotal =
        money(
            taxableAmount +
            taxAmount
        );


    return {
        subtotal,
        discountRate:
            money(discountRate),
        discountAmount,
        taxRate:
            money(taxRate),
        taxAmount,
        grandTotal
    };
}


/* =========================================================================
   GET CURRENT CART
========================================================================= */

async function getCart(
    connection,
    user
) {

    const [rows] =
        await connection.query(`
            SELECT
                sales_id,
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
              AND branch_id = ?

            ORDER BY sales_id ASC

            FOR UPDATE
        `, [
            user.id,
            user.business_id,
            user.branch_id
        ]);


    return rows;
}


/* =========================================================================
   CUSTOMER VALIDATION
========================================================================= */

async function validateCustomer(
    connection,
    user,
    customerId
) {

    if (
        customerId === null ||
        customerId === undefined
    ) {
        return null;
    }


    const id =
        Number(customerId);


    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {
        throw new Error(
            "Invalid customer selected."
        );
    }


    const [rows] =
        await connection.query(`
            SELECT
                customer_id,
                customer_code,
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
              AND status = 'Active'

            LIMIT 1

            FOR UPDATE
        `, [
            id,
            user.business_id,
            user.branch_id
        ]);


    if (rows.length === 0) {

        throw new Error(
            "Selected customer was not found or is inactive."
        );
    }


    return rows[0];
}


/* =========================================================================
   STOCK VALIDATION
========================================================================= */

async function buildStockPlan(
    connection,
    user,
    cartItems
) {

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

            if (
                remaining <= 0
            ) {
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


            remaining -=
                deduction;
        }


        if (remaining > 0) {

            throw new Error(
                `Unable to prepare stock deduction for ${item.product_name}.`
            );
        }


        stockPlan.push({
            item,
            deductions
        });
    }


    return stockPlan;
}


/* =========================================================================
   DEDUCT STOCK
   -------------------------------------------------------------------------
   IMPORTANT:
   This function is only called when a sale is eligible for finalization.
   It must NEVER be called once per payment.
========================================================================= */

async function deductStockForSale(
    connection,
    user,
    saleId,
    stockPlan
) {

    for (
        const plan
        of stockPlan
    ) {

        for (
            const deduction
            of plan.deductions
        ) {

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
                "Stock deducted for split-payment sale"
            ]);
        }
    }
}


/* =========================================================================
   CHECK WHETHER STOCK WAS ALREADY DEDUCTED
========================================================================= */

async function isStockAlreadyDeducted(
    connection,
    user,
    saleId
) {

    const [rows] =
        await connection.query(`
            SELECT movement_id

            FROM stock_movements

            WHERE business_id = ?
              AND branch_id = ?
              AND reference_type = 'SALE'
              AND reference_id = ?
              AND movement_type = 'OUT'
              AND movement_reason = 'SALE'

            LIMIT 1
        `, [
            user.business_id,
            user.branch_id,
            saleId
        ]);


    return rows.length > 0;
}

/* =========================================================================
   CALCULATE PAYMENT SUMMARY
   -------------------------------------------------------------------------
   Only payments with status = Paid count as money actually received.

   Approved Pay Later credit is tracked separately.
   It does NOT increase totalPaid because it is not money received.
========================================================================= */

async function getPaymentSummary(
    connection,
    user,
    saleId,
    lockSale = false
) {

    const saleLock =
        lockSale
            ? "FOR UPDATE"
            : "";


    /* ---------------------------------------------------------------------
       SALE
    --------------------------------------------------------------------- */

    const [saleRows] =
        await connection.query(`
            SELECT
                sale_id,
                business_id,
                branch_id,
                invoice_number,
                cashier_id,
                customer_id,
                subtotal,
                discount,
                tax,
                GrandTotal,
                amount_paid,
                change_given,
                payment_method,
                sale_status,
                created_at

            FROM sales

            WHERE sale_id = ?
              AND business_id = ?
              AND (
                    branch_id = ?

                    OR (
                        branch_id IS NULL
                        AND ? IS NULL
                    )
                  )

            LIMIT 1

            ${saleLock}
        `, [
            saleId,
            user.business_id,
            user.branch_id,
            user.branch_id
        ]);


    if (
        saleRows.length === 0
    ) {

        throw new Error(
            "Sale not found."
        );
    }


    const sale =
        saleRows[0];


    /* ---------------------------------------------------------------------
       PAYMENTS
       ---------------------------------------------------------------------
       Only Paid payments count as money actually received.
    --------------------------------------------------------------------- */

    const [paymentRows] =
        await connection.query(`
            SELECT
                payment_id,
                payment_method,
                amount,
                change_given,
                transaction_ref,
                payment_status,
                paid_at

            FROM payments

            WHERE sale_id = ?
              AND business_id = ?
              AND (
                    branch_id = ?

                    OR (
                        branch_id IS NULL
                        AND ? IS NULL
                    )
                  )

            ORDER BY
                payment_id ASC
        `, [
            saleId,
            user.business_id,
            user.branch_id,
            user.branch_id
        ]);


    /* ---------------------------------------------------------------------
       ACTUAL MONEY PAID
    --------------------------------------------------------------------- */

    const totalPaid =
        money(
            paymentRows
                .filter(
                    payment =>
                        payment.payment_status ===
                        "Paid"
                )
                .reduce(
                    (sum, payment) =>
                        sum +
                        Number(payment.amount),
                    0
                )
        );


    /* ---------------------------------------------------------------------
       PENDING PAYMENTS
    --------------------------------------------------------------------- */

    const totalPending =
        money(
            paymentRows
                .filter(
                    payment =>
                        payment.payment_status ===
                        "Pending"
                )
                .reduce(
                    (sum, payment) =>
                        sum +
                        Number(payment.amount),
                    0
                )
        );


    /* ---------------------------------------------------------------------
       REFUNDED PAYMENTS
    --------------------------------------------------------------------- */

    const totalRefunded =
        money(
            paymentRows
                .filter(
                    payment =>
                        payment.payment_status ===
                        "Refunded"
                )
                .reduce(
                    (sum, payment) =>
                        sum +
                        Number(payment.amount),
                    0
                )
        );


    /* ---------------------------------------------------------------------
       PAY LATER / CREDIT REQUEST
       --------------------------------------------------------------------- */

    const [creditRows] =
        await connection.query(`
            SELECT
                request_id,
                customer_id,
                requested_amount,
                approved_amount,
                status,
                requested_by,
                approved_by,
                requested_at,
                approved_at,
                rejection_reason,
                approval_note

            FROM sale_credit_requests

            WHERE sale_id = ?
              AND business_id = ?
              AND (
                    branch_id = ?

                    OR (
                        branch_id IS NULL
                        AND ? IS NULL
                    )
                  )

            ORDER BY
                request_id DESC
        `, [
            saleId,
            user.business_id,
            user.branch_id,
            user.branch_id
        ]);


    /*
       There may be more than one historical request.

       Only the latest request is used for the current credit state.
    */

    const creditRequest =
        creditRows.length > 0
            ? creditRows[0]
            : null;


    /* ---------------------------------------------------------------------
       CREDIT AMOUNTS
    --------------------------------------------------------------------- */

    const requestedCredit =
        creditRequest
            ? money(
                Number(
                    creditRequest.requested_amount
                )
            )
            : 0;


    const approvedCredit =
        creditRequest &&
        creditRequest.status === "Approved"
            ? money(
                Number(
                    creditRequest.approved_amount ??
                    creditRequest.requested_amount
                )
            )
            : 0;


    /* ---------------------------------------------------------------------
       GRAND TOTAL
    --------------------------------------------------------------------- */

    const grandTotal =
        money(
            sale.GrandTotal
        );


    /* ---------------------------------------------------------------------
       ACTUAL OUTSTANDING
       ---------------------------------------------------------------------
       This is money still not received.

       Approved credit is authorized credit, not cash received, so we
       expose a separate "outstandingAfterCredit" value instead of
       changing totalPaid.
    --------------------------------------------------------------------- */

    const outstanding =
        money(
            grandTotal -
            totalPaid
        );


    /*
       Amount still not covered after considering:

       - actual money received
       - pending Mobile Money
       - approved Pay Later credit
    */

    const outstandingAfterPendingAndCredit =
        money(
            grandTotal -
            totalPaid -
            totalPending -
            approvedCredit
        );


    /* ---------------------------------------------------------------------
       PAYMENT STATUS
       --------------------------------------------------------------------- */

    let paymentStatus =
        "UNPAID";


    if (
        totalPaid <= 0 &&
        totalPending <= 0 &&
        approvedCredit <= 0
    ) {

        paymentStatus =
            "UNPAID";

    } else if (
        outstandingAfterPendingAndCredit > 0
    ) {

        paymentStatus =
            "PARTIALLY_PAID";

    } else if (
        outstandingAfterPendingAndCredit === 0
    ) {

        paymentStatus =
            "PAID";

    } else {

        paymentStatus =
            "OVERPAID";
    }


    /* ---------------------------------------------------------------------
       RETURN SUMMARY
    --------------------------------------------------------------------- */

    return {
        sale,
        payments: paymentRows,
        grandTotal,
        totalPaid,
        totalPending,
        totalRefunded,
        outstanding,
        requestedCredit,
        approvedCredit,
        outstandingAfterPendingAndCredit,
        creditRequest,
        creditRequests:creditRows,
        paymentStatus
    };
}


async function syncSaleAmountPaid(
    connection,
    user,
    saleId
) {

    const summary =
        await getPaymentSummary(
            connection,
            user,
            saleId,
            true
        );


    await connection.query(`
        UPDATE sales

        SET amount_paid = ?,
            change_given = 0

        WHERE sale_id = ?
          AND business_id = ?
          AND branch_id = ?
    `, [
        summary.totalPaid,
        saleId,
        user.business_id,
        user.branch_id
    ]);


    return summary;
}


async function finalizeSaleIfEligible(
    connection,
    user,
    saleId
) {
 

    const summary =
        await getPaymentSummary(
            connection,
            user,
            saleId,
            true
        );


    await connection.query(`
        UPDATE sales

        SET
            amount_paid = ?,
            change_given = 0

        WHERE sale_id = ?
          AND business_id = ?
          AND branch_id = ?
    `, [
        summary.totalPaid,
        saleId,
        user.business_id,
        user.branch_id
    ]);

    if (
        summary.sale.sale_status ===
        "Cancelled"
    ) {
        return {
            finalized: false,
            reason: "SALE_CANCELLED",
            summary
        };
    }

    if (
        summary.sale.sale_status ===
        "Completed"
    ) {
        return {
            finalized: true,
            reason: "ALREADY_COMPLETED",
            summary: {
                ...summary,
                paymentStatus: "PAID"
            }
        };
    }


    const [creditRows] =
        await connection.query(`
            SELECT
                request_id,
                requested_amount,
                approved_amount,
                status

            FROM sale_credit_requests

            WHERE sale_id = ?
              AND business_id = ?
              AND branch_id = ?

            ORDER BY request_id DESC

            LIMIT 1

            FOR UPDATE
        `, [
            saleId,
            user.business_id,
            user.branch_id
        ]);

    const creditRequest =
        creditRows.length > 0
            ? creditRows[0]
            : null;

    const approvedCredit =
        creditRequest &&
        creditRequest.status === "Approved"
            ? money(
                creditRequest.approved_amount
            )
            : 0;


    const fullyPaid =
        summary.outstanding === 0;

    const coveredByApprovedCredit =
        summary.outstanding > 0 &&
        approvedCredit >= summary.outstanding;

    if (
        fullyPaid ||
        coveredByApprovedCredit
    ) {

        const alreadyDeducted =
            await isStockAlreadyDeducted(
                connection,
                user,
                saleId
            );


        if (!alreadyDeducted) {

            const [saleItems] =
                await connection.query(`
                    SELECT
                        sale_item_id,
                        product_id,
                        product_name,
                        quantity

                    FROM sales_item

                    WHERE sale_id = ?
                      AND business_id = ?
                      AND branch_id = ?

                    ORDER BY sale_item_id ASC

                    FOR UPDATE
                `, [
                    saleId,
                    user.business_id,
                    user.branch_id
                ]);

            const stockPlan =
                await buildStockPlanFromSaleItems(
                    connection,
                    user,
                    saleItems
                );

            await deductStockForSale(
                connection,
                user,
                saleId,
                stockPlan
            );
        }

        await connection.query(`
            UPDATE sales

            SET
                amount_paid = ?,
                sale_status = 'Completed'

            WHERE sale_id = ?
              AND business_id = ?
              AND branch_id = ?
              AND sale_status <> 'Cancelled'
        `, [
            summary.totalPaid,
            saleId,
            user.business_id,
            user.branch_id
        ]);

        return {
            finalized: true,

            reason:
                fullyPaid
                    ? "FULLY_PAID"
                    : "PAY_LATER_APPROVED",

            summary: {
                ...summary,

                paymentStatus: "PAID",

                outstanding:
                    fullyPaid
                        ? 0
                        : summary.outstanding
            }
        };
    }

    await connection.query(`
        UPDATE sales

        SET
            amount_paid = ?,
            sale_status = 'Pending'

        WHERE sale_id = ?
          AND business_id = ?
          AND branch_id = ?
          AND sale_status <> 'Cancelled'
          AND sale_status <> 'Completed'
    `, [
        summary.totalPaid,
        saleId,
        user.business_id,
        user.branch_id
    ]);

    return {
        finalized: false,

        reason:
            creditRequest &&
            creditRequest.status === "Pending"
                ? "PAY_LATER_PENDING_APPROVAL"
                : "OUTSTANDING_BALANCE",

        summary: {
            ...summary,
            paymentStatus:
                summary.totalPaid > 0
                    ? "PARTIALLY_PAID"
                    : "UNPAID"
        }
    };
}


/* =========================================================================
   BUILD STOCK PLAN FROM SALE ITEMS
========================================================================= */

async function buildStockPlanFromSaleItems(
    connection,
    user,
    saleItems
) {

    const stockPlan = [];


    for (
        const item
        of saleItems
    ) {

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
                (sum, batch) =>
                    sum +
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
                `Insufficient stock for ${item.product_name}.`
            );
        }


        let remaining =
            requiredQuantity;


        const deductions = [];


        for (
            const batch
            of stockBatches
        ) {

            if (
                remaining <= 0
            ) {
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


            remaining -=
                deduction;
        }


        stockPlan.push({
            item,
            deductions
        });
    }


    return stockPlan;
}



exports.createSplitSale = async (req, res) => {

    const user = getBranchUser(req,res);


    if (!user) {return;}


    let connection = null;


    try {

        connection = await db.getConnection();


        await connection.beginTransaction();



        const cartItems = await getCart(
                connection,
                user
            );


        if (
            cartItems.length === 0
        ) {

            throw new Error(
                "Your cart is empty."
            );
        }



        const customerId =
            req.body.customer_id === null ||
            req.body.customer_id === undefined ||
            req.body.customer_id === ""
                ? null
                : Number(
                    req.body.customer_id
                );


        await validateCustomer(
            connection,
            user,
            customerId
        );



        const {
            taxRate,
            discountRate
        } =
            await getTaxAndDiscount(
                connection,
                user
            );


        const totals =
            calculateCartTotals(
                cartItems,
                taxRate,
                discountRate
            );


        const grandTotal = money(
                totals.grandTotal
            );


        if (
            grandTotal <= 0
        ) {

            throw new Error(
                "The sale total must be greater than zero."
            );
        }



        if (
            !Array.isArray(
                req.body.payments
            ) ||
            req.body.payments.length === 0
        ) {

            throw new Error(
                "At least one payment is required."
            );
        }


        const payments = [];


        for (
            const input
            of req.body.payments
        ) {

            const paymentMethod =
                normalizePaymentMethod(
                    input.payment_method
                );


            if (!paymentMethod) {

                throw new Error(
                    "Invalid payment method."
                );
            }


            const amount =
                money(
                    normalizeNumber(
                        input.amount
                    )
                );


            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                throw new Error(
                    "Every payment must have a valid amount."
                );
            }


            const transactionRef =
                nullableString(
                    input.transaction_ref
                );


            payments.push({
                payment_method: paymentMethod,
                amount,
                transaction_ref: transactionRef,

                network:nullableString( input.network ),
                phone: nullableString(input.phone)
            });
        }



        const requestedTotal =
            money(
                payments.reduce(
                    (
                        sum,
                        payment
                    ) =>
                        sum +
                        payment.amount,
                    0
                )
            );


        if (
            requestedTotal >
            grandTotal
        ) {

            throw new Error(
                "Total payment cannot exceed the sale total."
            );
        }



        const immediatePaid = money(
                payments
                    .filter(
                        payment =>
                            payment.payment_method !==
                            "Mobile Money"
                    )
                    .reduce(
                        (
                            sum,
                            payment
                        ) =>
                            sum + payment.amount,
                        0
                    )
            );


        /* -----------------------------------------------------------------
           MOBILE MONEY
           ----------------------------------------------------------------- */

        const mobileMoneyPayments =
            payments.filter(
                payment =>
                    payment.payment_method ===
                    "Mobile Money"
            );


        const mobileMoneyPending =
            money(
                mobileMoneyPayments.reduce(
                    (
                        sum,
                        payment
                    ) =>
                        sum +
                        payment.amount,
                    0
                )
            );



        if (
            mobileMoneyPayments.length > 1
        ) {

            throw new Error(
                "Only one Mobile Money payment is allowed per split sale."
            );
        }



        let mobileMoneyInput =
            null;


        if (
            mobileMoneyPayments.length === 1
        ) {

            mobileMoneyInput =
                mobileMoneyPayments[0];


            if (
                !mobileMoneyInput.network
            ) {

                throw new Error(
                    "Please select a Mobile Money network."
                );
            }


            if (
                !mobileMoneyInput.phone
            ) {

                throw new Error(
                    "Please provide the Mobile Money phone number."
                );
            }
        }

        const outstandingBeforeCredit =
            money(
                grandTotal -
                immediatePaid -
                mobileMoneyPending
            );

        const payLater =
            req.body.pay_later === true ||
            req.body.pay_later === "true";


        let creditRequest =
            null;


        if (payLater) {

            const requestedCredit =
                money(
                    normalizeNumber(
                        req.body.pay_later_amount
                    )
                );


            if (
                !Number.isFinite(
                    requestedCredit
                ) ||
                requestedCredit <= 0
            ) {

                throw new Error(
                    "Invalid Pay Later amount."
                );
            }


            if (
                requestedCredit >
                outstandingBeforeCredit
            ) {

                throw new Error(
                    "Pay Later amount cannot exceed the outstanding balance."
                );
            }


            creditRequest = {

                requestedAmount:
                    requestedCredit
            };
        }


        /* -----------------------------------------------------------------
           CREDIT AMOUNT
        ----------------------------------------------------------------- */

        const creditAmount =
            creditRequest
                ? creditRequest.requestedAmount
                : 0;


        const uncoveredBalance =
            money(
                grandTotal -
                immediatePaid -
                mobileMoneyPending -
                creditAmount
            );


        if (
            uncoveredBalance > 0
        ) {

            throw new Error(
                `Payment is incomplete. ` +
                `Uncovered balance: GH₵${uncoveredBalance.toFixed(2)}.`
            );
        }

        const canCompleteImmediately =
            immediatePaid ===
            grandTotal;


        const saleStatus =
            canCompleteImmediately
                ? "Completed"
                : "Pending";


        const invoiceNumber =
            `INV-${Date.now()}-${Math.floor(
                Math.random() * 100000
            )}`;

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
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    0,
                    'Split Payment',
                    ?
                )
            `, [
                user.business_id,
                invoiceNumber,
                user.id,
                user.branch_id,
                customerId,
                totals.subtotal,
                totals.discountAmount,
                totals.taxAmount,
                grandTotal,
                immediatePaid,
                saleStatus
            ]);


        const saleId =
            saleResult.insertId;



        for (
            const item
            of cartItems
        ) {

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

                VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
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

        const insertedPayments = [];


        let pendingMobileMoneyPayment = null;


        for (
            const payment
            of payments
        ) {

            const paymentStatus = payment.payment_method ===
                "Mobile Money"
                    ? "Pending"
                    : "Paid";


            const paidAt = paymentStatus === "Paid"
                    ? new Date()
                    : null;



            const [paymentResult] =
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

                    VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        0,
                        ?,
                        ?,
                        ?
                    )
                `, [
                    user.business_id,
                    user.branch_id,
                    saleId,
                    payment.payment_method,
                    payment.amount,
                    payment.transaction_ref,
                    paymentStatus,
                    paidAt
                ]);


            const insertedPayment = {

                payment_id:paymentResult.insertId,
                payment_method:payment.payment_method,
                amount:payment.amount,
                payment_status:paymentStatus,
                transaction_ref:payment.transaction_ref
            };


            insertedPayments.push(
                insertedPayment
            );



            if (
                payment.payment_method ===
                "Mobile Money"
            ) {

                pendingMobileMoneyPayment = {
                    payment_id:paymentResult.insertId,
                    amount: payment.amount,
                    network:payment.network,
                    phone:payment.phone,
                    transaction_ref:payment.transaction_ref
                };
            }
        }

        if (
            creditRequest &&
            creditRequest.requestedAmount > 0
        ) {

            const [creditResult] =
                await connection.query(`
                    INSERT INTO sale_credit_requests
                    (
                        business_id,
                        branch_id,
                        sale_id,
                        customer_id,
                        requested_amount,
                        status,
                        requested_by,
                        requested_at
                    )

                    VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        'Pending',
                        ?,
                        NOW()
                    )
                `, [
                    user.business_id,
                    user.branch_id,
                    saleId,
                    customerId,
                    creditRequest.requestedAmount,
                    user.id
                ]);


            creditRequest.request_id = creditResult.insertId;
            creditRequest.status = "Pending";
        }


        let finalization = null;

        if (
            canCompleteImmediately
        ) {

            finalization =
                await finalizeSaleIfEligible(
                    connection,
                    user,
                    saleId
                );
        }


        /* -----------------------------------------------------------------
           CLEAR CART
           -----------------------------------------------------------------

           If Mobile Money is pending, we still clear the temporary cart
           because the sale items have already been copied into sales_item.

           The sale itself remains Pending until payment confirmation.
        ----------------------------------------------------------------- */

        await connection.query(`
            DELETE FROM sales_item_initial

            WHERE UserID = ?
              AND business_id = ?
              AND (
                    branch_id = ?
                    OR (
                        branch_id IS NULL
                        AND ? IS NULL
                    )
                  )
        `, [
            user.id,
            user.business_id,
            user.branch_id,
            user.branch_id
        ]);


        /* -----------------------------------------------------------------
           SUMMARY BEFORE COMMIT
        ----------------------------------------------------------------- */

        const summary =
            await getPaymentSummary(
                connection,
                user,
                saleId,
                false
            );


        /*
         * Save everything to the database BEFORE calling Paystack.
         *
         * This is important because we must never hold a MySQL
         * transaction open while waiting for an external API.
         */

        await connection.commit();


        connection.release();

        connection = null;


        /* -----------------------------------------------------------------
           INITIATE MOBILE MONEY AFTER COMMIT
        ----------------------------------------------------------------- */

        let mobileMoneyResult =
            null;


        if (
            pendingMobileMoneyPayment
        ) {

            /*
             * A separate database connection is required because the
             * original transaction has already been committed/released.
             */

            const paymentConnection =
                await db.getConnection();


            try {

                /*
                 * The helper locks and verifies the exact payment
                 * using payment_id + sale_id + business + branch.
                 */

                mobileMoneyResult = await initiateSplitMobileMoneyPayment({

                        connection:
                            paymentConnection,

                        user,

                        saleId,

                        paymentId:
                            pendingMobileMoneyPayment.payment_id,

                        network:
                            pendingMobileMoneyPayment.network,

                        phone:
                            pendingMobileMoneyPayment.phone
                    });


                await paymentConnection.commit();

            } catch (paymentError) {

                /*
                 * Paystack/network failure must NOT automatically
                 * cancel the entire sale.
                 *
                 * The payment remains Pending so that the status
                 * endpoint/webhook can safely determine the final
                 * result.
                 */

                try {

                    await paymentConnection.rollback();

                } catch (rollbackError) {

                    console.error(
                        "Split Mobile Money rollback error:",
                        rollbackError
                    );
                }


                console.error(
                    "SPLIT MOBILE MONEY INITIATION ERROR:",
                    paymentError
                );


                mobileMoneyResult = {

                    success:
                        false,

                    pending:
                        true,

                    payment_id:
                        pendingMobileMoneyPayment.payment_id,

                    sale_id:
                        saleId,

                    message:
                        paymentError.message ||
                        "Mobile Money payment could not be initiated."
                };

            } finally {

                paymentConnection.release();
            }
        }


        /* -----------------------------------------------------------------
           RESPONSE
        ----------------------------------------------------------------- */

        return res.status(201).json({

            success:
                true,

            message:
                finalization?.finalized
                    ? "Split payment sale completed successfully."
                    : pendingMobileMoneyPayment
                        ? "Split payment sale created. Mobile Money payment request initiated."
                        : "Split payment sale created successfully.",

            sale: {

                sale_id:
                    saleId,

                invoice_number:
                    invoiceNumber,

                payment_mode:
                    "Split Payment",

                sale_status:
                    finalization?.finalized
                        ? "Completed"
                        : saleStatus,

                grand_total:
                    summary.grandTotal,

                amount_paid:
                    summary.totalPaid,

                pending_payment_amount:
                    summary.totalPending,

                outstanding:
                    summary.outstanding,

                payment_status:
                    summary.paymentStatus,

                credit_request:
                    creditRequest
            },

            payments:
                insertedPayments,

            mobile_money:
                mobileMoneyResult
        });


    } catch (error) {

        if (connection) {

            try {

                await connection.rollback();

            } catch (rollbackError) {

                console.error(
                    "CREATE SPLIT SALE ROLLBACK ERROR:",
                    rollbackError
                );
            }
        }


        console.error(
            "CREATE SPLIT SALE ERROR:",
            error
        );


        return res.status(400).json({
            success: false,
            message:error.message || "Unable to create split payment sale."
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
};


exports.addPayment = async (req, res) => {

    const user =
        getBranchUser(
            req,
            res
        );


    if (!user) {
        return;
    }


    const saleId =
        Number(
            req.params.saleId
        );


    if (
        !Number.isInteger(saleId) ||
        saleId <= 0
    ) {

        return res.status(400).json({
            success: false,
            message: "Invalid sale ID."
        });
    }


    const paymentMethod =
        normalizePaymentMethod(
            req.body.payment_method
        );


    if (!paymentMethod) {

        return res.status(400).json({
            success: false,
            message: "Invalid payment method."
        });
    }


    const amount =
        money(
            normalizeNumber(
                req.body.amount
            )
        );


    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {

        return res.status(400).json({
            success: false,
            message:
                "Please enter a valid payment amount."
        });
    }


    const transactionRef =
        nullableString(
            req.body.transaction_ref
        );


    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        const summary =
            await getPaymentSummary(
                connection,
                user,
                saleId,
                true
            );


        if (
            summary.sale.sale_status ===
            "Cancelled"
        ) {

            throw new Error(
                "This sale has been cancelled."
            );
        }


        if (
            summary.outstanding <= 0
        ) {

            throw new Error(
                "This sale has already been fully paid."
            );
        }


        if (
            amount >
            summary.outstanding
        ) {

            throw new Error(
                `Payment exceeds outstanding balance of ` +
                `GH₵${summary.outstanding.toFixed(2)}.`
            );
        }


        const paymentStatus =
            paymentMethod ===
            "Mobile Money"
                ? "Pending"
                : "Paid";


        const paidAt =
            paymentStatus === "Paid"
                ? new Date()
                : null;


        const [result] =
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

                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    0,
                    ?,
                    ?,
                    ?
                )
            `, [
                user.business_id,
                user.branch_id,
                saleId,
                paymentMethod,
                amount,
                transactionRef,
                paymentStatus,
                paidAt
            ]);

        let newSummary =
            await syncSaleAmountPaid(
                connection,
                user,
                saleId
            );

        let finalization =
            await finalizeSaleIfEligible(
                connection,
                user,
                saleId
            );


        newSummary =
            await getPaymentSummary(
                connection,
                user,
                saleId,
                false
            );


        await connection.commit();


        return res.status(201).json({

            success: true,

            message:
                paymentStatus === "Pending"
                    ? "Payment created and is awaiting confirmation."
                    : finalization.finalized
                        ? "Payment recorded and sale completed."
                        : "Payment recorded successfully.",

            payment: {

                payment_id:
                    result.insertId,

                payment_method:
                    paymentMethod,

                amount,

                payment_status:
                    paymentStatus,

                transaction_ref:
                    transactionRef
            },

            sale: {

                sale_id:saleId,

                invoice_number:newSummary.sale.invoice_number,

                grand_total:newSummary.grandTotal,

                amount_paid:newSummary.totalPaid,

                pending_payment_amount:newSummary.totalPending,

                outstanding:newSummary.outstanding,

                payment_status:newSummary.paymentStatus,

                sale_status:finalization.finalized
                        ? "Completed"
                        : newSummary.sale.sale_status
            }
        });

    } catch (error) {

        await connection.rollback();

        console.error(
            "ADD SPLIT PAYMENT ERROR:",
            error
        );

        return res.status(400).json({

            success: false,

            message:
                error.message ||
                "Unable to record payment."
        });

    } finally {

        connection.release();
    }
};


exports.getPaymentSummary = async (req, res) => {

    const user =
        getBranchUser(
            req,
            res
        );


    if (!user) {
        return;
    }


    const saleId =
        Number(
            req.params.saleId
        );


    if (
        !Number.isInteger(saleId) ||
        saleId <= 0
    ) {

        return res.status(400).json({
            success: false,
            message: "Invalid sale ID."
        });
    }


    const connection =
        await db.getConnection();


    try {

        const summary =
            await getPaymentSummary(
                connection,
                user,
                saleId,
                false
            );


        const [creditRows] =
            await connection.query(`
                SELECT
                    request_id,
                    requested_amount,
                    approved_amount,
                    status,
                    requested_by,
                    approved_by,
                    requested_at,
                    approved_at,
                    rejection_reason,
                    approval_note

                FROM sale_credit_requests

                WHERE sale_id = ?
                  AND business_id = ?
                  AND branch_id = ?

                ORDER BY request_id DESC
            `, [
                saleId,
                user.business_id,
                user.branch_id
            ]);


        return res.json({

            success: true,

            sale: {

                sale_id:
                    summary.sale.sale_id,

                invoice_number:
                    summary.sale.invoice_number,

                customer_id:
                    summary.sale.customer_id,

                grand_total:
                    summary.grandTotal,

                amount_paid:
                    summary.totalPaid,

                pending_payment_amount:
                    summary.totalPending,

                refunded_amount:
                    summary.totalRefunded,

                outstanding:
                    summary.outstanding,

                payment_status:
                    summary.paymentStatus,

                sale_status:
                    summary.sale.sale_status,

                payment_method:
                    summary.sale.payment_method
            },

            payments:
                summary.payments,

            credit_requests:
                creditRows
        });

    } catch (error) {

        console.error(
            "GET SPLIT PAYMENT SUMMARY ERROR:",
            error
        );

        return res.status(400).json({

            success: false,

            message:
                error.message ||
                "Unable to retrieve payment summary."
        });

    } finally {

        connection.release();
    }
};


exports.requestPayLater =
async (req, res) => {

    const user =
        getBranchUser(
            req,
            res
        );


    if (!user) {
        return;
    }


    const saleId =
        Number(
            req.params.saleId
        );


    if (
        !Number.isInteger(saleId) ||
        saleId <= 0
    ) {

        return res.status(400).json({
            success: false,
            message: "Invalid sale ID."
        });
    }


    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        const summary =
            await getPaymentSummary(
                connection,
                user,
                saleId,
                true
            );


        if (
            summary.sale.sale_status ===
            "Cancelled"
        ) {

            throw new Error(
                "This sale has been cancelled."
            );
        }


        if (
            summary.outstanding <= 0
        ) {

            throw new Error(
                "This sale has no outstanding balance."
            );
        }


        const requestedAmount =
            req.body.amount === undefined
                ? summary.outstanding
                : money(
                    normalizeNumber(
                        req.body.amount
                    )
                );


        if (
            !Number.isFinite(
                requestedAmount
            ) ||
            requestedAmount <= 0
        ) {

            throw new Error(
                "Invalid Pay Later amount."
            );
        }


        if (
            requestedAmount >
            summary.outstanding
        ) {

            throw new Error(
                "Pay Later amount cannot exceed the outstanding balance."
            );
        }

        const [existingRows] =
            await connection.query(`
                SELECT
                    request_id,
                    requested_amount,
                    approved_amount,
                    status

                FROM sale_credit_requests

                WHERE sale_id = ?
                  AND business_id = ?
                  AND branch_id = ?
                  AND status IN (
                      'Pending',
                      'Approved'
                  )

                ORDER BY request_id DESC

                LIMIT 1

                FOR UPDATE
            `, [
                saleId,
                user.business_id,
                user.branch_id
            ]);


        if (
            existingRows.length > 0
        ) {

            throw new Error(
                "This sale already has an active Pay Later request."
            );
        }


        const note =
            nullableString(
                req.body.note
            );


        const [result] =
            await connection.query(`
                INSERT INTO sale_credit_requests
                (
                    business_id,
                    branch_id,
                    sale_id,
                    customer_id,
                    requested_amount,
                    approved_amount,
                    status,
                    requested_by,
                    requested_at,
                    approval_note
                )

                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    NULL,
                    'Pending',
                    ?,
                    NOW(),
                    ?
                )
            `, [
                user.business_id,
                user.branch_id,
                saleId,
                summary.sale.customer_id,
                requestedAmount,
                user.id,
                note
            ]);


        await connection.commit();


        return res.status(201).json({

            success: true,

            message:
                "Pay Later request submitted for admin approval.",

            credit_request: {

                request_id:
                    result.insertId,

                sale_id:
                    saleId,

                requested_amount:
                    requestedAmount,

                status:
                    "Pending",

                requested_by:
                    user.id
            }
        });

    } catch (error) {

        await connection.rollback();

        console.error(
            "REQUEST PAY LATER ERROR:",
            error
        );

        return res.status(400).json({

            success: false,

            message:
                error.message ||
                "Unable to submit Pay Later request."
        });

    } finally {

        connection.release();
    }
};


exports.cancelPendingPayment =
async (req, res) => {

    const user =
        getBranchUser(
            req,
            res
        );


    if (!user) {
        return;
    }


    const paymentId =
        Number(
            req.params.paymentId
        );


    if (
        !Number.isInteger(paymentId) ||
        paymentId <= 0
    ) {

        return res.status(400).json({
            success: false,
            message: "Invalid payment ID."
        });
    }


    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        const [paymentRows] =
            await connection.query(`
                SELECT
                    payment_id,
                    sale_id,
                    payment_method,
                    amount,
                    payment_status

                FROM payments

                WHERE payment_id = ?
                  AND business_id = ?
                  AND branch_id = ?

                LIMIT 1

                FOR UPDATE
            `, [
                paymentId,
                user.business_id,
                user.branch_id
            ]);


        if (
            paymentRows.length === 0
        ) {

            throw new Error(
                "Payment not found."
            );
        }


        const payment =
            paymentRows[0];


        if (
            payment.payment_status !==
            "Pending"
        ) {

            throw new Error(
                "Only Pending payments can be cancelled using this endpoint."
            );
        }


        await connection.query(`
            UPDATE payments

            SET payment_status = 'Failed',
                paid_at = NULL

            WHERE payment_id = ?
              AND business_id = ?
              AND branch_id = ?
              AND payment_status = 'Pending'
        `, [
            paymentId,
            user.business_id,
            user.branch_id
        ]);


        const summary =
            await syncSaleAmountPaid(
                connection,
                user,
                payment.sale_id
            );


        await connection.commit();


        return res.json({

            success: true,

            message:
                "Pending payment cancelled.",

            payment: {

                payment_id:
                    payment.payment_id,

                payment_status:
                    "Failed"
            },

            sale: {

                sale_id:
                    payment.sale_id,

                amount_paid:
                    summary.totalPaid,

                outstanding:
                    summary.outstanding,

                payment_status:
                    summary.paymentStatus
            }
        });

    } catch (error) {

        await connection.rollback();

        console.error(
            "CANCEL PENDING PAYMENT ERROR:",
            error
        );

        return res.status(400).json({

            success: false,

            message:
                error.message ||
                "Unable to cancel payment."
        });

    } finally {

        connection.release();
    }
};


exports.getPaymentSummaryInternal =  getPaymentSummary;

exports.syncSaleAmountPaidInternal = syncSaleAmountPaid;

exports.finalizeSaleIfEligible =  finalizeSaleIfEligible;

exports.money = money;