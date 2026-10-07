"use strict";


/* ================================================================
   SPLIT PAYMENT STATE
================================================================ */

let splitPaymentRows = 0;


/* ================================================================
   MONEY
================================================================ */

function splitMoney(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.round(number * 100) / 100;
}


function splitFormatMoney(value) {

    return "GH₵" +
        splitMoney(value).toFixed(2);
}

function getCurrentSaleTotal() {

    const amountPayable = document.getElementById(
            "amountPayable"
        );


    if (amountPayable) {

        const raw = amountPayable.textContent || amountPayable.value || "";


        const cleaned = String(raw)
                .replace(/GH₵/gi, "")
                .replace(/GHS/gi, "")
                .replace(/,/g, "")
                .trim();


        const number =
            Number(cleaned);


        if (
            Number.isFinite(number) &&
            number >= 0
        ) {

            return splitMoney(number);
        }
    }


    const stored = Number(
            document
                .getElementById(
                    "splitGrandTotal"
                )
                ?.dataset
                ?.grandTotal
        );


    if (
        Number.isFinite(stored) &&
        stored > 0
    ) {

        return splitMoney(stored);
    }

    const possibleSelectors = [

        "#grandTotal", "#GrandTotal","#grand-total","#cartGrandTotal","#totalAmount","#total","[data-grand-total]"

    ];


    for (
        const selector
        of possibleSelectors
    ) {

        const element =
            document.querySelector(
                selector
            );


        if (!element) {
            continue;
        }


        const raw =
            element.dataset?.grandTotal ||
            element.value ||
            element.textContent ||
            "";


        const cleaned =
            String(raw)
                .replace(/GH₵/gi, "")
                .replace(/GHS/gi, "")
                .replace(/,/g, "")
                .trim();


        const number =
            Number(cleaned);


        if (
            Number.isFinite(number)
        ) {

            return splitMoney(number);
        }
    }


    return 0;
}

function syncSplitPaymentCustomer() {
    const customerIdElement =
        document.getElementById("splitCustomerId");

    const customerDisplayElement =
        document.getElementById("splitCustomerDisplay");

    if (!customerIdElement || !customerDisplayElement) {
        return;
    }

    const customerId = getSelectedCustomerId();

    if (
        customerId &&
        selectedCustomerData
    ) {
        customerIdElement.value =
            customerId;

        customerDisplayElement.textContent =
            selectedCustomerData.customer_name ||
            "Registered Customer";

        return;
    }

    customerIdElement.value = "";

    customerDisplayElement.textContent =
        "Walk-in Customer";
}

/* ================================================================
   INITIALIZE SPLIT PAYMENT
================================================================ */

function initializeSplitPaymentModal() {

    syncSplitPaymentCustomer();

    const total = getCurrentSaleTotal();


    const totalElement = document.getElementById(
            "splitGrandTotal"
        );


    if (totalElement) {

        totalElement.dataset.grandTotal =
            total;

        totalElement.textContent =
            splitFormatMoney(total);
    }


    /*
       Reset payment rows when opening.
    */

    const rows =
        document.getElementById(
            "splitPaymentRows"
        );


    if (rows) {

        rows.innerHTML = "";

        splitPaymentRows = 0;
    }


    /*
       Reset Pay Later.
    */

    const payLater =
        document.getElementById(
            "splitPayLater"
        );


    if (payLater) {
        payLater.checked = false;
    }


    const payLaterFields =
        document.getElementById(
            "splitPayLaterFields"
        );


    if (payLaterFields) {
        payLaterFields.style.display =
            "none";
    }


    const payLaterAmount =
        document.getElementById(
            "splitPayLaterAmount"
        );


    if (payLaterAmount) {
        payLaterAmount.value = "";
    }


    const payLaterNote =
        document.getElementById(
            "splitPayLaterNote"
        );


    if (payLaterNote) {
        payLaterNote.value = "";
    }


    /*
       Start with one payment row.
    */

    addSplitPaymentRow();


    updateSplitPaymentSummary();
}


/* ================================================================
   ADD PAYMENT ROW
================================================================ */

function addSplitPaymentRow(
    defaultMethod = "Cash",
    defaultAmount = ""
) {

    const container =
        document.getElementById(
            "splitPaymentRows"
        );


    if (!container) {
        return;
    }


    splitPaymentRows++;


    const rowId =
        splitPaymentRows;


    const row =
        document.createElement("div");


    row.className =
        "split-payment-row";


    row.dataset.rowId =
        rowId;


    row.innerHTML = `

        <div class="form-group">

            <label>
                Payment Method
            </label>

            <select
                class="split-method"
                data-row="${rowId}"
                onchange="handleSplitPaymentMethodChange(${rowId})"
            >

                <option
                    value="Cash"
                    ${defaultMethod === "Cash" ? "selected" : ""}
                >
                    Cash
                </option>

                <option
                    value="Mobile Money"
                    ${defaultMethod === "Mobile Money" ? "selected" : ""}
                >
                    Mobile Money
                </option>

                <option
                    value="Card"
                    ${defaultMethod === "Card" ? "selected" : ""}
                >
                    Card
                </option>

                <option
                    value="Bank Transfer"
                    ${defaultMethod === "Bank Transfer" ? "selected" : ""}
                >
                    Bank Transfer
                </option>

            </select>

        </div>


        <div class="form-group">

            <label>
                Amount
            </label>

            <div class="money-input">

                <span>
                    GH₵
                </span>

                <input
                    type="number"
                    class="split-amount"
                    data-row="${rowId}"
                    min="0"
                    step="0.01"
                    value="${defaultAmount}"
                    placeholder="0.00"
                    oninput="updateSplitPaymentSummary()"
                >

            </div>

        </div>


        <!-- ========================================================
             MOBILE MONEY DETAILS
        ========================================================= -->

        <div
            class="form-group split-momo-fields"
            data-row="${rowId}"
            style="display:none;"
        >

            <label>
                Network
            </label>

            <select
                class="split-momo-network"
                data-row="${rowId}"
            >

                <option value="">
                    Select Network
                </option>

                <option value="mtn">
                    MTN
                </option>

                <option value="vod">
                    Telecel
                </option>

                <option value="atl">
                    AirtelTigo
                </option>

            </select>

        </div>


        <div
            class="form-group split-momo-fields"
            data-row="${rowId}"
            style="display:none;"
        >

            <label>
                Mobile Money Phone
            </label>

            <input
                type="tel"
                class="split-momo-phone"
                data-row="${rowId}"
                maxlength="15"
                placeholder="024XXXXXXX"
                autocomplete="tel"
            >

        </div>


        <!-- ========================================================
             REFERENCE
        ========================================================= -->

        <div class="form-group">

            <label>
                Reference
            </label>

            <input
                type="text"
                class="split-reference"
                data-row="${rowId}"
                maxlength="100"
                placeholder="Optional"
            >

        </div>


        <button
            type="button"
            class="remove-payment-btn"
            onclick="removeSplitPaymentRow(${rowId})"
            title="Remove payment"
        >

            <i class="fa-solid fa-trash"></i>

        </button>
    `;


    container.appendChild(row);


    /*
       Apply the correct fields for the
       selected payment method.
    */

    handleSplitPaymentMethodChange(
        rowId
    );


    updateSplitPaymentSummary();
}

function removeSplitPaymentRow(rowId) {

    const container =
        document.getElementById(
            "splitPaymentRows"
        );

    if (!container) {
        return;
    }

    const rows =
        container.querySelectorAll(
            ".split-payment-row"
        );

    if (rows.length <= 1) {
        return;
    }

    const row =
        container.querySelector(
            `.split-payment-row[data-row-id="${rowId}"]`
        );

    if (row) {
        row.remove();
    }

    updateSplitPaymentSummary();
}

/* ================================================================
   PAYMENT METHOD CHANGE
================================================================ */

function handleSplitPaymentMethodChange(
    rowId
) {

    const row =
        document.querySelector(
            `.split-payment-row[data-row-id="${rowId}"]`
        );


    if (!row) {
        return;
    }


    const method =
        row.querySelector(
            ".split-method"
        )?.value;


    const reference =
        row.querySelector(
            ".split-reference"
        );


    /*
       ------------------------------------------------------------
       MOBILE MONEY FIELDS
       ------------------------------------------------------------
       These fields are created by addSplitPaymentRow().
       They should only be visible when Mobile Money is selected.
    */

    const momoFields =
        row.querySelectorAll(
            ".split-momo-fields"
        );


    momoFields.forEach(
        field => {

            field.style.display =
                method === "Mobile Money"
                    ? ""
                    : "none";

        }
    );


    /*
       ------------------------------------------------------------
       REFERENCE PLACEHOLDER
       ------------------------------------------------------------
    */

    if (reference) {

        if (method === "Mobile Money") {

            reference.placeholder =
                "MoMo transaction reference";

        } else if (
            method === "Card" ||
            method === "Bank Transfer"
        ) {

            reference.placeholder =
                "Transaction reference";

        } else {

            reference.placeholder =
                "Optional";
        }
    }


    /*
       ------------------------------------------------------------
       CLEAR MOBILE MONEY DETAILS WHEN METHOD CHANGES
       ------------------------------------------------------------
       If the user changes Mobile Money to Cash/Card/Bank Transfer,
       don't leave the old Mobile Money network and phone values
       sitting inside the hidden fields.
    */

    if (method !== "Mobile Money") {

        const momoNetwork =
            row.querySelector(
                ".split-momo-network"
            );


        const momoPhone =
            row.querySelector(
                ".split-momo-phone"
            );


        if (momoNetwork) {
            momoNetwork.value = "";
        }


        if (momoPhone) {
            momoPhone.value = "";
        }
    }
}

/* ================================================================
   GET PAYMENT ROWS
================================================================ */

function getSplitPaymentRows() {

    const rows =
        document.querySelectorAll(
            "#splitPaymentRows .split-payment-row"
        );


    const payments = [];


    rows.forEach(row => {

        const method =
            row.querySelector(
                ".split-method"
            )?.value;


        const amount =
            splitMoney(
                row.querySelector(
                    ".split-amount"
                )?.value
            );


        const reference =
            row.querySelector(
                ".split-reference"
            )?.value
                ?.trim() || null;


        /*
           ---------------------------------------------------------
           MOBILE MONEY DETAILS
           ---------------------------------------------------------
        */

        const network =
            row.querySelector(
                ".split-momo-network"
            )?.value
                ?.trim() || null;


        const phone =
            row.querySelector(
                ".split-momo-phone"
            )?.value
                ?.trim()
                ?.replace(/\s+/g, "") || null;


        /*
           ---------------------------------------------------------
           IGNORE COMPLETELY EMPTY ROWS
           ---------------------------------------------------------
        */

        if (
            !method &&
            amount <= 0
        ) {
            return;
        }


        /*
           ---------------------------------------------------------
           BUILD PAYMENT OBJECT
           ---------------------------------------------------------
        */

        const payment = {

            payment_method:
                method,

            amount:
                amount,

            transaction_ref:
                reference
        };


        /*
           Only attach Mobile Money
           information to Mobile Money
           payments.
        */

        if (
            method === "Mobile Money"
        ) {

            payment.network =
                network;

            payment.phone =
                phone;
        }


        payments.push(
            payment
        );

    });


    return payments;
}

/* ================================================================
   CALCULATE SUMMARY
================================================================ */

function calculateSplitPaymentSummary() {

    const total =
        getCurrentSaleTotal();


    const payments =
        getSplitPaymentRows();


    let confirmed = 0;

    let pendingMobileMoney = 0;


    payments.forEach(payment => {

        if (
            payment.amount <= 0
        ) {
            return;
        }


        /*
         * Mobile Money is treated as pending
         * until Paystack confirms it.
         */

        if (
            payment.payment_method ===
            "Mobile Money"
        ) {

            pendingMobileMoney +=
                payment.amount;

        } else {

            confirmed +=
                payment.amount;
        }

    });


    /*
     * ------------------------------------------------------------
     * PAY LATER
     * ------------------------------------------------------------
     */

    const payLaterCheckbox =
        document.getElementById(
            "splitPayLater"
        );


    const payLaterEnabled =
        Boolean(
            payLaterCheckbox?.checked
        );


    let payLater = 0;


    if (payLaterEnabled) {

        payLater =
            splitMoney(
                document.getElementById(
                    "splitPayLaterAmount"
                )?.value
            );
    }


    /*
     * ------------------------------------------------------------
     * PAYMENT COVERAGE
     * ------------------------------------------------------------
     *
     * covered = all sources being used to cover
     * the sale:
     *
     *   Confirmed payments
     *   + Pending Mobile Money
     *   + Pay Later
     */

    const covered =
        splitMoney(
            confirmed +
            pendingMobileMoney +
            payLater
        );


    /*
     * Confirmed + Pending Mobile Money
     *
     * This intentionally does NOT include Pay Later.
     *
     * It represents actual payment rows only.
     */

    const confirmedAndPending =
        splitMoney(
            confirmed +
            pendingMobileMoney
        );

    const remainingBeforePayLater =
        splitMoney(total - confirmedAndPending );

    const remaining = splitMoney( total - covered );


    return {
        total,
        confirmed,
        pendingMobileMoney,
        payLater,
        covered,
        confirmedAndPending,
        remainingBeforePayLater,
        remaining

    };
}


/* ================================================================
   UPDATE SUMMARY
================================================================ */

function updateSplitPaymentSummary() {

    const summary =
        calculateSplitPaymentSummary();


    const totalElement =
        document.getElementById(
            "splitGrandTotal"
        );


    const paidElement =
        document.getElementById(
            "splitTotalPaid"
        );


    const remainingElement =
        document.getElementById(
            "splitRemaining"
        );


    const confirmedElement =
        document.getElementById(
            "splitConfirmedAmount"
        );


    const pendingElement =
        document.getElementById(
            "splitPendingAmount"
        );


    const creditElement =
        document.getElementById(
            "splitCreditAmount"
        );


    const coveredElement =
        document.getElementById(
            "splitCoveredAmount"
        );


    if (totalElement) {

        totalElement.textContent =
            splitFormatMoney(
                summary.total
            );
    }


    /*
       Total Paid means confirmed/manual payments.

       Pending Mobile Money is NOT yet money received.
    */

    if (paidElement) {

        paidElement.textContent =
            splitFormatMoney(
                summary.confirmed
            );
    }


    if (remainingElement) {

        remainingElement.textContent =
            splitFormatMoney(
                Math.max(
                    summary.remaining,
                    0
                )
            );
    }


    if (confirmedElement) {

        confirmedElement.textContent =
            splitFormatMoney(
                summary.confirmed
            );
    }


    if (pendingElement) {

        pendingElement.textContent =
            splitFormatMoney(
                summary.pendingMobileMoney
            );
    }


    if (creditElement) {

        creditElement.textContent =
            splitFormatMoney(
                summary.payLater
            );
    }


    if (coveredElement) {

        coveredElement.textContent =
            splitFormatMoney(
                summary.covered
            );
    }


    updateSplitCoverageMessage(
        summary
    );
}


/* ================================================================
   COVERAGE MESSAGE
================================================================ */

function updateSplitCoverageMessage(
    summary
) {

    const element =
        document.getElementById(
            "splitCoverageMessage"
        );


    const submitButton =
        document.getElementById(
            "splitPaymentSubmit"
        );


    if (!element) {
        return;
    }


    element.className =
        "coverage-message";


    /*
       No total.
    */

    if (
        summary.total <= 0
    ) {

        element.textContent =
            "Unable to determine the current sale total.";

        element.classList.add(
            "error"
        );

        if (submitButton) {
            submitButton.disabled = true;
        }

        return;
    }


    /*
       Overpayment.
    */

    if (
        summary.covered >
        summary.total + 0.001
    ) {

        element.textContent =
            "Payment exceeds the sale total.";

        element.classList.add(
            "error"
        );

        if (submitButton) {
            submitButton.disabled = true;
        }

        return;
    }


    /*
       Exact coverage.
    */

    if (
        Math.abs(
            summary.covered -
            summary.total
        ) < 0.001
    ) {

        if (
            summary.pendingMobileMoney > 0
        ) {

            element.textContent =
                "Payment is covered. Mobile Money will remain pending until Paystack confirms it.";

            element.classList.add(
                "warning"
            );

        } else if (
            summary.payLater > 0
        ) {

            element.textContent =
                "Payment is covered. The Pay Later portion requires admin approval.";

            element.classList.add(
                "warning"
            );

        } else {

            element.textContent =
                "Payment is fully covered.";

            element.classList.add(
                "success"
            );
        }


        if (submitButton) {
            submitButton.disabled = false;
        }


        return;
    }


    /*
       Partial coverage.
    */

    if (
        summary.covered <
        summary.total
    ) {

        const remaining =
            splitMoney(
                summary.total -
                summary.covered
            );


        element.textContent =
            `GH₵${remaining.toFixed(2)} still needs to be covered.`;


        element.classList.add(
            "error"
        );


        if (submitButton) {
            submitButton.disabled = true;
        }


        return;
    }
}


/* ================================================================
   PAY LATER TOGGLE
================================================================ */

function toggleSplitPayLater() {

    const checkbox =
        document.getElementById(
            "splitPayLater"
        );


    const fields =
        document.getElementById(
            "splitPayLaterFields"
        );


    const amountInput =
        document.getElementById(
            "splitPayLaterAmount"
        );


    if (!checkbox || !fields) {
        return;
    }


    if (checkbox.checked) {

        fields.style.display =
            "block";


        /*
           Automatically fill Pay Later with
           the remaining amount.
        */

        const summary =
            calculateSplitPaymentSummary();


        if (
            summary.remaining > 0 &&
            amountInput
        ) {

            amountInput.value =
                summary.remaining.toFixed(2);
        }

    } else {

        fields.style.display =
            "none";


        if (amountInput) {
            amountInput.value = "";
        }
    }


    updateSplitPaymentSummary();
}

/* ================================================================
   VALIDATE SPLIT PAYMENT
================================================================ */

function validateSplitPayment() {

    hideSplitPaymentError();


    const summary =
        calculateSplitPaymentSummary();


    if (
        summary.total <= 0
    ) {

        showSplitPaymentError(
            "The sale total could not be determined."
        );

        return false;
    }


    const payments =
        getSplitPaymentRows();


    if (
        payments.length === 0
    ) {

        showSplitPaymentError(
            "Please add at least one payment."
        );

        return false;
    }


    /*
       ------------------------------------------------------------
       VALIDATE EACH PAYMENT
       ------------------------------------------------------------
    */

    for (
        const payment
        of payments
    ) {

        if (
            !payment.payment_method
        ) {

            showSplitPaymentError(
                "Please select a payment method."
            );

            return false;
        }


        if (
            payment.amount <= 0
        ) {

            showSplitPaymentError(
                "Every payment amount must be greater than zero."
            );

            return false;
        }


        /*
           --------------------------------------------------------
           MOBILE MONEY VALIDATION
           --------------------------------------------------------
        */

        if (
            payment.payment_method ===
            "Mobile Money"
        ) {

            if (
                !payment.network
            ) {

                showSplitPaymentError(
                    "Please select the Mobile Money network."
                );

                return false;
            }


            if (
                !payment.phone
            ) {

                showSplitPaymentError(
                    "Please enter the Mobile Money phone number."
                );

                return false;
            }


            /*
               Ghana Mobile Money number validation.

               Accepts:
               0241234567
               0541234567
               0551234567
               0591234567
               0201234567
               0501234567

               Also accepts international format:
               233241234567
            */

            const normalizedPhone =
                payment.phone
                    .replace(/\s+/g, "")
                    .replace(/^\+/, "");


            const validPhone =
                /^(0\d{9}|233\d{9})$/
                    .test(normalizedPhone);


            if (
                !validPhone
            ) {

                showSplitPaymentError(
                    "Please enter a valid Ghana Mobile Money phone number."
                );

                return false;
            }
        }


        /*
           --------------------------------------------------------
           CARD / BANK TRANSFER
           --------------------------------------------------------

           We do not force a reference here.
           The reference can be supplied by the cashier
           when available.
        */
    }


    /*
       ------------------------------------------------------------
       PAY LATER VALIDATION
       ------------------------------------------------------------
    */

    const payLater =
        document.getElementById(
            "splitPayLater"
        )?.checked;


    if (payLater) {

        const payLaterAmount =
            splitMoney(
                document.getElementById(
                    "splitPayLaterAmount"
                )?.value
            );


        if (
            payLaterAmount <= 0
        ) {

            showSplitPaymentError(
                "Please enter the Pay Later amount."
            );

            return false;
        }


        /*
           Pay Later must not exceed
           the balance before Pay Later.
        */

        const paymentOnly =
            splitMoney(
                summary.confirmed +
                summary.pendingMobileMoney
            );


        const remainingBeforeCredit =
            splitMoney(
                summary.total -
                paymentOnly
            );


        if (
            payLaterAmount >
            remainingBeforeCredit + 0.001
        ) {

            showSplitPaymentError(
                "Pay Later amount cannot exceed the remaining balance."
            );

            return false;
        }
    }


    /*
       ------------------------------------------------------------
       FINAL COVERAGE
       ------------------------------------------------------------

       The sale must be completely covered by:

       1. Confirmed payments
       2. Pending Mobile Money
       3. Pay Later
    */

    const finalCovered =
        splitMoney(
            summary.confirmed +
            summary.pendingMobileMoney +
            summary.payLater
        );


    if (
        finalCovered <
        summary.total - 0.001
    ) {

        const remaining =
            splitMoney(
                summary.total -
                finalCovered
            );


        showSplitPaymentError(
            `Payment is incomplete. ` +
            `GH₵${remaining.toFixed(2)} is still uncovered.`
        );

        return false;
    }


    if (
        finalCovered >
        summary.total + 0.001
    ) {

        showSplitPaymentError(
            "The payment amounts exceed the sale total."
        );

        return false;
    }


    return true;
}


/* ================================================================
   SUBMIT SPLIT PAYMENT
================================================================ */

async function submitSplitPayment() {

    if (
        !validateSplitPayment()
    ) {
        return;
    }


    const submitButton =
        document.getElementById(
            "splitPaymentSubmit"
        );


    const originalHTML = submitButton?.innerHTML ||
        "";


    try {

        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Processing...</span>
            `;
        }


        const payments = getSplitPaymentRows();

        const customerId = getSelectedCustomerId();


        const payLaterEnabled = document.getElementById(
                "splitPayLater"
            )?.checked || false;


        const payLaterAmount = payLaterEnabled
                ? splitMoney(
                    document.getElementById(
                        "splitPayLaterAmount"
                    )?.value
                )
                : 0;


        const payLaterNote = document.getElementById(
                "splitPayLaterNote"
            )?.value
                ?.trim() || null;


        const payload = {

            customer_id:
                customerId
                    ? Number(customerId)
                    : null,

            payments,

            pay_later:
                payLaterEnabled,

            pay_later_amount:
                payLaterEnabled
                    ? payLaterAmount
                    : 0,

            note:
                payLaterNote
        };


        console.log(
            "Submitting split payment:",
            payload
        );


        const response =
            await fetch(
                "/api/payments/split",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"
                    },

                    credentials:
                        "same-origin",

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Unable to process split payment."
            );
        }


        /*
           Success.
        */

        handleSplitPaymentSuccess(
            data
        );


    } catch (error) {

        console.error(
            "SPLIT PAYMENT ERROR:",
            error
        );


        showSplitPaymentError(
            error.message ||
            "Unable to process split payment."
        );


        if (submitButton) {

            submitButton.disabled = false;

            submitButton.innerHTML = originalHTML;
        }
    }
}

async function pollSplitMobileMoneyPayment(reference) {

    if (!reference) {
        throw new Error(
            "Mobile Money payment reference was not returned."
        );
    }

    const maxAttempts = 36;
    const interval = 5000;

    for (
        let attempt = 1;
        attempt <= maxAttempts;
        attempt++
    ) {

        try {

            const response = await fetch(
                `/api/payments/mobile-money/status/${encodeURIComponent(reference)}`,
                {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    },
                    credentials: "same-origin"
                }
            );

            let data = {};

            try {
                data = await response.json();
            } catch (jsonError) {
                console.error(
                    "Could not read Mobile Money status response:",
                    jsonError
                );
            }

            console.log(
                `Split Mobile Money status attempt ${attempt}/${maxAttempts}:`,
                data
            );

            if (
                data.success === true &&
                data.status === "success"
            ) {

                return {
                    success: true,
                    status: "success",
                    receipt: data.receipt || null,
                    data
                };
            }

            if (
                data.status === "failed" ||
                data.status === "abandoned" ||
                data.status === "timeout"
            ) {

                return {
                    success: false,
                    status: data.status,
                    message:
                        data.message ||
                        "The Mobile Money payment was not completed.",
                    data
                };
            }

            if (!response.ok) {

                console.error(
                    "Split Mobile Money status error:",
                    data
                );
            }

        } catch (error) {

            console.error(
                "Split Mobile Money polling error:",
                error
            );
        }

        if (
            attempt < maxAttempts
        ) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        interval
                    )
            );
        }
    }

    return {
        success: false,
        status: "timeout",
        message:
            "Mobile Money payment confirmation timed out. Please check the payment status before trying again."
    };
}

/* ================================================================
   DISPLAY SPLIT MOBILE MONEY REFERENCE
================================================================ */
/* ================================================================
   DISPLAY SPLIT MOBILE MONEY REFERENCE
================================================================ */

function displaySplitMobileMoneyReference(
    reference
) {

    if (!reference) {
        return;
    }


    /*
     * Split Payment rows are created dynamically.
     * Find every payment row and locate the Mobile Money row.
     */

    const paymentRows =
        document.querySelectorAll(
            "#splitPaymentRows > *"
        );


    for (
        const row
        of paymentRows
    ) {

        /*
         * Find the payment method select
         * inside this row.
         */

        const methodSelect =
            row.querySelector(
                'select[name="payment_method"]'
            );


        /*
         * Ignore rows that are not Mobile Money.
         */

        if (
            !methodSelect ||
            methodSelect.value !==
                "Mobile Money"
        ) {

            continue;
        }


        /*
         * Find the transaction reference input.
         */

        const referenceInput =
            row.querySelector(
                'input[placeholder*="MoMo transaction reference" i]'
            );


        if (!referenceInput) {

            console.warn(
                "Split Mobile Money reference input was not found."
            );

            continue;
        }


        /*
         * Put the Paystack reference into
         * the visible Reference field.
         */

        referenceInput.value =
            reference;


        /*
         * Make the reference readonly after
         * Paystack has supplied it.
         *
         * This prevents the cashier from accidentally
         * changing the reference while the payment
         * is being confirmed.
         */

        referenceInput.readOnly =
            true;


        /*
         * Trigger normal browser events in case
         * other code is listening for them.
         */

        referenceInput.dispatchEvent(
            new Event(
                "input",
                {
                    bubbles:
                        true
                }
            )
        );


        referenceInput.dispatchEvent(
            new Event(
                "change",
                {
                    bubbles:
                        true
                }
            )
        );


        console.log(
            "Split Mobile Money reference displayed:",
            reference
        );


        /*
         * Only one Mobile Money payment is allowed
         * per Split Payment, so stop searching.
         */

        break;
    }
}


/* ================================================================
   SUCCESS
================================================================ */

async function handleSplitPaymentSuccess(
    data
) {

    console.log(
        "Split payment response:",
        data
    );


    const sale =
        data.sale || {};


    const mobileMoney =
        data.mobile_money || null;


    const saleStatus =
        String(
            sale.sale_status || ""
        ).trim();


    const hasPendingMobileMoney =
        Boolean(
            mobileMoney &&
            mobileMoney.pending === true
        );


    const isCompleted =
        saleStatus ===
        "Completed";


    /*
     * ------------------------------------------------------------
     * MOBILE MONEY PAYMENT
     * ------------------------------------------------------------
     */

    if (
        hasPendingMobileMoney
    ) {

        /*
         * Paystack reference returned by
         * the backend.
         */

        const reference =
            mobileMoney.reference;


        console.log(
            "Split Mobile Money is pending.",
            {
                sale_id:
                    mobileMoney.sale_id,

                payment_id:
                    mobileMoney.payment_id,

                reference:
                    reference,

                status:
                    mobileMoney.status
            }
        );


        /*
         * The reference is required because
         * the browser uses it to check Paystack
         * payment status.
         */

        if (!reference) {

            alert(
                "Mobile Money payment was created, but no Paystack reference was returned."
            );

            return;
        }


        /*
         * --------------------------------------------------------
         * DISPLAY THE PAYSTACK REFERENCE
         * --------------------------------------------------------
         *
         * This is the part that was missing before.
         */

        displaySplitMobileMoneyReference(
            reference
        );


        /*
         * --------------------------------------------------------
         * DISABLE SUBMIT BUTTON
         * --------------------------------------------------------
         */

        const submitButton =
            document.getElementById(
                "completeSplitPayment"
            );


        if (submitButton) {

            submitButton.disabled =
                true;


            submitButton.textContent =
                "Waiting for Payment...";
        }


        /*
         * --------------------------------------------------------
         * INFORM CASHIER
         * --------------------------------------------------------
         */

        if (
            typeof showToast ===
            "function"
        ) {

            showToast(
                "Mobile Money payment request sent. Please approve the payment on the customer's phone.",
                "info"
            );

        } else {

            alert(
                "Mobile Money payment request sent. Please approve the payment on the customer's phone."
            );
        }


        /*
         * --------------------------------------------------------
         * WAIT FOR PAYSTACK CONFIRMATION
         * --------------------------------------------------------
         */

        const paymentResult =
            await pollSplitMobileMoneyPayment(
                reference
            );


        console.log(
            "Final Split Mobile Money result:",
            paymentResult
        );


        /*
         * --------------------------------------------------------
         * PAYMENT SUCCESSFUL
         * --------------------------------------------------------
         */

        if (
            paymentResult.success ===
                true &&
            paymentResult.status ===
                "success"
        ) {

            closePaymentModal(
                "splitPaymentModal"
            );


            if (
                typeof showToast ===
                "function"
            ) {

                showToast(
                    "Mobile Money payment confirmed. Split payment completed successfully.",
                    "success"
                );

            } else {

                alert(
                    "Mobile Money payment confirmed. Split payment completed successfully."
                );
            }


            /*
             * Clear the cashier's temporary cart.
             */

            if (
                typeof clearCartUI ===
                "function"
            ) {

                clearCartUI();
            }


            /*
             * Refresh cart data.
             */

            if (
                typeof refreshCart ===
                "function"
            ) {

                refreshCart();
            }


            if (
                typeof loadCart ===
                "function"
            ) {

                loadCart();
            }


            /*
             * Show receipt returned by the
             * payment-status endpoint.
             */

            if (
                paymentResult.receipt &&
                typeof showReceipt ===
                "function"
            ) {

                showReceipt(
                    paymentResult.receipt
                );
            }


            return;
        }


        /*
         * --------------------------------------------------------
         * PAYMENT FAILED
         * --------------------------------------------------------
         */

        if (
            paymentResult.status ===
                "failed" ||
            paymentResult.status ===
                "abandoned"
        ) {

            if (submitButton) {

                submitButton.disabled =
                    false;


                submitButton.textContent =
                    "Complete Split Payment";
            }


            if (
                typeof showToast ===
                "function"
            ) {

                showToast(
                    paymentResult.message ||
                    "Mobile Money payment was not completed.",
                    "error"
                );

            } else {

                alert(
                    paymentResult.message ||
                    "Mobile Money payment was not completed."
                );
            }


            return;
        }


        /*
         * --------------------------------------------------------
         * PAYMENT TIMEOUT
         * --------------------------------------------------------
         */

        if (
            paymentResult.status ===
            "timeout"
        ) {

            if (submitButton) {

                submitButton.disabled =
                    false;


                submitButton.textContent =
                    "Complete Split Payment";
            }


            if (
                typeof showToast ===
                "function"
            ) {

                showToast(
                    paymentResult.message ||
                    "Mobile Money confirmation timed out. Please check the payment status.",
                    "warning"
                );

            } else {

                alert(
                    paymentResult.message ||
                    "Mobile Money confirmation timed out. Please check the payment status."
                );
            }


            return;
        }


        return;
    }


    /*
     * ------------------------------------------------------------
     * NO PENDING MOBILE MONEY
     * ------------------------------------------------------------
     */

    closePaymentModal(
        "splitPaymentModal"
    );


    let message =
        data.message ||
        "Split payment sale created successfully.";


    if (
        isCompleted
    ) {

        message =
            data.message ||
            "Split payment completed successfully.";
    }


    if (
        typeof showToast ===
        "function"
    ) {

        showToast(
            message,
            "success"
        );

    } else {

        alert(
            message
        );
    }


    /*
     * Clear temporary cart UI.
     */

    if (
        typeof clearCartUI ===
        "function"
    ) {

        clearCartUI();
    }


    /*
     * Refresh cart.
     */

    if (
        typeof refreshCart ===
        "function"
    ) {

        refreshCart();
    }


    if (
        typeof loadCart ===
        "function"
    ) {

        loadCart();
    }


    if (
        isCompleted &&
        typeof showReceipt === "function" && data.receipt
    ) {

        showReceipt(
            data.receipt
        );
    }
}

function showSplitPaymentError(
    message
) {
    const element = document.getElementById(
            "splitPaymentError"
        );
    if (!element) {
        return;
    }
    element.textContent = message;
    element.style.display ="block";
}


function hideSplitPaymentError() {
    const element = document.getElementById(
            "splitPaymentError"
        );
    if (!element) {
        return;
    }


    element.textContent = "";
    element.style.display ="none";
}


document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key !== "Escape"
        ) {
            return;
        }


        const modal =
            document.getElementById(
                "splitPaymentModal"
            );
        if (
            modal &&
            modal.classList.contains(
                "active"
            )
        ) {

            closePaymentModal(
                "splitPaymentModal"
            );
        }
    }
);