"use strict";

/* =====================================================
   GLOBAL POS STATE
===================================================== */

let selectedCustomerId = null;
let selectedCustomerData = null;
let selectedProductPrice = 0;
let currentReceipt = null;

/* =====================================================
   DOM HELPERS
===================================================== */

function getElement(id) {
    return document.getElementById(id);
}

function getNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

/* =====================================================
   CATEGORY FILTER
===================================================== */

function filterCategory(category) {
    const productCards = document.querySelectorAll(".product-card");

    productCards.forEach(card => {
        const cardCategory =
            String(card.dataset.category || "").toLowerCase();

        const selectedCategory =
            String(category || "All").toLowerCase();

        if (
            selectedCategory === "all" ||
            cardCategory === selectedCategory
        ) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    });
}

/* =====================================================
   PRODUCT SEARCH
===================================================== */

function initializeProductSearch() {
    const searchInput = getElement("searchcategory");

    if (!searchInput) {
        return;
    }

    searchInput.addEventListener("input", function () {
        const value = this.value.trim().toLowerCase();

        const productCards =
            document.querySelectorAll(".product-card");

        productCards.forEach(card => {
            const productNameElement =
                card.querySelector(".product-name");

            const productName =
                productNameElement
                    ? productNameElement.textContent.toLowerCase()
                    : "";

            const category =
                String(card.dataset.category || "").toLowerCase();

            const brand =
                String(card.dataset.brand || "").toLowerCase();

            const matches =
                !value ||
                productName.includes(value) ||
                category.includes(value) ||
                brand.includes(value);

            card.style.display = matches ? "" : "none";
        });
    });
}

/* =====================================================
   PRODUCT PURCHASE MODAL
===================================================== */

function updatePurchaseTotal() {
    const quantityInput = getElement("quantity");
    const totalInput = getElement("total_product");

    if (!quantityInput || !totalInput) {
        return;
    }

    let quantity = getNumber(quantityInput.value);

    if (!Number.isInteger(quantity) || quantity < 1) {
        quantity = 1;
        quantityInput.value = quantity;
    }

    totalInput.value =
        (selectedProductPrice * quantity).toFixed(2);
}

function initializeProductPurchaseModal() {
    const purchaseModal =
        getElement("productpurchasing");

    if (!purchaseModal) {
        return;
    }

    const quantityInput =
        getElement("quantity");

    const minusButton =
        getElement("quantity-minus");

    const plusButton =
        getElement("quantity-plus");

    purchaseModal.addEventListener(
        "show.bs.modal",
        function (event) {
            const button = event.relatedTarget;

            if (!button) {
                return;
            }

            const productId =
                button.getAttribute("data-id");

            const productName =
                button.getAttribute("data-name");

            const sellingPrice =
                button.getAttribute("data-selling");

            const costPrice =
                button.getAttribute("data-cost");

            selectedProductPrice =
                getNumber(sellingPrice);

            const productIdInput =
                getElement("product_id");

            const productNameInput =
                getElement("product_name");

            const sellingPriceInput =
                getElement("selling_price");

            const costPriceInput =
                getElement("cost_price");

            if (productIdInput) {
                productIdInput.value =
                    productId || "";
            }

            if (productNameInput) {
                productNameInput.value =
                    productName || "";
            }

            if (sellingPriceInput) {
                sellingPriceInput.value =
                    selectedProductPrice.toFixed(2);
            }

            if (costPriceInput) {
                costPriceInput.value =
                    getNumber(costPrice).toFixed(2);
            }

            if (quantityInput) {
                quantityInput.value = 1;
            }

            updatePurchaseTotal();
        }
    );

    if (plusButton) {
        plusButton.addEventListener("click", function () {
            if (!quantityInput) {
                return;
            }

            let quantity =
                Math.max(
                    1,
                    Math.floor(getNumber(quantityInput.value))
                );

            quantity += 1;

            quantityInput.value = quantity;

            updatePurchaseTotal();
        });
    }

    if (minusButton) {
        minusButton.addEventListener("click", function () {
            if (!quantityInput) {
                return;
            }

            let quantity =
                Math.max(
                    1,
                    Math.floor(getNumber(quantityInput.value))
                );

            if (quantity > 1) {
                quantity -= 1;
            }

            quantityInput.value = quantity;

            updatePurchaseTotal();
        });
    }

    if (quantityInput) {
        quantityInput.addEventListener(
            "input",
            function () {
                let quantity =
                    Math.floor(getNumber(this.value));

                if (quantity < 1) {
                    quantity = 1;
                }

                this.value = quantity;

                updatePurchaseTotal();
            }
        );
    }
}

/* =====================================================
   DELETE CART ITEM
===================================================== */

async function deleteitem(salesId) {
    if (!salesId) {
        return;
    }

    if (!confirm("Do you want to delete this item?")) {
        return;
    }

    try {
        const response =
            await fetch(
                `/productpages/sales/delete/${encodeURIComponent(salesId)}`,
                {
                    method: "DELETE"
                }
            );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Unable to delete this item."
            );
        }

        location.reload();

    } catch (error) {
        console.error(
            "Delete cart item error:",
            error
        );

        alert(
            error.message ||
            "Error while deleting this item."
        );
    }
}

/* =====================================================
   PRICE SEARCH
===================================================== */

function initializePriceSearch() {
    const priceSearch =
        getElement("priceSearch");

    if (!priceSearch) {
        return;
    }

    priceSearch.addEventListener(
        "input",
        function () {
            const value =
                this.value.trim().toLowerCase();

            const rows =
                document.querySelectorAll(
                    "#priceTableBody tr"
                );

            rows.forEach(row => {
                const cells = row.cells;

                if (!cells.length) {
                    return;
                }

                /*
                 * Current table:
                 * 0 = Product Name
                 * 1 = Category
                 * 2 = Brand
                 * 3 = Unit
                 * 4 = Price
                 */

                const searchableText =
                    Array.from(cells)
                        .map(cell =>
                            cell.textContent
                                .trim()
                                .toLowerCase()
                        )
                        .join(" ");

                row.style.display =
                    !value ||
                    searchableText.includes(value)
                        ? ""
                        : "none";
            });
        }
    );
}

/* =====================================================
   RECALL HELD SALE
===================================================== */

async function recallholdsale(invoiceNumber) {
    if (!invoiceNumber) {
        alert("Invalid held-sale invoice.");
        return;
    }

    try {
        const response =
            await fetch(
                `/productpages/recall/${encodeURIComponent(invoiceNumber)}`,
                {
                    method: "POST"
                }
            );

        const data = await response.json();

        if (!response.ok || !data.success) {
            alert(
                data.message ||
                "Unable to recall held sale."
            );
            return;
        }

        location.reload();

    } catch (error) {
        console.error(
            "Recall held sale error:",
            error
        );

        alert(
            "Unable to connect to the server."
        );
    }
}

/* =====================================================
   CASH CHANGE CALCULATION
===================================================== */

function ChangeAmount() {
    const paidInput =
        getElement("paidAmount");

    const totalElement =
        getElement("amountPayable");

    const changeElement =
        getElement("changeAmount");

    const cashPaidInput =
        getElement("cashAmountPaid");

    const cashModalChange =
        getElement("cashModalChange");

    if (!paidInput || !totalElement) {
        return;
    }

    const amountPaid =
        getNumber(paidInput.value);

    const grandTotal =
        getNumber(totalElement.textContent);

    const change =
        amountPaid - grandTotal;

    const formattedChange =
        Math.max(0, change).toFixed(2);

    if (changeElement) {
        changeElement.textContent =
            formattedChange;
    }

    if (cashPaidInput) {
        cashPaidInput.value =
            amountPaid.toFixed(2);
    }

    if (cashModalChange) {
        cashModalChange.textContent =
            formattedChange;
    }
}

/* =====================================================
   PAYMENT MODAL
===================================================== */

function openPaymentModal(modalId) {

    const modal = getElement(modalId);

    if (!modal) {
        console.error(
            `Payment modal "${modalId}" was not found.`
        );
        return;
    }

    /*
     * Split Payment requires its own
     * initialization before the modal opens.
     */
    if (modalId === "splitPaymentModal") {

        if (
            typeof initializeSplitPaymentModal ===
            "function"
        ) {
            initializeSplitPaymentModal();
        } else {

            console.error(
                "initializeSplitPaymentModal() is not available."
            );

            return;
        }
    }

    modal.style.display = "flex";
}


function closePaymentModal(modalId) {

    const modal = getElement(modalId);

    if (!modal) {
        return;
    }

    modal.style.display = "none";
}

/* =====================================================
   PRODUCT INITIALS
===================================================== */

function initializeProductInitials() {
    const productImages =
        document.querySelectorAll(".product-initial");

    productImages.forEach(element => {
        const text =
            element.textContent.trim();

        if (!text) {
            return;
        }

        const initials =
            text
                .split(/\s+/)
                .map(word => word.charAt(0))
                .join("")
                .substring(0, 2)
                .toUpperCase();

        element.textContent = initials;
    });
}

/* =====================================================
   CURRENT SALE CUSTOMER
===================================================== */

function setSelectedCustomer(customer) {

    if (
        !customer ||
        !customer.customer_id
    ) {

        clearSelectedCustomer();

        return;
    }


    const customerId =
        Number(customer.customer_id);


    if (
        !Number.isInteger(customerId) ||
        customerId <= 0
    ) {

        console.error(
            "Invalid customer ID:",
            customer.customer_id
        );

        clearSelectedCustomer();

        return;
    }


    selectedCustomerId =
        customerId;

    selectedCustomerData =
        customer;

    updateCurrentCustomerDisplay();
    syncSplitPaymentCustomer();

   
}

function getSelectedCustomerId() {
    return selectedCustomerId;
}

function clearSelectedCustomer() {

    selectedCustomerId = null;

    selectedCustomerData = null;


    updateCurrentCustomerDisplay();

    const splitCustomerId = document.getElementById(
            "splitCustomerId"
        );


    if (splitCustomerId) {

        splitCustomerId.value = "";
    }


    const splitCustomerDisplay = document.getElementById(
            "splitCustomerDisplay"
        );


    if (splitCustomerDisplay) {

        splitCustomerDisplay.textContent = "Walk-in Customer";
    }
}

function updateCurrentCustomerDisplay() {
    const nameElement = getElement("currentCustomerName");

    const detailsElement = getElement("currentCustomerDetails");

    const statusElement = document.querySelector(
            "#currentCustomerCard .customer-status-badge"
        );

    if (!nameElement || !detailsElement) {
        return;
    }

    if (!selectedCustomerData) {
        nameElement.textContent =
            "Walk-in Customer";

        detailsElement.textContent =
            "No registered customer attached";

        if (statusElement) {
            statusElement.textContent =
                "Default";
        }

        return;
    }

    nameElement.textContent =
        selectedCustomerData.customer_name ||
        "Registered Customer";

    const phone =
        selectedCustomerData.phone ||
        "No phone number";

    const code =
        selectedCustomerData.customer_code ||
        "No customer code";

    detailsElement.textContent =
        `${code} • ${phone}`;

    if (statusElement) {
        statusElement.textContent =
            "Selected";
    }
}

/* =====================================================
   CUSTOMER SEARCH
===================================================== */

function initializeCustomerSearch() {
    const searchInput =
        getElement("customerSearchInput");

    const resultsContainer =
        getElement("customerSearchResults");

    const clearSearchButton =
        getElement("clearCustomerSearch");

    const walkinButton =
        getElement("continueWalkinCustomer");

    if (
        !searchInput ||
        !resultsContainer
    ) {
        return;
    }

    let searchTimer = null;

    async function searchCustomers(searchValue) {
        const search =
            String(searchValue || "").trim();

        if (!search) {
            resultsContainer.innerHTML = `
                <div class="customer-empty-state">
                    <i class="fa-solid fa-user"></i>
                    <strong>
                        Search for a registered customer
                    </strong>
                    <span>
                        Enter a phone number, name or customer code.
                    </span>
                </div>
            `;

            return;
        }

        resultsContainer.innerHTML = `
            <div class="customer-empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <strong>
                    Searching customers...
                </strong>
                <span>
                    Please wait.
                </span>
            </div>
        `;

        try {
            const response =
                await fetch(
                    `/productpages/search-customers?search=${encodeURIComponent(search)}`
                );

            const result =
                await response.json();

            if (
                !response.ok ||
                !result.success
            ) {
                resultsContainer.innerHTML = `
                    <div class="customer-no-results">
                        <div class="customer-no-results-info">
                            <strong>
                                Unable to search customers
                            </strong>
                            <span>
                                ${escapeCustomerText(
                                    result.message ||
                                    "Customer search failed."
                                )}
                            </span>
                        </div>
                    </div>
                `;

                return;
            }

            displayCustomerResults(
                result.customers || []
            );

        } catch (error) {
            console.error(
                "Customer search error:",
                error
            );

            resultsContainer.innerHTML = `
                <div class="customer-no-results">
                    <div class="customer-no-results-icon">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>

                    <div class="customer-no-results-info">
                        <strong>
                            Unable to search customers
                        </strong>

                        <span>
                            Please try again.
                        </span>
                    </div>
                </div>
            `;
        }
    }

    function displayCustomerResults(customers) {
        resultsContainer.innerHTML = "";

        if (!customers.length) {
            resultsContainer.innerHTML = `
                <div class="customer-no-results">
                    <div class="customer-no-results-icon">
                        <i class="fa-solid fa-user-slash"></i>
                    </div>

                    <div class="customer-no-results-info">
                        <strong>
                            Customer not found
                        </strong>

                        <span>
                            Try another phone number, name or customer code.
                        </span>
                    </div>
                </div>
            `;

            return;
        }

        customers.forEach(customer => {
            const resultCard =
                document.createElement("div");

            resultCard.className =
                "customer-result";

            const icon =
                document.createElement("div");

            icon.className =
                "customer-result-icon";

            icon.innerHTML =
                '<i class="fa-solid fa-user"></i>';

            const info =
                document.createElement("div");

            info.className =
                "customer-result-info";

            const name =
                document.createElement("div");

            name.className =
                "customer-result-name";

            name.textContent =
                customer.customer_name ||
                "Unnamed Customer";

            const details =
                document.createElement("div");

            details.className =
                "customer-result-details";

            const code =
                document.createElement("span");

            code.className =
                "customer-result-code";

            code.textContent =
                customer.customer_code ||
                "No code";

            const phone =
                document.createElement("span");

            phone.textContent =
                customer.phone ||
                "No phone";

            details.appendChild(code);
            details.appendChild(phone);

            info.appendChild(name);
            info.appendChild(details);

            const selectButton =
                document.createElement("button");

            selectButton.type = "button";

            selectButton.className =
                "customer-select-btn";

            selectButton.innerHTML =
                `
                <i class="fa-solid fa-check"></i>
                Select
                `;

            selectButton.addEventListener(
                "click",
                () => {
                    selectCustomer(customer);
                }
            );

            resultCard.appendChild(icon);
            resultCard.appendChild(info);
            resultCard.appendChild(selectButton);

            resultsContainer.appendChild(
                resultCard
            );
        });
    }

    function selectCustomer(customer) {
        const customerName =
            customer.customer_name ||
            "this customer";

        if (
            !confirm(
                `Attach ${customerName} to this sale?`
            )
        ) {
            return;
        }

        setSelectedCustomer(customer);

        searchInput.value = "";

        if (clearSearchButton) {
            clearSearchButton.hidden = true;
        }

        resultsContainer.innerHTML = `
            <div class="customer-empty-state">
                <i class="fa-solid fa-circle-check"></i>

                <strong>
                    Customer selected
                </strong>

                <span>
                    ${escapeCustomerText(customerName)}
                    is now attached to this sale.
                </span>
            </div>
        `;

        const modalElement =
            getElement("customerModal");

        if (modalElement &&
            typeof bootstrap !== "undefined") {

            const modal =
                bootstrap.Modal.getInstance(
                    modalElement
                );

            if (modal) {
                modal.hide();
            }
        }
    }

    searchInput.addEventListener(
        "input",
        function () {
            const value =
                this.value.trim();

            if (clearSearchButton) {
                clearSearchButton.hidden =
                    !value;
            }

            clearTimeout(searchTimer);

            searchTimer =
                setTimeout(
                    () => {
                        searchCustomers(value);
                    },
                    300
                );
        }
    );

    if (clearSearchButton) {
        clearSearchButton.addEventListener(
            "click",
            function () {
                searchInput.value = "";

                clearSearchButton.hidden =
                    true;

                searchInput.focus();

                searchCustomers("");
            }
        );
    }

    if (walkinButton) {
        walkinButton.addEventListener(
            "click",
            function () {
                clearSelectedCustomer();

                searchInput.value = "";

                if (clearSearchButton) {
                    clearSearchButton.hidden =
                        true;
                }

                searchCustomers("");

                const modalElement =
                    getElement("customerModal");

                if (
                    modalElement &&
                    typeof bootstrap !== "undefined"
                ) {
                    const modal =
                        bootstrap.Modal.getInstance(
                            modalElement
                        );

                    if (modal) {
                        modal.hide();
                    }
                }
            }
        );
    }

    const customerModal =
        getElement("customerModal");

    if (customerModal) {
        customerModal.addEventListener(
            "shown.bs.modal",
            function () {
                searchInput.value = "";

                if (clearSearchButton) {
                    clearSearchButton.hidden =
                        true;
                }

                searchCustomers("");

                updateCurrentCustomerDisplay();

                searchInput.focus();
            }
        );
    }
}

/* =====================================================
   ESCAPE CUSTOMER TEXT
===================================================== */

function escapeCustomerText(value) {
    const div =
        document.createElement("div");

    div.textContent =
        String(value || "");

    return div.innerHTML;
}

/* =====================================================
   MOBILE MONEY NETWORK
===================================================== */

function selectMomoNetwork(button) {
    if (!button) {
        return;
    }

    const networkCards =
        document.querySelectorAll(
            ".momo-network-card"
        );

    networkCards.forEach(card => {
        card.classList.remove("active");
    });

    button.classList.add("active");

    const network =
        button.dataset.network || "";

    const networkInput =
        getElement("momoNetwork");

    if (networkInput) {
        networkInput.value =
            network;
    }
}

/* =====================================================
   OPEN MOBILE MONEY MODAL
===================================================== */

function openMomoPaymentModal() {
    const modal =
        getElement("momoPaymentModal");

    if (!modal) {
        return;
    }

    modal.style.display = "flex";

    const reference =
        getElement("momoReference");

    if (reference) {
        reference.value =
            "Waiting for Paystack...";
    }
}

/* =====================================================
   VALIDATE MOBILE MONEY
===================================================== */

function validateMomoPayment() {
    const networkInput =
        getElement("momoNetwork");

    const phoneInput =
        getElement("momoPhone");

    const network =
        networkInput
            ? networkInput.value.trim()
            : "";

    const phone =
        phoneInput
            ? phoneInput.value
                .trim()
                .replace(/\s+/g, "")
            : "";

    if (!network) {
        alert(
            "Please select a Mobile Money network."
        );
        return false;
    }

    if (!phone) {
        alert(
            "Please enter the customer's phone number."
        );

        if (phoneInput) {
            phoneInput.focus();
        }

        return false;
    }

    if (!/^0\d{9}$/.test(phone)) {
        alert(
            "Please enter a valid Ghana phone number."
        );

        if (phoneInput) {
            phoneInput.focus();
        }

        return false;
    }

    return true;
}

/* =====================================================
   MOBILE MONEY MESSAGE
===================================================== */

function showMomoPaymentMessage(message) {
    let messageBox =
        getElement("momoPaymentMessage");

    if (!messageBox) {
        messageBox =
            document.createElement("div");

        messageBox.id =
            "momoPaymentMessage";

        messageBox.style.marginTop = "15px";
        messageBox.style.padding = "12px";
        messageBox.style.borderRadius = "8px";
        messageBox.style.textAlign = "center";
        messageBox.style.fontWeight = "600";

        const body =
            document.querySelector(
                ".payment-modal-body"
            );

        if (!body) {
            return;
        }

        body.appendChild(messageBox);
    }

    messageBox.textContent =
        message;

    messageBox.style.display =
        "block";
}

/* =====================================================
   MOBILE MONEY PAYMENT
===================================================== */

function initializeMobileMoneyPayment() {
    const button =
        getElement("completeMomoPayment");

    if (!button) {
        return;
    }

    button.addEventListener(
        "click",
        async function () {
            if (!validateMomoPayment()) {
                return;
            }

            const totalElement =
                document.querySelector(
                    ".modal-grand-total"
                );

            if (!totalElement) {
                alert(
                    "Unable to determine the sale total."
                );
                return;
            }

            const amount =
                getNumber(
                    totalElement.textContent
                        .replace(/[^\d.]/g, "")
                );

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                alert(
                    "Invalid payment amount."
                );
                return;
            }

            const networkInput =
                getElement("momoNetwork");

            const phoneInput =
                getElement("momoPhone");

            const network =
                networkInput
                    ? networkInput.value.trim()
                    : "";

            const phone =
                phoneInput
                    ? phoneInput.value
                        .trim()
                        .replace(/\s+/g, "")
                    : "";

            button.disabled = true;

            button.innerHTML =
                `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Processing...
                `;

            showMomoPaymentMessage(
                "Connecting to Paystack..."
            );

            try {
                const response =
                    await fetch(
                        "/api/payments/mobile-money",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                total_amount: amount,
                                network: network,
                                phone: phone,
                                customer_id:
                                    getSelectedCustomerId()
                            })
                        }
                    );

                const result =
                    await response.json();

                if (
                    !response.ok ||
                    !result.success
                ) {
                    throw new Error(
                        result.message ||
                        "Unable to initiate payment."
                    );
                }

                const reference =
                    result.reference;

                if (!reference) {
                    throw new Error(
                        "Payment reference was not returned."
                    );
                }

                const referenceInput =
                    getElement("momoReference");

                if (referenceInput) {
                    referenceInput.value =
                        reference;
                }

                showMomoPaymentMessage(
                    "Payment request sent. Please approve the payment on your phone."
                );

                button.innerHTML =
                    `
                    <i class="fa-solid fa-clock"></i>
                    Waiting for Payment...
                    `;

                checkMobileMoneyStatus(
                    reference
                );

            } catch (error) {
                console.error(
                    "Mobile Money error:",
                    error
                );

                showMomoPaymentMessage(
                    error.message ||
                    "Unable to connect to the payment server."
                );

                button.disabled = false;

                button.innerHTML =
                    `
                    <i class="fa-solid fa-lock"></i>
                    Complete Sale
                    `;
            }
        }
    );
}

/* =====================================================
   CHECK MOBILE MONEY STATUS
===================================================== */

async function checkMobileMoneyStatus(reference) {
    const button =
        getElement("completeMomoPayment");

    if (!reference) {
        return;
    }

    const maxAttempts = 36;

    let attempts = 0;

    const interval =
        setInterval(async () => {
            attempts++;

            try {
                const response =
                    await fetch(
                        `/api/payments/mobile-money/status/${encodeURIComponent(reference)}`
                    );

                const result =
                    await response.json();

                if (
                    result.success &&
                    result.status === "success"
                ) {
                    clearInterval(interval);

                    showMomoPaymentMessage(
                        "✓ Mobile Money payment completed successfully."
                    );

                    if (button) {
                        button.innerHTML =
                            `
                            <i class="fa-solid fa-check"></i>
                            Payment Complete
                            `;
                    }

                    setTimeout(() => {
                        closePaymentModal(
                            "momoPaymentModal"
                        );

                        if (result.receipt) {
                            showReceipt(
                                result.receipt
                            );
                        }
                    }, 500);

                    return;
                }

                if (
                    result.status === "failed" ||
                    result.status === "abandoned"
                ) {
                    clearInterval(interval);

                    showMomoPaymentMessage(
                        result.message ||
                        "Mobile Money payment failed. Please try again."
                    );

                    if (button) {
                        button.disabled = false;

                        button.innerHTML =
                            `
                            <i class="fa-solid fa-lock"></i>
                            Complete Sale
                            `;
                    }

                    return;
                }

                if (attempts >= maxAttempts) {
                    clearInterval(interval);

                    showMomoPaymentMessage(
                        "Payment verification timed out. Please verify the transaction before trying again."
                    );

                    if (button) {
                        button.disabled = false;

                        button.innerHTML =
                            `
                            <i class="fa-solid fa-lock"></i>
                            Complete Sale
                            `;
                    }
                }

            } catch (error) {
                console.error(
                    "Payment status error:",
                    error
                );

                if (attempts >= maxAttempts) {
                    clearInterval(interval);

                    showMomoPaymentMessage(
                        "Unable to verify the payment status."
                    );

                    if (button) {
                        button.disabled = false;
                    }
                }
            }
        }, 5000);
}

/* =====================================================
   RECEIPT
===================================================== */

function showReceipt(receipt) {
    if (!receipt) {
        alert(
            "Sale completed, but no receipt was returned."
        );
        return;
    }

    currentReceipt =
        receipt;

    const invoice =
        getElement("receiptInvoice");

    const date =
        getElement("receiptDate");

    const cashier =
        getElement("receiptCashier");

    const customer =
        getElement("receiptCustomer");

    const payment =
        getElement("receiptPayment");

    const subtotal =
        getElement("receiptSubtotal");

    const discount =
        getElement("receiptDiscount");

    const tax =
        getElement("receiptTax");

    const grandTotal =
        getElement("receiptGrandTotal");

    const paid =
        getElement("receiptPaid");

    const change =
        getElement("receiptChange");

    if (invoice) {
        invoice.textContent =
            receipt.invoice_number || "---";
    }

    if (date) {
        date.textContent =
            formatReceiptDate(
                receipt.created_at
            );
    }

    if (cashier) {
        cashier.textContent =
            receipt.cashier_name ||
            receipt.cashier_id ||
            "---";
    }

    if (customer) {
        customer.textContent =
            receipt.customer_name ||
            "Walk-in Customer";
    }

    if (payment) {
        payment.textContent =
            receipt.payment_method ||
            "---";
    }

    if (subtotal) {
        subtotal.textContent =
            "GH₵ " +
            money(receipt.subtotal);
    }

    if (discount) {
        discount.textContent =
            "GH₵ " +
            money(receipt.discount);
    }

    if (tax) {
        tax.textContent =
            "GH₵ " +
            money(receipt.tax);
    }

    if (grandTotal) {
        grandTotal.textContent =
            "GH₵ " +
            money(
                receipt.GrandTotal ??
                receipt.grand_total
            );
    }

    if (paid) {
        paid.textContent =
            "GH₵ " +
            money(receipt.amount_paid);
    }

    if (change) {
        change.textContent =
            "GH₵ " +
            money(receipt.change_given);
    }

    renderReceiptItems(
        receipt.items || []
    );

    renderMomoReceiptDetails(
        receipt
    );

    const receiptModal =
        getElement("receiptModal");

    if (receiptModal) {
        receiptModal.style.display =
            "flex";
    }
}

function renderReceiptItems(items) {
    const container =
        getElement("receiptItems");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `
            <div style="
                text-align:center;
                padding:20px;
                color:#6b7280;
            ">
                No items found.
            </div>
        `;

        return;
    }

    items.forEach(item => {
        const row =
            document.createElement("div");

        row.className =
            "receipt-item";

        const name =
            escapeReceiptHTML(
                item.product_name
            );

        const sellingPrice =
            money(
                item.Selling_price ??
                item.selling_price
            );

        const quantity =
            escapeReceiptHTML(
                item.quantity
            );

        const total =
            money(
                item.total_price ??
                item.TotalPrice
            );

        row.innerHTML = `
            <div>
                <div class="receipt-item-name">
                    ${name}
                </div>

                <div class="receipt-item-price">
                    GH₵ ${sellingPrice}
                </div>
            </div>

            <div class="receipt-item-qty">
                ${quantity}
            </div>

            <div class="receipt-item-total">
                GH₵ ${total}
            </div>
        `;

        container.appendChild(row);
    });
}

/* =====================================================
   MOBILE MONEY RECEIPT DETAILS
===================================================== */

function renderMomoReceiptDetails(receipt) {
    const network =
        getElement("receiptNetwork");

    const phone =
        getElement("receiptPhone");

    const reference =
        getElement("receiptTransactionRef");

    const status =
        getElement("receiptPaymentStatus");

    const details = getElement(
            "mobileMoneyReceiptDetails"
        );

    const paymentMethod = String(receipt.payment_method || "").toLowerCase();
    const isMomo = paymentMethod === "mobile money" || paymentMethod === "split payment" || paymentMethod === "Cash";
    debugger;
    if (!isMomo) {
        if (details) {
            details.style.display =
                "none";
        }
        return;
    }

    if (details) {
        details.style.display =
            "";
    }

    if (network) {
        network.textContent =
            receipt.network ||
            receipt.momo_network ||
            "---";
    }

    if (phone) {
        phone.textContent =
            receipt.phone ||
            receipt.momo_phone ||
            "---";
    }

    if (reference) {
        reference.textContent =
            receipt.transaction_ref ||
            receipt.reference ||
            "---";
    }

    if (status) {
        status.textContent =
            receipt.payment_status ||
            "Paid";
    }
}

/* =====================================================
   CLOSE RECEIPT
===================================================== */

function closeReceiptModal() {
    const modal =
        getElement("receiptModal");

    if (modal) {
        modal.style.display =
            "none";
    }
}

/* =====================================================
   MONEY
===================================================== */

function money(value) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return "0.00";
    }

    return number.toFixed(2);
}

/* =====================================================
   DATE
===================================================== */

function formatReceiptDate(dateValue) {
    if (!dateValue) {
        return "---";
    }

    const date =
        new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return String(dateValue);
    }

    return date.toLocaleString(
        "en-GH",
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );
}

/* =====================================================
   RECEIPT HTML ESCAPE
===================================================== */

function escapeReceiptHTML(value) {
    const div =
        document.createElement("div");

    div.textContent =
        value ?? "";

    return div.innerHTML;
}

/* =====================================================
   PRINT RECEIPT
===================================================== */

function printReceipt() {
    if (!currentReceipt) {
        return;
    }

    const content =
        document.querySelector(
            ".receipt-modal-content"
        );

    if (!content) {
        return;
    }

    const receiptContent =
        content.cloneNode(true);

    const actions =
        receiptContent.querySelector(
            ".receipt-actions"
        );

    if (actions) {
        actions.remove();
    }

    const closeButton =
        receiptContent.querySelector(
            ".receipt-close"
        );

    if (closeButton) {
        closeButton.remove();
    }

    const printWindow =
        window.open(
            "",
            "_blank",
            "width=500,height=700"
        );

    if (!printWindow) {
        alert(
            "Please allow pop-ups to print the receipt."
        );
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>
                ${escapeReceiptHTML(
                    currentReceipt.invoice_number ||
                    "Receipt"
                )}
            </title>

            <style>
                * {
                    box-sizing: border-box;
                }

                body {
                    margin: 0;
                    padding: 20px;
                    font-family:
                        Arial,
                        Helvetica,
                        sans-serif;
                    background: white;
                    color: #111827;
                }

                .receipt-modal-content {
                    width: 100%;
                    max-width: 470px;
                    margin: auto;
                }

                .receipt-top {
                    text-align: center;
                    padding: 20px;
                }

                .receipt-info {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    padding: 15px 0;
                    border-bottom: 1px dashed #999;
                }

                .receipt-info div {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .receipt-info span {
                    font-size: 11px;
                    color: #666;
                }

                .receipt-info strong {
                    font-size: 12px;
                }

                .receipt-items {
                    padding: 15px 0;
                }

                .receipt-items-header,
                .receipt-item {
                    display: grid;
                    grid-template-columns:
                        1fr 50px 90px;
                    gap: 8px;
                }

                .receipt-items-header {
                    padding-bottom: 8px;
                    border-bottom: 1px solid #999;
                    font-size: 11px;
                    font-weight: bold;
                }

                .receipt-item {
                    padding: 9px 0;
                    border-bottom: 1px dashed #ddd;
                    font-size: 12px;
                }

                .receipt-item-qty {
                    text-align: center;
                }

                .receipt-item-total {
                    text-align: right;
                    font-weight: bold;
                }

                .receipt-item-price {
                    font-size: 10px;
                    color: #666;
                    margin-top: 2px;
                }

                .receipt-summary > div {
                    display: flex;
                    justify-content: space-between;
                    padding: 5px 0;
                    font-size: 12px;
                }

                .receipt-grand-total {
                    border-top: 2px solid #111;
                    margin-top: 8px;
                    padding-top: 10px !important;
                    font-size: 16px !important;
                }

                .receipt-payment {
                    margin-top: 15px;
                    padding: 12px;
                    background: #f3f4f6;
                    display: flex;
                    justify-content: space-between;
                }

                .receipt-payment div {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .receipt-payment span {
                    font-size: 10px;
                    color: #666;
                }

                .receipt-payment strong {
                    font-size: 12px;
                }

                .receipt-footer {
                    text-align: center;
                    padding: 20px 0;
                }

                .mobile-money-receipt-details {
                    margin-top: 15px;
                    padding: 12px;
                    background: #f8fafc;
                    border: 1px dashed #cbd5e1;
                    border-radius: 8px;
                }

                .mobile-money-receipt-details div {
                    display: flex;
                    justify-content: space-between;
                    gap: 15px;
                    padding: 6px 0;
                }

                .mobile-money-receipt-details span {
                    font-size: 11px;
                    color: #6b7280;
                }

                .mobile-money-receipt-details strong {
                    font-size: 12px;
                    color: #111827;
                    text-align: right;
                    word-break: break-word;
                }

                #receiptPaymentStatus {
                    color: #198754;
                    font-weight: 700;
                }
            </style>
        </head>

        <body>
            ${receiptContent.outerHTML}
        </body>
        </html>
    `);

    printWindow.document.close();

    printWindow.focus();

    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

/* =====================================================
   NEW SALE
===================================================== */

function startNewSale() {
    clearSelectedCustomer();
    closeReceiptModal();

    window.location.href =
        "/productpages/main";
}

/* =====================================================
   CASH PAYMENT
===================================================== */

function initializeCashPayment() {
    const button =
        getElement("completeCashPayment");

    if (!button) {
        return;
    }

    button.addEventListener(
        "click",
        async function () {
            const amountPayableElement =
                getElement("amountPayable");

            const cashAmountInput =
                getElement("cashAmountPaid");

            if (
                !amountPayableElement ||
                !cashAmountInput
            ) {
                alert(
                    "Payment form is incomplete."
                );
                return;
            }

            const amountPayable =
                getNumber(
                    amountPayableElement.textContent
                );

            const amountPaid =
                getNumber(
                    cashAmountInput.value
                );

            if (
                !Number.isFinite(amountPayable) ||
                amountPayable <= 0
            ) {
                alert(
                    "Invalid amount payable."
                );
                return;
            }

            if (
                !Number.isFinite(amountPaid) ||
                amountPaid <= 0
            ) {
                alert(
                    "Please enter the amount received."
                );

                cashAmountInput.focus();

                return;
            }

            if (amountPaid < amountPayable) {
                alert(
                    "Amount received is less than the amount payable."
                );

                cashAmountInput.focus();

                return;
            }

            const change =
                amountPaid -
                amountPayable;

            button.disabled = true;

            button.innerHTML =
                `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Processing...
                `;

            try {
                const response =
                    await fetch(
                        "/productpages/Onsalesitems/purchase",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                total_amount:
                                    amountPayable,

                                amount_paid:
                                    amountPaid,

                                change_amount:
                                    change,

                                payment_method:
                                    "Cash",

                                customer_id:
                                    getSelectedCustomerId()
                            })
                        }
                    );

                const result =
                    await response.json();

                if (
                    !response.ok ||
                    !result.success
                ) {
                    throw new Error(
                        result.message ||
                        "Unable to complete sale."
                    );
                }

                closePaymentModal(
                    "cashPaymentModal"
                );

                showReceipt(
                    result.receipt
                );

            } catch (error) {
                console.error(
                    "Cash payment error:",
                    error
                );

                alert(
                    error.message ||
                    "Unable to connect to the server."
                );

            } finally {
                button.disabled = false;

                button.innerHTML =
                    `
                    <i class="fa-solid fa-check"></i>
                    Complete Sale
                    `;
            }
        }
    );
}

/* =====================================================
   CUSTOMER REGISTRATION
===================================================== */

function initializeCustomerRegistration() {
    const openButton =
        getElement(
            "openCustomerRegistration"
        );

    const registrationModalElement =
        getElement(
            "customerRegistrationModal"
        );

    const customerModalElement =
        getElement("customerModal");

    if (
        !openButton ||
        !registrationModalElement ||
        typeof bootstrap === "undefined"
    ) {
        return;
    }

    const registrationModal =
        new bootstrap.Modal(
            registrationModalElement
        );

    openButton.addEventListener(
        "click",
        function () {
            if (customerModalElement) {
                const customerModal =
                    bootstrap.Modal.getInstance(
                        customerModalElement
                    );

                if (customerModal) {
                    customerModal.hide();
                }
            }

            const form =
                getElement(
                    "customerRegistrationForm"
                );

            if (form) {
                form.reset();
            }

            const message =
                getElement(
                    "customerRegistrationMessage"
                );

            if (message) {
                message.style.display =
                    "none";

                message.textContent =
                    "";

                message.className =
                    "customer-form-message";
            }

            registrationModal.show();
        }
    );

    const registrationForm =
        getElement(
            "customerRegistrationForm"
        );

    if (!registrationForm) {
        return;
    }

    const message =
        getElement(
            "customerRegistrationMessage"
        );

    const submitButton =
        getElement(
            "registerCustomerSubmit"
        );

    registrationForm.addEventListener(
        "submit",
        async function (event) {
            event.preventDefault();

            if (!registrationForm.checkValidity()) {
                registrationForm.reportValidity();
                return;
            }

            const formData =
                new FormData(
                    registrationForm
                );

            const customerData = {
                customer_name:
                    String(
                        formData.get(
                            "customer_name"
                        ) || ""
                    ).trim(),

                phone:
                    String(
                        formData.get(
                            "phone"
                        ) || ""
                    ).trim(),

                Email:
                    String(
                        formData.get(
                            "Email"
                        ) || ""
                    ).trim(),

                Address:
                    String(
                        formData.get(
                            "Address"
                        ) || ""
                    ).trim(),

                city:
                    String(
                        formData.get(
                            "city"
                        ) || ""
                    ).trim()
            };

            if (submitButton) {
                submitButton.disabled =
                    true;

                submitButton.innerHTML =
                    `
                    <i class="fas fa-spinner fa-spin"></i>
                    Registering...
                    `;
            }

            if (message) {
                message.style.display =
                    "none";

                message.textContent =
                    "";
            }

            try {
                const response =
                    await fetch(
                        "/productpages/customers/register",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    customerData
                                )
                        }
                    );

                const result =
                    await response.json();

                if (
                    !response.ok ||
                    !result.success
                ) {
                    throw new Error(
                        result.message ||
                        "Unable to register customer."
                    );
                }

                if (result.customer) {
                    setSelectedCustomer(
                        result.customer
                    );
                }

                if (
                    typeof bootstrap !== "undefined"
                ) {
                    const modal =
                        bootstrap.Modal.getInstance(
                            registrationModalElement
                        );

                    if (modal) {
                        modal.hide();
                    }
                }

                if (message) {
                    message.style.display =
                        "block";

                    message.className =
                        "customer-form-message alert alert-success";

                    message.textContent =
                        "Customer registered successfully.";
                }

                registrationForm.reset();

            } catch (error) {
                console.error(
                    "Customer registration error:",
                    error
                );

                if (message) {
                    message.style.display =
                        "block";

                    message.className =
                        "customer-form-message alert alert-danger";

                    message.textContent =
                        error.message ||
                        "Failed to register customer.";
                }

            } finally {
                if (submitButton) {
                    submitButton.disabled =
                        false;

                    submitButton.innerHTML =
                        `
                        <i class="fas fa-user-plus"></i>
                        Register Customer
                        `;
                }
            }
        }
    );
}

/* =====================================================
   INITIALIZE POS
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    function () {
        initializeProductSearch();
        initializeProductPurchaseModal();
        initializePriceSearch();
        initializeProductInitials();
        initializeCustomerSearch();
        initializeMobileMoneyPayment();
        initializeCashPayment();
        initializeCustomerRegistration();
        updateCurrentCustomerDisplay();
    }
);