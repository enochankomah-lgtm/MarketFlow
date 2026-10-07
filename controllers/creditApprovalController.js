"use strict";

const db = require("../Database/db");


/*
|--------------------------------------------------------------------------
| GET PENDING CREDIT REQUESTS
|--------------------------------------------------------------------------
*/

        async function getCreditRequests(req, res) {

            try {

                const businessId =  req.user.business_id;
                const branchId =  req.user.branch_id;


                        const [requests] = await db.query(`

                    SELECT

                        scr.request_id,
                        scr.business_id,
                        scr.branch_id,

                        scr.sale_id,
                        scr.customer_id,

                        scr.requested_amount,
                        scr.approved_amount,

                        scr.status,

                        scr.requested_by,
                        scr.approved_by,

                        scr.requested_at,
                        scr.approved_at,

                        scr.rejection_reason,
                        scr.approval_note,

                        s.invoice_number,
                        s.GrandTotal,
                        s.sale_status,

                        c.customer_name AS customer_name,
                        c.phone AS customer_phone,

                        u.FirstName AS requester_first_name,
                        u.LastName AS requester_last_name

                    FROM sale_credit_requests scr

                    INNER JOIN sales s
                        ON s.sale_id = scr.sale_id
                    AND s.business_id = scr.business_id

                    LEFT JOIN customers c
                        ON c.customer_id = scr.customer_id
                    AND c.business_id = scr.business_id

                    INNER JOIN users u
                        ON u.UserID = scr.requested_by
                    AND u.business_id = scr.business_id

                    WHERE scr.business_id = ?

                    AND (
                            scr.branch_id = ?

                            OR (
                                scr.branch_id IS NULL
                                AND ? IS NULL
                            )
                        )

                    ORDER BY

                        CASE
                            WHEN scr.status = 'Pending'
                            THEN 0
                            ELSE 1
                        END,

                        scr.requested_at DESC

                `, [

                    req.user.business_id,
                    req.user.branch_id,
                    req.user.branch_id

                ]);

        /*
         * If this is an AJAX/API request,
         * return JSON.
         */

        if (
            req.xhr ||
            req.path.startsWith("/api/")
        ) {

            return res.json({

                success: true,

                requests

            });
        }


        /*
         * Otherwise render the standalone
         * approval page.
         */

        return res.render(
            "credit/approvals",
            {
                requests,

                user: req.user

            }
        );


    } catch (error) {

        console.error(
            "Get credit requests error:",
            error
        );


        if (
            req.xhr ||
            req.path.startsWith("/api/")
        ) {

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load Pay Later requests."

            });
        }


        return res.status(500).send(
            "Unable to load Pay Later requests."
        );
    }
}


/*
|--------------------------------------------------------------------------
| APPROVE CREDIT REQUEST
|--------------------------------------------------------------------------
*/

async function approveCreditRequest(req, res) {

    const connection =
        await db.getConnection();


    try {

        const businessId =
            req.user.business_id;


        const adminId =
            req.user.UserID;


        const requestId =
            Number(req.params.requestId);


        if (
            !Number.isInteger(requestId) ||
            requestId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid credit request ID."

            });
        }


        /*
         * Approved amount.
         *
         * If the Admin does not provide one,
         * approve the full requested amount.
         */

        const suppliedAmount =
            req.body?.approved_amount;


        const suppliedNumber =
            Number(suppliedAmount);


        await connection.beginTransaction();


        /*
         * Lock the request.
         *
         * Business ID is part of the WHERE clause
         * so another business can never be accessed.
         */

        const [rows] =
            await connection.query(`

                SELECT

                    request_id,
                    business_id,
                    branch_id,
                    sale_id,
                    customer_id,

                    requested_amount,
                    approved_amount,

                    status

                FROM sale_credit_requests

                WHERE request_id = ?

                    AND business_id = ?

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

                    requestId,
                    businessId,
                    req.user.branch_id,
                    req.user.branch_id

            ]);


        if (
            rows.length === 0
        ) {

            await connection.rollback();

            return res.status(404).json({

                success: false,

                message:
                    "Pay Later request was not found."

            });
        }


        const request =
            rows[0];


        /*
         * Only Pending requests can be approved.
         */

        if (
            request.status !==
            "Pending"
        ) {

            await connection.rollback();

            return res.status(409).json({

                success: false,

                message:
                    `This request has already been ${request.status.toLowerCase()}.`

            });
        }


        const requestedAmount =
            Number(
                request.requested_amount
            );


        /*
         * No amount supplied:
         * approve the full requested amount.
         */

        let approvedAmount;


        if (
            suppliedAmount === undefined ||
            suppliedAmount === null ||
            String(suppliedAmount).trim() === ""
        ) {

            approvedAmount =
                requestedAmount;

        } else {

            approvedAmount =
                suppliedNumber;
        }


        /*
         * Validate approved amount.
         */

        if (
            !Number.isFinite(
                approvedAmount
            ) ||
            approvedAmount <= 0
        ) {

            await connection.rollback();

            return res.status(400).json({

                success: false,

                message:
                    "Approved amount must be greater than zero."

            });
        }


        /*
         * Never allow Admin to approve
         * more than the amount requested.
         */

        if (
            approvedAmount >
            requestedAmount
        ) {

            await connection.rollback();

            return res.status(400).json({

                success: false,

                message:
                    "Approved amount cannot be greater than the requested amount."

            });
        }


        /*
         * Approval note.
         */

        const approvalNote =
            String(
                req.body?.approval_note || ""
            )
            .trim()
            .substring(0, 500);


        /*
         * Approve.
         */

        await connection.query(`

            UPDATE sale_credit_requests

            SET

                approved_amount = ?,

                status = 'Approved',

                approved_by = ?,

                approved_at = CURRENT_TIMESTAMP,

                approval_note = ?,

                rejection_reason = NULL

            WHERE request_id = ?
                AND business_id = ?
                AND (
                        branch_id = ?
                        OR (
                            branch_id IS NULL
                            AND ? IS NULL
                        )
                    )

              AND status = 'Pending'

        `, [
            approvedAmount,
            adminId,
            approvalNote || null,
            requestId,
            businessId,
            req.user.branch_id,
            req.user.branch_id
        ]);


        await connection.commit();

        return res.json({
            success: true,

            message:"Pay Later request approved successfully.",

            request: {
                request_id: requestId,

                requested_amount: requestedAmount,

                approved_amount: approvedAmount,

                status: "Approved",

                approved_by:
                    adminId

            }

        });


    } catch (error) {

        await connection.rollback();


        console.error(
            "Approve credit request error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to approve the Pay Later request."

        });


    } finally {

        connection.release();
    }
}

async function rejectCreditRequest(req, res) {

    const connection = await db.getConnection();

    try {

        const businessId = req.user.business_id;


        const adminId = req.user.UserID;


        const requestId = Number(req.params.requestId);


        if (
            !Number.isInteger(requestId) ||
            requestId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid credit request ID."

            });
        }


        const rejectionReason =
            String(
                req.body?.rejection_reason || ""
            )
            .trim()
            .substring(0, 500);


        if (!rejectionReason) {

            return res.status(400).json({

                success: false,

                message: "A rejection reason is required."

            });
        }


        await connection.beginTransaction();

        const [rows] =
            await connection.query(`

                SELECT

                    request_id,
                    business_id,
                    sale_id,
                    requested_amount,
                    status

                FROM sale_credit_requests

                WHERE request_id = ?

                  AND business_id = ?

                LIMIT 1

                FOR UPDATE

            `, [

                requestId,

                businessId

            ]);


        if (
            rows.length === 0
        ) {

            await connection.rollback();

            return res.status(404).json({

                success: false,
                message:"Pay Later request was not found."

            });
        }


        const request = rows[0];


        if (request.status !=="Pending") {

            await connection.rollback();

            return res.status(409).json({

                success: false,

                message:
                    `This request has already been ${request.status.toLowerCase()}.`

            });
        }


        /*
         * Reject request.
         */

        await connection.query(`

            UPDATE sale_credit_requests

            SET

                status = 'Rejected',

                approved_by = ?,

                approved_at = CURRENT_TIMESTAMP,

                rejection_reason = ?,

                approved_amount = NULL

            WHERE request_id = ?

              AND business_id = ?

              AND status = 'Pending'

        `, [

            adminId,

            rejectionReason,

            requestId,

            businessId

        ]);


        await connection.commit();
        return res.json({
            success: true,
            message: "Pay Later request rejected.",

            request: {
                request_id: requestId,
                status: "Rejected",
                rejection_reason: rejectionReason
            }

        });


    } catch (error) {
        await connection.rollback();
        console.error(
            "Reject credit request error:",
            error
        );


        return res.status(500).json({
            success: false,
            message:"Unable to reject the Pay Later request."

        });


    } finally { connection.release();
    }
}

/*
|--------------------------------------------------------------------------
| SETTLE APPROVED CREDIT REQUEST
|--------------------------------------------------------------------------
*/

async function settleCreditRequest(req, res) {

    const connection =
        await db.getConnection();

    try {

        const businessId =
            req.user.business_id;

        const branchId =
            req.user.branch_id;

        const settledBy =
            req.user.UserID;

        const requestId =
            Number(req.params.requestId);


        /*
         * Validate request ID.
         */

        if (
            !Number.isInteger(requestId) ||
            requestId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid credit request ID."

            });
        }


        /*
         * Read settlement information.
         */

        const suppliedAmount =
            req.body?.settled_amount;

        const settlementAmount =
            Number(suppliedAmount);


        const settlementMethod =
            String(
                req.body?.settlement_method || ""
            )
            .trim()
            .substring(0, 30);


        const settlementNote =
            String(
                req.body?.settlement_note || ""
            )
            .trim()
            .substring(0, 500);


        /*
         * Validate amount.
         */

        if (
            !Number.isFinite(
                settlementAmount
            ) ||
            settlementAmount <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Settlement amount must be greater than zero."

            });
        }


        /*
         * Payment method is required.
         */

        if (!settlementMethod) {

            return res.status(400).json({

                success: false,

                message:
                    "Settlement payment method is required."

            });
        }


        /*
         * Begin transaction.
         */

        await connection.beginTransaction();


        /*
         * Lock the credit request.
         *
         * Business and branch restrictions are included
         * to preserve business/branch isolation.
         */

        const [requestRows] =
            await connection.query(`

                SELECT

                    request_id,
                    business_id,
                    branch_id,
                    sale_id,
                    customer_id,

                    requested_amount,
                    approved_amount,

                    status

                FROM sale_credit_requests

                WHERE request_id = ?

                  AND business_id = ?

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

                requestId,
                businessId,
                branchId,
                branchId

            ]);


        /*
         * Request not found.
         */

        if (
            requestRows.length === 0
        ) {

            await connection.rollback();

            return res.status(404).json({

                success: false,

                message:
                    "Pay Later request was not found."

            });
        }


        const request =
            requestRows[0];


        /*
         * Only Approved credit can be settled.
         */

        if (
            request.status !==
            "Approved"
        ) {

            await connection.rollback();

            return res.status(409).json({

                success: false,

                message:
                    `This credit cannot be settled because its status is ${request.status}.`

            });
        }


        /*
         * Determine the approved credit amount.
         */

        const approvedAmount =
            Number(
                request.approved_amount
            );


        if (
            !Number.isFinite(
                approvedAmount
            ) ||
            approvedAmount <= 0
        ) {

            await connection.rollback();

            return res.status(409).json({

                success: false,

                message:
                    "This credit request does not have a valid approved amount."

            });
        }


        /*
         * Never allow settlement above
         * the approved credit amount.
         */

        if (
            settlementAmount !==
            approvedAmount
        ) {

            await connection.rollback();

            return res.status(400).json({

                success: false,

                message:
                    "The settlement amount must be exactly equal to the approved credit amount."

            });
        }


        /*
         * Get the sale and lock it.
         */

        const [saleRows] =
            await connection.query(`

                SELECT

                    sale_id,
                    business_id,
                    branch_id,
                    GrandTotal,
                    amount_paid,
                    sale_status

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

                FOR UPDATE

            `, [

                request.sale_id,
                businessId,
                branchId,
                branchId

            ]);


        if (
            saleRows.length === 0
        ) {

            await connection.rollback();

            return res.status(404).json({

                success: false,

                message:
                    "The sale associated with this credit could not be found."

            });
        }


        const sale =
            saleRows[0];


        /*
         * Prevent settlement from exceeding
         * the remaining balance on the sale.
         */

        const grandTotal =
            Number(
                sale.GrandTotal
            );


        const currentAmountPaid =
            Number(
                sale.amount_paid
            );


        const remainingSaleBalance =
            Math.max(
                0,
                grandTotal -
                currentAmountPaid
            );


        if (
            settlementAmount >
            remainingSaleBalance
        ) {

            await connection.rollback();

            return res.status(400).json({

                success: false,

                message:
                    "Settlement amount cannot be greater than the remaining balance on the sale."

            });
        }


        /*
         * Create a payment record for the
         * actual money received now.
         */

        const transactionRef =
            `CREDIT-SETTLEMENT-${requestId}-${Date.now()}`;


        const [paymentResult] =
            await connection.query(`

                INSERT INTO payments (

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

                    0.00,
                    ?,

                    'Paid',
                    CURRENT_TIMESTAMP

                )

            `, [

                businessId,
                branchId,
                request.sale_id,

                settlementMethod,
                settlementAmount,

                transactionRef

            ]);


        /*
         * Update the amount actually paid
         * against the original sale.
         */

        const newAmountPaid =
            currentAmountPaid +
            settlementAmount;


        /*
         * Prevent floating point issues from
         * affecting the database comparison.
         */

        const roundedAmountPaid =
            Number(
                newAmountPaid.toFixed(2)
            );


        /*
         * Determine whether the sale is now
         * completely paid.
         */

        const newSaleStatus =
            roundedAmountPaid >=
            grandTotal
                ? "Completed"
                : sale.sale_status;


        await connection.query(`

            UPDATE sales

            SET

                amount_paid = ?,

                sale_status = ?

            WHERE sale_id = ?

              AND business_id = ?

              AND (
                    branch_id = ?

                    OR (
                        branch_id IS NULL
                        AND ? IS NULL
                    )
              )

        `, [

            roundedAmountPaid,

            newSaleStatus,

            request.sale_id,

            businessId,

            branchId,
            branchId

        ]);


        /*
         * Mark the credit as settled.
         */

        await connection.query(`

            UPDATE sale_credit_requests

            SET

                settled_amount = ?,

                settled_by = ?,

                settled_at = CURRENT_TIMESTAMP,

                settlement_method = ?,

                settlement_note = ?,

                status = 'Settled'

            WHERE request_id = ?

              AND business_id = ?

              AND (
                    branch_id = ?

                    OR (
                        branch_id IS NULL
                        AND ? IS NULL
                    )
              )

              AND status = 'Approved'

        `, [

            settlementAmount,
            settledBy,
            settlementMethod,
            settlementNote || null,
            requestId,
            businessId,
            branchId,
            branchId

        ]);

        await connection.commit();

        return res.json({
            success: true,
            message: "Credit payment received and settled successfully.",
            settlement: {
                request_id: requestId,
                sale_id: request.sale_id,
                payment_id:paymentResult.insertId,
                settled_amount:settlementAmount,
                settlement_method:settlementMethod,
                status: "Settled",
                amount_paid: roundedAmountPaid
            }

        });


    } catch (error) {


        try {

            await connection.rollback();

        } catch (rollbackError) {

            console.error(
                "Credit settlement rollback error:",
                rollbackError
            );

        }


        console.error(
            "Settle credit request error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to settle the Pay Later credit."

        });


    } finally {

        connection.release();

    }
}


module.exports = {
    getCreditRequests,
    approveCreditRequest,
    rejectCreditRequest,
    settleCreditRequest
};