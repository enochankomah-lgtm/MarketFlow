
/** Adjust stock */
document.addEventListener("DOMContentLoaded", () => {

    const adjustStockForm =
        document.getElementById("adjustStockForm");

    const adjustBranch =
        document.getElementById("adjustBranch");

    const adjustProduct =
        document.getElementById("adjustProduct");

    const adjustDirection =
        document.getElementById("adjustDirection");

    const adjustQuantity =
        document.getElementById("adjustQuantity");

    const adjustReason =
        document.getElementById("adjustReason");


    /*
    |--------------------------------------------------------------------------
    | SAFETY CHECK
    |--------------------------------------------------------------------------
    */

    if (
        !adjustStockForm ||
        !adjustBranch ||
        !adjustProduct ||
        !adjustDirection ||
        !adjustQuantity ||
        !adjustReason
    ) {
        console.error(
            "Stock adjustment form elements were not found."
        );

        return;
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD BRANCHES
    |--------------------------------------------------------------------------
    */

    async function loadAdjustmentBranches() {

        try {

            adjustBranch.innerHTML =
                '<option value="">Loading branches...</option>';

            adjustBranch.disabled = true;

            const response = await fetch(
                "/stock-movements/branch-transfer/branches"
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message ||
                    "Failed to load branches."
                );
            }

            adjustBranch.innerHTML =
                '<option value="">Select branch</option>';

            result.branches.forEach(branch => {

                const option =
                    document.createElement("option");

                option.value =
                    branch.branch_id;

                option.textContent =
                    branch.branch_name;

                adjustBranch.appendChild(option);
            });

            adjustBranch.disabled = false;

        } catch (error) {

            console.error(
                "Adjustment branch loading error:",
                error
            );

            adjustBranch.innerHTML =
                '<option value="">Unable to load branches</option>';

            alert(
                error.message ||
                "Failed to load branches."
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD PRODUCTS FOR SELECTED BRANCH
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    | This currently uses the existing branch-transfer product endpoint.
    |
    | That endpoint may exclude products with zero available stock.
    | Therefore, Stock IN for a zero-stock product may not be possible
    | until a dedicated adjustment-product endpoint is added.
    |
    */

    async function loadAdjustmentProducts(branchId) {

        adjustProduct.disabled = true;

        adjustProduct.innerHTML =
            '<option value="">Loading products...</option>';

        if (!branchId) {

            adjustProduct.innerHTML =
                '<option value="">Select product</option>';

            return;
        }

        try {

            const response = await fetch(
                `/stock-movements/branch-transfer/products?source_branch_id=${encodeURIComponent(branchId)}`
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message ||
                    "Failed to load products."
                );
            }

            adjustProduct.innerHTML =
                '<option value="">Select product</option>';

            if (
                !Array.isArray(result.products) ||
                result.products.length === 0
            ) {

                adjustProduct.innerHTML =
                    '<option value="">No products available</option>';

                return;
            }

            result.products.forEach(product => {

                const option =
                    document.createElement("option");

                option.value =
                    product.product_id;

                const available =
                    Number(
                        product.quantity_available || 0
                    );

                option.textContent =
                    `${product.product_name} — Available: ${available.toFixed(3)}`;

                /*
                 * Store available quantity.
                 */
                option.dataset.available =
                    available;

                adjustProduct.appendChild(option);
            });

            adjustProduct.disabled = false;

        } catch (error) {

            console.error(
                "Adjustment product loading error:",
                error
            );

            adjustProduct.innerHTML =
                '<option value="">Unable to load products</option>';

            alert(
                error.message ||
                "Failed to load products."
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE QUANTITY LIMIT
    |--------------------------------------------------------------------------
    */

    function updateQuantityLimit() {

        const selectedOption =
            adjustProduct.options[
                adjustProduct.selectedIndex
            ];

        /*
         * Nothing selected.
         */
        if (
            !selectedOption ||
            !selectedOption.value
        ) {

            adjustQuantity.removeAttribute("max");
            adjustQuantity.title = "";

            return;
        }

        const available =
            Number(
                selectedOption.dataset.available || 0
            );

        /*
         * STOCK OUT
         *
         * Cannot remove more than the currently
         * available stock.
         */
        if (adjustDirection.value === "OUT") {

            adjustQuantity.max =
                available;

            adjustQuantity.title =
                `Available stock: ${available.toFixed(3)}`;

            return;
        }

        /*
         * STOCK IN
         *
         * There is no maximum based on current stock.
         */
        adjustQuantity.removeAttribute("max");

        adjustQuantity.title =
            "Stock In can increase the available quantity.";
    }


    /*
    |--------------------------------------------------------------------------
    | BRANCH CHANGE
    |--------------------------------------------------------------------------
    */

    adjustBranch.addEventListener(
        "change",
        async () => {

            /*
             * Clear product and quantity state.
             */
            adjustProduct.innerHTML =
                '<option value="">Select product</option>';

            adjustProduct.disabled = true;

            adjustQuantity.value = "";

            adjustQuantity.removeAttribute("max");

            adjustQuantity.title = "";

            await loadAdjustmentProducts(
                adjustBranch.value
            );
        }
    );


    /*
    |--------------------------------------------------------------------------
    | PRODUCT CHANGE
    |--------------------------------------------------------------------------
    */

    adjustProduct.addEventListener(
        "change",
        () => {

            adjustQuantity.value = "";

            updateQuantityLimit();
        }
    );


    /*
    |--------------------------------------------------------------------------
    | DIRECTION CHANGE
    |--------------------------------------------------------------------------
    */

    adjustDirection.addEventListener(
        "change",
        () => {

            adjustQuantity.value = "";

            updateQuantityLimit();
        }
    );


    /*
    |--------------------------------------------------------------------------
    | SUBMIT STOCK ADJUSTMENT
    |--------------------------------------------------------------------------
    */

    adjustStockForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            /*
             * Read values.
             */

            const branchId =
                Number(adjustBranch.value);

            const productId =
                Number(adjustProduct.value);

            const direction =
                String(
                    adjustDirection.value || ""
                )
                .trim()
                .toUpperCase();

            const quantity =
                Number(adjustQuantity.value);

            const reason =
                adjustReason.value.trim();


            /*
             |--------------------------------------------------------------------------
             | VALIDATION
             |--------------------------------------------------------------------------
             */

            if (!Number.isInteger(branchId) || branchId <= 0) {

                alert(
                    "Please select a branch."
                );

                adjustBranch.focus();

                return;
            }


            if (!Number.isInteger(productId) || productId <= 0) {

                alert(
                    "Please select a product."
                );

                adjustProduct.focus();

                return;
            }


            if (
                direction !== "IN" &&
                direction !== "OUT"
            ) {

                alert(
                    "Please select a valid stock direction."
                );

                adjustDirection.focus();

                return;
            }


            if (
                !Number.isFinite(quantity) ||
                quantity <= 0
            ) {

                alert(
                    "Please enter a valid quantity greater than zero."
                );

                adjustQuantity.focus();

                return;
            }


            /*
             * Match the database/controller precision.
             */
            const roundedQuantity =
                Math.round(
                    quantity * 1000
                ) / 1000;


            if (roundedQuantity <= 0) {

                alert(
                    "Quantity must be greater than zero."
                );

                adjustQuantity.focus();

                return;
            }


            if (!reason) {

                alert(
                    "Please enter the reason for this adjustment."
                );

                adjustReason.focus();

                return;
            }


            /*
             |--------------------------------------------------------------------------
             | EXTRA OUT VALIDATION
             |--------------------------------------------------------------------------
             */

            if (direction === "OUT") {

                const selectedOption =
                    adjustProduct.options[
                        adjustProduct.selectedIndex
                    ];

                const available =
                    Number(
                        selectedOption?.dataset?.available || 0
                    );

                if (
                    roundedQuantity >
                    available
                ) {

                    alert(
                        `Cannot remove ${roundedQuantity.toFixed(3)} units. ` +
                        `Only ${available.toFixed(3)} units are available.`
                    );

                    adjustQuantity.focus();

                    return;
                }
            }


            /*
             |--------------------------------------------------------------------------
             | BUTTON STATE
             |--------------------------------------------------------------------------
             */

            const submitButton =
                adjustStockForm.querySelector(
                    'button[type="submit"]'
                );

            if (!submitButton) {
                return;
            }

            const originalButtonHTML =
                submitButton.innerHTML;

            submitButton.disabled = true;

            submitButton.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> Adjusting...';


            try {

                /*
                 |--------------------------------------------------------------------------
                 | SEND TO BACKEND
                 |--------------------------------------------------------------------------
                 */

                const response =
                    await fetch(
                        "/stock-movements/stock/adjust",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({

                                branch_id:
                                    branchId,

                                product_id:
                                    productId,

                                direction:
                                    direction,

                                quantity:
                                    roundedQuantity,

                                reason:
                                    reason
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
                        "Stock adjustment failed."
                    );
                }


                /*
                 |--------------------------------------------------------------------------
                 | SUCCESS
                 |--------------------------------------------------------------------------
                 */

                alert(
                    result.message ||
                    "Stock adjustment completed successfully."
                );


                /*
                 |--------------------------------------------------------------------------
                 | RESET FORM
                 |--------------------------------------------------------------------------
                 */

                adjustStockForm.reset();

                adjustProduct.innerHTML =
                    '<option value="">Select product</option>';

                adjustProduct.disabled =
                    true;

                adjustQuantity.removeAttribute(
                    "max"
                );

                adjustQuantity.title =
                    "";


                /*
                 |--------------------------------------------------------------------------
                 | RELOAD PRODUCTS
                 |--------------------------------------------------------------------------
                 |
                 | Keep the selected branch so the user can
                 | perform another adjustment.
                 |
                 */

                if (branchId) {

                    adjustBranch.value =
                        branchId;

                    await loadAdjustmentProducts(
                        branchId
                    );
                }


            } catch (error) {

                console.error(
                    "Stock adjustment error:",
                    error
                );

                alert(
                    error.message ||
                    "Unable to complete stock adjustment."
                );

            } finally {

                submitButton.disabled =
                    false;

                submitButton.innerHTML =
                    originalButtonHTML;
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    loadAdjustmentBranches();

});


/*
|--------------------------------------------------------------------------
| STOCK LOSS
|--------------------------------------------------------------------------
|
| Removes damaged, spoiled, expired, lost or stolen stock.
|
| Backend endpoint:
|
| POST /stock-movements/stock/loss
|
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", () => {

    const stockLossForm =
        document.getElementById("stockLossForm");

    const lossBranch =
        document.getElementById("lossBranch");

    const lossProduct =
        document.getElementById("lossProduct");

    const lossType =
        document.getElementById("lossType");

    const lossQuantity =
        document.getElementById("lossQuantity");

    const lossReason =
        document.getElementById("lossReason");


    /*
    |--------------------------------------------------------------------------
    | SAFETY CHECK
    |--------------------------------------------------------------------------
    */

    if (
        !stockLossForm ||
        !lossBranch ||
        !lossProduct ||
        !lossType ||
        !lossQuantity ||
        !lossReason
    ) {

        console.error(
            "Stock Loss form elements were not found."
        );

        return;
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD BRANCHES
    |--------------------------------------------------------------------------
    */

    async function loadStockLossBranches() {

        try {

            lossBranch.innerHTML =
                '<option value="">Loading branches...</option>';

            lossBranch.disabled = true;

            const response =
                await fetch(
                    "/stock-movements/branch-transfer/branches"
                );


            const result =
                await response.json();


            if (
                !response.ok ||
                !result.success
            ) {

                throw new Error(
                    result.message ||
                    "Failed to load branches."
                );
            }


            lossBranch.innerHTML =
                '<option value="">Select branch</option>';


            if (
                !Array.isArray(result.branches) ||
                result.branches.length === 0
            ) {

                lossBranch.innerHTML =
                    '<option value="">No branches available</option>';

                return;
            }


            result.branches.forEach(branch => {

                const option =
                    document.createElement("option");


                option.value =
                    branch.branch_id;


                option.textContent =
                    branch.branch_name;


                lossBranch.appendChild(
                    option
                );

            });


            lossBranch.disabled = false;


        } catch (error) {

            console.error(
                "Stock Loss branch loading error:",
                error
            );


            lossBranch.innerHTML =
                '<option value="">Unable to load branches</option>';


            alert(
                error.message ||
                "Failed to load branches."
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD PRODUCTS FOR SELECTED BRANCH
    |--------------------------------------------------------------------------
    */

    async function loadStockLossProducts(branchId) {

        lossProduct.disabled = true;

        lossProduct.innerHTML =
            '<option value="">Loading products...</option>';


        if (!branchId) {

            lossProduct.innerHTML =
                '<option value="">Select product</option>';

            return;
        }


        try {

            /*
             * Stock Loss can only remove existing stock.
             *
             * Therefore the existing branch-transfer product
             * endpoint is suitable here because it returns
             * products that have available stock.
             */

            const response =
                await fetch(
                    `/stock-movements/branch-transfer/products?source_branch_id=${encodeURIComponent(branchId)}`
                );


            const result =
                await response.json();


            if (
                !response.ok ||
                !result.success
            ) {

                throw new Error(
                    result.message ||
                    "Failed to load products."
                );
            }


            lossProduct.innerHTML =
                '<option value="">Select product</option>';


            if (
                !Array.isArray(result.products) ||
                result.products.length === 0
            ) {

                lossProduct.innerHTML =
                    '<option value="">No stock available</option>';

                return;
            }


            result.products.forEach(product => {

                const option =
                    document.createElement("option");


                option.value =
                    product.product_id;


                const available =
                    Number(
                        product.quantity_available || 0
                    );


                option.textContent =
                    `${product.product_name} — Available: ${available.toFixed(3)}`;


                /*
                 * Store available quantity on the option.
                 */

                option.dataset.available =
                    available;


                lossProduct.appendChild(
                    option
                );

            });


            lossProduct.disabled = false;


        } catch (error) {

            console.error(
                "Stock Loss product loading error:",
                error
            );


            lossProduct.innerHTML =
                '<option value="">Unable to load products</option>';


            alert(
                error.message ||
                "Failed to load products."
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE QUANTITY LIMIT
    |--------------------------------------------------------------------------
    */

    function updateLossQuantityLimit() {

        const selectedOption =
            lossProduct.options[
                lossProduct.selectedIndex
            ];


        /*
         * No product selected.
         */

        if (
            !selectedOption ||
            !selectedOption.value
        ) {

            lossQuantity.removeAttribute(
                "max"
            );

            lossQuantity.title = "";

            return;
        }


        const available =
            Number(
                selectedOption.dataset.available || 0
            );


        /*
         * The user cannot remove more stock
         * than is currently available.
         */

        lossQuantity.max =
            available;


        lossQuantity.title =
            `Available stock: ${available.toFixed(3)}`;
    }


    /*
    |--------------------------------------------------------------------------
    | BRANCH CHANGE
    |--------------------------------------------------------------------------
    */

    lossBranch.addEventListener(
        "change",
        async () => {

            /*
             * Clear current product.
             */

            lossProduct.innerHTML =
                '<option value="">Select product</option>';

            lossProduct.disabled = true;


            /*
             * Clear quantity.
             */

            lossQuantity.value = "";

            lossQuantity.removeAttribute(
                "max"
            );

            lossQuantity.title = "";


            /*
             * Load products for selected branch.
             */

            await loadStockLossProducts(
                lossBranch.value
            );
        }
    );


    /*
    |--------------------------------------------------------------------------
    | PRODUCT CHANGE
    |--------------------------------------------------------------------------
    */

    lossProduct.addEventListener(
        "change",
        () => {

            /*
             * Clear quantity whenever
             * the product changes.
             */

            lossQuantity.value = "";


            updateLossQuantityLimit();
        }
    );


    /*
    |--------------------------------------------------------------------------
    | SUBMIT STOCK LOSS
    |--------------------------------------------------------------------------
    */

    stockLossForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            /*
            |--------------------------------------------------------------------------
            | READ FORM VALUES
            |--------------------------------------------------------------------------
            */

            const branchId =
                Number(
                    lossBranch.value
                );


            const productId =
                Number(
                    lossProduct.value
                );


            const movementType =
                String(
                    lossType.value || ""
                )
                .trim()
                .toUpperCase();


            const quantity =
                Number(
                    lossQuantity.value
                );


            const notes =
                lossReason.value.trim();


            /*
            |--------------------------------------------------------------------------
            | VALIDATION
            |--------------------------------------------------------------------------
            */

            if (
                !Number.isInteger(branchId) ||
                branchId <= 0
            ) {

                alert(
                    "Please select a branch."
                );

                lossBranch.focus();

                return;
            }


            if (
                !Number.isInteger(productId) ||
                productId <= 0
            ) {

                alert(
                    "Please select a product."
                );

                lossProduct.focus();

                return;
            }


            /*
             * Allowed loss reasons.
             */

            const allowedLossTypes = [
                "DAMAGE",
                "SPOILED",
                "EXPIRED",
                "LOST",
                "THEFT",
                "OTHER"
            ];


            if (
                !allowedLossTypes.includes(
                    movementType
                )
            ) {

                alert(
                    "Please select a valid stock loss reason."
                );

                lossType.focus();

                return;
            }


            if (
                !Number.isFinite(quantity) ||
                quantity <= 0
            ) {

                alert(
                    "Please enter a valid quantity greater than zero."
                );

                lossQuantity.focus();

                return;
            }


            /*
            |--------------------------------------------------------------------------
            | ROUND TO 3 DECIMAL PLACES
            |--------------------------------------------------------------------------
            */

            const roundedQuantity =
                Math.round(
                    quantity * 1000
                ) / 1000;


            if (
                roundedQuantity <= 0
            ) {

                alert(
                    "Quantity must be greater than zero."
                );

                lossQuantity.focus();

                return;
            }


            /*
            |--------------------------------------------------------------------------
            | CHECK AVAILABLE STOCK
            |--------------------------------------------------------------------------
            */

            const selectedOption =
                lossProduct.options[
                    lossProduct.selectedIndex
                ];


            const available =
                Number(
                    selectedOption?.dataset?.available || 0
                );


            if (
                roundedQuantity >
                available
            ) {

                alert(
                    `Cannot remove ${roundedQuantity.toFixed(3)} units. ` +
                    `Only ${available.toFixed(3)} units are available.`
                );


                lossQuantity.focus();

                return;
            }


            /*
            |--------------------------------------------------------------------------
            | BUTTON STATE
            |--------------------------------------------------------------------------
            */

            const submitButton =
                stockLossForm.querySelector(
                    'button[type="submit"]'
                );


            if (!submitButton) {
                return;
            }


            const originalButtonHTML =
                submitButton.innerHTML;


            submitButton.disabled =
                true;


            submitButton.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> Removing...';


            /*
            |--------------------------------------------------------------------------
            | SEND TO BACKEND
            |--------------------------------------------------------------------------
            */

            try {

                const response =
                    await fetch(
                        "/stock-movements/stock/loss",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({

                                branch_id:
                                    branchId,

                                product_id:
                                    productId,

                                movement_type:
                                    movementType,

                                quantity:
                                    roundedQuantity,

                                notes:
                                    notes
                            })
                        }
                    );


                /*
                |--------------------------------------------------------------------------
                | READ RESPONSE
                |--------------------------------------------------------------------------
                */

                const result =
                    await response.json();


                if (
                    !response.ok ||
                    !result.success
                ) {

                    throw new Error(
                        result.message ||
                        "Stock loss failed."
                    );
                }


                /*
                |--------------------------------------------------------------------------
                | SUCCESS
                |--------------------------------------------------------------------------
                */

                alert(
                    result.message ||
                    "Stock loss recorded successfully."
                );


                /*
                |--------------------------------------------------------------------------
                | RESET FORM
                |--------------------------------------------------------------------------
                */

                stockLossForm.reset();


                /*
                 * Reset product selector.
                 */

                lossProduct.innerHTML =
                    '<option value="">Select product</option>';


                lossProduct.disabled =
                    true;


                /*
                 * Reset quantity state.
                 */

                lossQuantity.value = "";

                lossQuantity.removeAttribute(
                    "max"
                );

                lossQuantity.title = "";


                if (branchId) {

                    lossBranch.value =
                        branchId;


                    await loadStockLossProducts(
                        branchId
                    );
                }


            } catch (error) {

                console.error(
                    "Stock Loss error:",
                    error
                );


                alert(
                    error.message ||
                    "Unable to complete stock loss."
                );


            } finally {

                submitButton.disabled =
                    false;


                submitButton.innerHTML =
                    originalButtonHTML;
            }
        }
    );

    loadStockLossBranches();

});

document.addEventListener("DOMContentLoaded", () => {
    const stockReturnForm = document.getElementById("stockReturnForm");
    const returnBranch = document.getElementById("returnBranch");
    const returnProduct = document.getElementById("returnProduct");
    const returnType = document.getElementById("returnType");
    const returnQuantity = document.getElementById("returnQuantity");
    const returnReason = document.getElementById("returnReason");

    if (
        !stockReturnForm ||
        !returnBranch ||
        !returnProduct ||
        !returnType ||
        !returnQuantity ||
        !returnReason
    ) {
        console.error("Stock Return form elements were not found.");
        return;
    }

    async function loadReturnBranches() {
        try {
            returnBranch.innerHTML =
                '<option value="">Loading branches...</option>';

            returnBranch.disabled = true;

            const response = await fetch(
                "/stock-movements/branch-transfer/branches"
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Failed to load branches."
                );
            }

            returnBranch.innerHTML =
                '<option value="">Select branch</option>';

            if (
                !Array.isArray(result.branches) ||
                result.branches.length === 0
            ) {
                returnBranch.innerHTML =
                    '<option value="">No branches available</option>';
                return;
            }

            result.branches.forEach(branch => {
                const option = document.createElement("option");

                option.value = branch.branch_id;
                option.textContent = branch.branch_name;

                returnBranch.appendChild(option);
            });

            returnBranch.disabled = false;

        } catch (error) {
            console.error(
                "Return branch loading error:",
                error
            );

            returnBranch.innerHTML =
                '<option value="">Unable to load branches</option>';

            alert(
                error.message ||
                "Failed to load branches."
            );
        }
    }

    async function loadReturnProducts(branchId) {
        returnProduct.disabled = true;

        returnProduct.innerHTML =
            '<option value="">Loading products...</option>';

        returnQuantity.value = "";
        returnQuantity.removeAttribute("max");
        returnQuantity.title = "";

        if (!branchId) {
            returnProduct.innerHTML =
                '<option value="">Select product</option>';
            return;
        }

        try {
            const response = await fetch(
                `/stock-movements/branch-transfer/products?source_branch_id=${encodeURIComponent(branchId)}`
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message ||
                    "Failed to load products."
                );
            }

            returnProduct.innerHTML =
                '<option value="">Select product</option>';

            if (
                !Array.isArray(result.products) ||
                result.products.length === 0
            ) {
                returnProduct.innerHTML =
                    '<option value="">No products available</option>';
                return;
            }

            result.products.forEach(product => {
                const option = document.createElement("option");

                option.value = product.product_id;

                const available =
                    Number(product.quantity_available || 0);

                option.textContent =
                    `${product.product_name} — Available: ${available.toFixed(3)}`;

                option.dataset.available = available;

                returnProduct.appendChild(option);
            });

            returnProduct.disabled = false;

        } catch (error) {
            console.error(
                "Return product loading error:",
                error
            );

            returnProduct.innerHTML =
                '<option value="">Unable to load products</option>';

            alert(
                error.message ||
                "Failed to load products."
            );
        }
    }

    function updateReturnQuantityLimit() {
        const selectedOption =
            returnProduct.options[
                returnProduct.selectedIndex
            ];

        if (
            !selectedOption ||
            !selectedOption.value
        ) {
            returnQuantity.removeAttribute("max");
            returnQuantity.title = "";
            return;
        }

        const available =
            Number(
                selectedOption.dataset.available || 0
            );

        returnQuantity.max = available;

        returnQuantity.title =
            `Available stock: ${available.toFixed(3)}`;
    }

    returnBranch.addEventListener("change", async () => {
        returnProduct.innerHTML =
            '<option value="">Select product</option>';

        returnProduct.disabled = true;

        returnQuantity.value = "";
        returnQuantity.removeAttribute("max");
        returnQuantity.title = "";

        await loadReturnProducts(
            returnBranch.value
        );
    });

    returnProduct.addEventListener("change", () => {
        returnQuantity.value = "";
        updateReturnQuantityLimit();
    });

    stockReturnForm.addEventListener("submit", async event => {
        event.preventDefault();

        const branchId =
            Number(returnBranch.value);

        const productId =
            Number(returnProduct.value);

        const selectedReturnType =
            String(returnType.value || "")
                .trim()
                .toUpperCase();

        const quantity =
            Number(returnQuantity.value);

        const reason =
            returnReason.value.trim();

        if (
            !Number.isInteger(branchId) ||
            branchId <= 0
        ) {
            alert("Please select a branch.");
            returnBranch.focus();
            return;
        }

        if (
            !Number.isInteger(productId) ||
            productId <= 0
        ) {
            alert("Please select a product.");
            returnProduct.focus();
            return;
        }

        const allowedReturnTypes = [
            "CUSTOMER_RETURN",
            "SUPPLIER_RETURN"
        ];

        if (
            !allowedReturnTypes.includes(
                selectedReturnType
            )
        ) {
            alert("Please select a valid return type.");
            returnType.focus();
            return;
        }

        if (
            !Number.isFinite(quantity) ||
            quantity <= 0
        ) {
            alert(
                "Please enter a valid quantity greater than zero."
            );
            returnQuantity.focus();
            return;
        }

        const roundedQuantity =
            Math.round(quantity * 1000) / 1000;

        if (roundedQuantity <= 0) {
            alert("Quantity must be greater than zero.");
            returnQuantity.focus();
            return;
        }

        /*
         * Supplier Return cannot exceed available stock.
         *
         * Customer Return can add new stock, so this check
         * is only required for Supplier Return.
         */
        if (selectedReturnType === "SUPPLIER_RETURN") {
            const selectedOption =
                returnProduct.options[
                    returnProduct.selectedIndex
                ];

            const available =
                Number(
                    selectedOption?.dataset?.available || 0
                );

            if (roundedQuantity > available) {
                alert(
                    `Cannot return ${roundedQuantity.toFixed(3)} units. ` +
                    `Only ${available.toFixed(3)} units are available.`
                );

                returnQuantity.focus();
                return;
            }
        }

        const submitButton =
            stockReturnForm.querySelector(
                'button[type="submit"]'
            );

        if (!submitButton) {
            return;
        }

        const originalButtonHTML =
            submitButton.innerHTML;

        submitButton.disabled = true;

        submitButton.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        try {
            const response = await fetch(
                "/stock-movements/stock/return",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        branch_id: branchId,
                        product_id: productId,
                        return_type: selectedReturnType,
                        quantity: roundedQuantity,
                        reason: reason
                    })
                }
            );

            const result =
                await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message ||
                    "Stock return failed."
                );
            }

            alert(
                result.message ||
                "Stock return processed successfully."
            );

            stockReturnForm.reset();

            returnProduct.innerHTML =
                '<option value="">Select product</option>';

            returnProduct.disabled = true;

            returnQuantity.value = "";

            returnQuantity.removeAttribute("max");

            returnQuantity.title = "";

            if (branchId) {
                returnBranch.value = branchId;

                await loadReturnProducts(
                    branchId
                );
            }

        } catch (error) {
            console.error(
                "Stock Return error:",
                error
            );

            alert(
                error.message ||
                "Unable to process stock return."
            );

        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML =
                originalButtonHTML;
        }
    });

    loadReturnBranches();
});