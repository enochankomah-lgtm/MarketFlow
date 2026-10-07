"use strict";

const axios = require("axios");
const crypto = require("crypto");

/*
|--------------------------------------------------------------------------
| PAYSTACK CONFIGURATION
|--------------------------------------------------------------------------
*/

const PAYSTACK_BASE_URL =
    "https://api.paystack.co";


const MOBILE_MONEY_PROVIDERS = {

    mtn:
        "mtn",

    vod:
        "vod",

    atl:
        "atl",

    telecel:
        "vod",

    airteltigo:
        "atl"
};


/*
|--------------------------------------------------------------------------
| MONEY
|--------------------------------------------------------------------------
*/

function money(value) {

    const number =
        Number(value);


    if (
        !Number.isFinite(number)
    ) {

        return 0;
    }


    return Math.round(
        number * 100
    ) / 100;
}


/*
|--------------------------------------------------------------------------
| PESEWAS
|--------------------------------------------------------------------------
*/

function pesewas(value) {

    return Math.round(
        money(value) * 100
    );
}


/*
|--------------------------------------------------------------------------
| PAYSTACK REFERENCE
|--------------------------------------------------------------------------
*/

function generatePaymentReference() {

    const timestamp =
        Date.now();


    const random =
        crypto
            .randomBytes(6)
            .toString("hex");


    return `MF-${timestamp}-${random}`;
}


/*
|--------------------------------------------------------------------------
| PAYSTACK HEADERS
|--------------------------------------------------------------------------
*/

function paystackHeaders() {

    if (
        !process.env.PAYSTACK_SECRET_KEY
    ) {

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


/*
|--------------------------------------------------------------------------
| INITIATE SPLIT MOBILE MONEY PAYMENT
|--------------------------------------------------------------------------
*/

async function initiateSplitMobileMoneyPayment({

    connection,

    user,

    saleId,

    paymentId,

    network,

    phone

}) {

    /* ---------------------------------------------------------------------
       VALIDATE BASIC INPUT
    --------------------------------------------------------------------- */

    const normalizedSaleId =
        Number(saleId);


    const normalizedPaymentId =
        Number(paymentId);


    if (
        !Number.isInteger(normalizedSaleId) ||
        normalizedSaleId <= 0
    ) {

        throw new Error(
            "Invalid sale ID."
        );
    }


    if (
        !Number.isInteger(normalizedPaymentId) ||
        normalizedPaymentId <= 0
    ) {

        throw new Error(
            "Invalid payment ID."
        );
    }


    /* ---------------------------------------------------------------------
       MOBILE MONEY NETWORK
    --------------------------------------------------------------------- */
const normalizedNetwork =
    String(network || "")
        .trim()
        .toLowerCase();


const MOBILE_MONEY_PROVIDERS = {

    mtn:
        "mtn",

    vod:
        "vod",

    atl:
        "atl",

    telecel:
        "vod",

    airteltigo:
        "atl"
};


const provider =
    MOBILE_MONEY_PROVIDERS[
        normalizedNetwork
    ];


if (!provider) {

    throw new Error(
        "Please select a valid Mobile Money network."
    );
}


    /* ---------------------------------------------------------------------
       PHONE
    --------------------------------------------------------------------- */

    const cleanedPhone =
        String(phone || "")
            .replace(/\s+/g, "");


    if (
        !/^0\d{9}$/.test(
            cleanedPhone
        )
    ) {

        throw new Error(
            "Please enter a valid Ghana phone number."
        );
    }


    /* ---------------------------------------------------------------------
       EMAIL
    --------------------------------------------------------------------- */

    if (!user.email) {

        throw new Error(
            "An email address is required for payment."
        );
    }


    /* ---------------------------------------------------------------------
       LOCK THE PAYMENT
    --------------------------------------------------------------------- */

    const [paymentRows] =
        await connection.query(`

            SELECT

                p.payment_id,

                p.sale_id,

                p.payment_method,

                p.amount,

                p.transaction_ref,

                p.payment_status,

                s.invoice_number,

                s.sale_status,

                s.GrandTotal

            FROM payments p

            INNER JOIN sales s

                ON s.sale_id =
                    p.sale_id

               AND s.business_id =
                    p.business_id

               AND (

                    s.branch_id =
                        p.branch_id

                    OR (

                        s.branch_id IS NULL

                        AND p.branch_id IS NULL

                    )

               )

            WHERE p.payment_id = ?

              AND p.sale_id = ?

              AND p.business_id = ?

              AND (

                    p.branch_id = ?

                    OR (

                        p.branch_id IS NULL

                        AND ? IS NULL

                    )

              )

            LIMIT 1

            FOR UPDATE

        `, [

            normalizedPaymentId,

            normalizedSaleId,

            user.business_id,

            user.branch_id,
            user.branch_id
        ]);


    if (
        paymentRows.length === 0
    ) {

        throw new Error(
            "Split Mobile Money payment not found."
        );
    }


    const payment =
        paymentRows[0];


    if (
        payment.payment_method !==
        "Mobile Money"
    ) {

        throw new Error(
            "The selected payment is not a Mobile Money payment."
        );
    }


    if (
        payment.payment_status !==
        "Pending"
    ) {

        throw new Error(
            "Only Pending Mobile Money payments can be initiated."
        );
    }


    if (
        payment.sale_status ===
        "Cancelled"
    ) {

        throw new Error(
            "This sale has been cancelled."
        );
    }


    if (
        payment.sale_status ===
        "Completed"
    ) {

        throw new Error(
            "This sale has already been completed."
        );
    }


    const amount =
        money(
            Number(payment.amount)
        );


    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {

        throw new Error(
            "Invalid Mobile Money payment amount."
        );
    }


    /*
    |--------------------------------------------------------------------------
    | PAYMENT REFERENCE
    |--------------------------------------------------------------------------
    */

    let reference =
        payment.transaction_ref;


    if (!reference) {

        reference =
            generatePaymentReference();


        await connection.query(`

            UPDATE payments

            SET transaction_ref = ?

            WHERE payment_id = ?

              AND sale_id = ?

              AND business_id = ?

              AND (

                    branch_id = ?

                    OR (

                        branch_id IS NULL

                        AND ? IS NULL

                    )

              )

              AND payment_status =
                    'Pending'

        `, [

            reference,

            normalizedPaymentId,

            normalizedSaleId,

            user.business_id,

            user.branch_id,

            user.branch_id

        ]);
    }


    /*
    |--------------------------------------------------------------------------
    | SEND PAYMENT REQUEST TO PAYSTACK
    |--------------------------------------------------------------------------
    */

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
                            amount
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
                            String(
                                normalizedSaleId
                            ),

                        payment_id:
                            String(
                                normalizedPaymentId
                            ),

                        invoice_number:
                            payment.invoice_number,

                        business_id:
                            String(
                                user.business_id
                            ),

                        branch_id:
                            user.branchId === null
                                ? null
                                : String(
                                    user.branch_id
                                ),

                        mobile_money_network:
                            String(
                                network
                            ),

                        mobile_money_phone:
                            cleanedPhone,

                        split_payment:
                            "true"
                    }
                },

                {

                    headers:
                        paystackHeaders(),

                    timeout:
                        15000

                }

            );

    }   catch (paystackError) {

        console.error(

            "Split Mobile Money Paystack request error:",

            paystackError.response?.data ||
            paystackError.message

        );


        return {

            success:
                false,

            pending:
                false,

            payment_id:
                normalizedPaymentId,

            sale_id:
                normalizedSaleId,

            reference,

            status:
                "failed",

            message:
                paystackError.response?.data?.message ||

                paystackError.message ||

                "Unable to send the Mobile Money payment request to Paystack."

        };
    }


    /*
    |--------------------------------------------------------------------------
    | PAYSTACK RESPONSE
    |--------------------------------------------------------------------------
    */

    const paystackData =
        paystackResponse.data;


    if (
        !paystackData?.status ||
        !paystackData?.data
    ) {

        throw new Error(

            paystackData?.message ||

            "Paystack could not initiate the Mobile Money payment."

        );
    }


    const transaction =
        paystackData.data;


    /*
    |--------------------------------------------------------------------------
    | REFERENCE SAFETY CHECK
    |--------------------------------------------------------------------------
    */

    if (

        transaction.reference &&

        transaction.reference !==
            reference

    ) {

        throw new Error(
            "Payment reference mismatch."
        );
    }


    /*
    |--------------------------------------------------------------------------
    | RESULT
    |--------------------------------------------------------------------------
    */

    return {

        success:
            true,

        pending:
            true,

        payment_id:
            normalizedPaymentId,

        sale_id:
            normalizedSaleId,

        invoice_number:
            payment.invoice_number,

        amount,

        reference,

        status:
            transaction.status,

        message:
            transaction.display_text ||

            "Payment request sent. Please approve the payment on your phone."

    };
}


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {

    initiateSplitMobileMoneyPayment

};