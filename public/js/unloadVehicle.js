
document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    const API_BASE = "/stock-movements";


    const unloadState = {

        vehicles: [],
        branches: [],
        vehicleProducts: [],
        selectedProducts: [],       
        currentVehicle: null,
        currentBranch: null

    };

    function byId(id) {

        return document.getElementById(id);

    }


    function escapeHtml(value) {

        if (value === null || value === undefined) {

            return "";

        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }

    function number(value) {

        const parsed = Number(value);

        return Number.isFinite(parsed)
            ? parsed
            : 0;

    }


    function quantity(value) {

        return Math.round(
            number(value) * 1000
        ) / 1000;

    }


    function money(value) {

        return number(value).toLocaleString(
            "en-GH",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );

    }

    async function api(

        url,

        options = {}

    ) {

        const response = await fetch(

            `${API_BASE}${url}`,

            {
                credentials: "same-origin",

                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                },

                ...options
            }

        );


        let data = null;


        try {

            data = await response.json();

        } catch (error) {

            data = null;

        }


        if (!response.ok) {

            throw new Error(

                data?.message ||
                `Request failed (${response.status})`

            );
        }
        if (

            data &&
            data.success === false

        ) {

            throw new Error(

                data.message ||
                "Request failed."

            );
        }
        return data;
    }

    function showMessage(

        message,

        type = "info"

    ) {

        if (

            typeof window.showMessage === "function"

        ) {

            window.showMessage(
                message,
                type
            );

            return;

        }


        if (

            typeof window.showToast === "function"

        ) {

            window.showToast(
                message,
                type
            );

            return;

        }


        alert(message);

    }


    /*
    |--------------------------------------------------------------------------
    | MODAL HELPERS
    |--------------------------------------------------------------------------
    */

    function openModal(id) {

        const modal = byId(id);

        if (!modal) return;


        modal.classList.add("active");

        modal.classList.add("is-open");


        modal.setAttribute(
            "aria-hidden",
            "false"
        );

    }


    function closeModal(id) {

        const modal = byId(id);

        if (!modal) return;


        modal.classList.remove("active");

        modal.classList.remove("is-open");


        modal.setAttribute(
            "aria-hidden",
            "true"
        );

    }


    /*
    |--------------------------------------------------------------------------
    | SELECTED VEHICLE
    |--------------------------------------------------------------------------
    */

    function getSelectedVehicle() {

        const select =
            byId("unloadVehicle");

        if (!select) {

            return null;

        }


        const locationId =
            Number(select.value);


        if (!locationId) {

            return null;

        }


        return (

            unloadState.vehicles.find(

                vehicle =>
                    Number(vehicle.location_id) ===
                    locationId

            ) || null

        );

    }


    /*
    |--------------------------------------------------------------------------
    | SELECTED BRANCH
    |--------------------------------------------------------------------------
    */

    function getSelectedBranch() {

        const select =
            byId("unloadBranch");

        if (!select) {

            return null;

        }


        const branchId =
            Number(select.value);


        if (!branchId) {

            return null;

        }


        return (

            unloadState.branches.find(

                branch =>
                    Number(branch.branch_id) ===
                    branchId

            ) || null

        );

    }


    /*
    |--------------------------------------------------------------------------
    | LOAD VEHICLES
    |--------------------------------------------------------------------------
    */

    async function loadUnloadVehicles() {

        const select =
            byId("unloadVehicle");


        if (!select) {

            return;

        }


        try {

            const data = await api("/vehicles");


            unloadState.vehicles =
                Array.isArray(data?.vehicles)
                    ? data.vehicles
                    : Array.isArray(data?.data)
                        ? data.data
                        : [];


            renderUnloadVehicles();

        } catch (error) {

            console.error(
                "loadUnloadVehicles error:",
                error
            );


            unloadState.vehicles = [];

            renderUnloadVehicles();


            showMessage(
                error.message ||
                "Failed to load vehicles.",
                "error"
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | RENDER VEHICLES
    |--------------------------------------------------------------------------
    */

    function renderUnloadVehicles() {

        const select =
            byId("unloadVehicle");


        if (!select) {

            return;

        }


        const currentValue =
            select.value;


        select.innerHTML = `

            <option value="">
                Select vehicle
            </option>

        `;


        for (

            const vehicle
            of unloadState.vehicles

        ) {

            const active =
                vehicle.active !== undefined
                    ? Number(vehicle.active) === 1
                    : vehicle.is_active !== undefined
                        ? Number(vehicle.is_active) === 1
                        : true;


            if (!active) {

                continue;

            }


            const option =
                document.createElement("option");


            option.value =
                vehicle.location_id;


            option.textContent =
                vehicle.location_name;


            select.appendChild(option);

        }


        if (currentValue) {

            const exists =
                Array.from(
                    select.options
                ).some(

                    option =>
                        option.value ===
                        currentValue

                );


            if (exists) {

                select.value =
                    currentValue;

            }

        }

    }

/*
|--------------------------------------------------------------------------
| LOAD UNLOAD DESTINATION BRANCHES
|--------------------------------------------------------------------------
*/

async function loadUnloadBranches() {

    const select = byId("unloadBranch");

    if (!select) {
        return;
    }

    try {

        const data = await api("/unload-branches");

        unloadState.branches =
            Array.isArray(data?.branches)
                ? data.branches
                : [];

        renderUnloadBranches();

    } catch (error) {

        console.error(
            "loadUnloadBranches error:",
            error
        );

        unloadState.branches = [];

        renderUnloadBranches();

        showMessage(
            error.message ||
            "Failed to load destination branches.",
            "error"
        );
    }
}


/*
|--------------------------------------------------------------------------
| RENDER UNLOAD DESTINATION BRANCHES
|--------------------------------------------------------------------------
*/

function renderUnloadBranches() {

    const select = byId("unloadBranch");

    if (!select) {
        return;
    }

    const currentValue = select.value;

    select.innerHTML = `
        <option value="">
            Select destination branch
        </option>
    `;

    for (const branch of unloadState.branches) {

        const option =
            document.createElement("option");

        option.value =
            branch.branch_id;

        option.textContent =
            branch.location
                ? `${branch.branch_name} — ${branch.location}`
                : branch.branch_name;

        select.appendChild(option);
    }

    if (currentValue) {

        const exists =
            Array.from(select.options).some(
                option =>
                    option.value === currentValue
            );

        if (exists) {
            select.value = currentValue;
        }
    }
}


    /* LOAD PRODUCTS FROM VEHICLE */

    async function loadUnloadProducts() {

        const vehicle = getSelectedVehicle();

        unloadState.vehicleProducts = [];           

        unloadState.selectedProducts = [];


        renderUnloadSelectedProducts();


        if (!vehicle) {

            renderUnloadProductPicker();

            updateUnloadSummary();

            return;

        }


        try {

            const data = await api(

                    `/unload-products?vehicle_location_id=${encodeURIComponent(
                        vehicle.location_id
                    )}`

                );


            unloadState.vehicleProducts =  Array.isArray(data?.products)
                    ? data.products
                    : Array.isArray(data?.vehicleProducts)
                        ? data.vehicleProducts
                        : Array.isArray(data?.data)
                            ? data.data
                            : [];


            renderUnloadProductPicker();

            updateUnloadSummary();

        } catch (error) {

            console.error(
                "loadUnloadProducts error:",
                error
            );


            unloadState.vehicleProducts = [];


            renderUnloadProductPicker();

            updateUnloadSummary();


            showMessage(
                error.message ||
                "Failed to load vehicle stock.",
                "error"
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | PRODUCT NORMALIZATION
    |--------------------------------------------------------------------------
    |
    | The backend may use slightly different aliases.
    | We normalize them once so the rest of this file stays clean.
    |
    */

    function normalizeUnloadProduct(product) {

        return {

            vehicle_stock_id:
                Number(
                    product.vehicle_stock_id ??
                    product.vehicleStockId ??
                    product.id ??
                    0
                ),

            product_id:
                Number(
                    product.product_id ??
                    product.productId ??
                    0
                ),

            product_name:
                product.product_name ??
                product.name ??
                "Unnamed product",

            category:
                product.category ??
                "",

            brand:
                product.brand ??
                "",

            batch_number:
                product.batch_number ??
                product.batchNumber ??
                null,

            expiry_date:
                product.expiry_date ??
                product.expiryDate ??
                null,

            quantity_available:
                quantity(
                    product.quantity_available ??
                    product.available ??
                    product.quantity ??
                    0
                ),

            cost_price:
                number(
                    product.cost_price ??
                    product.cost ??
                    0
                ),

            selling_price:
                number(
                    product.selling_price ??
                    product.selling ??
                    0
                ),

            unit:
                product.unit ??
                ""

        };

    }


    /*
    |--------------------------------------------------------------------------
    | PRODUCT PICKER
    |--------------------------------------------------------------------------
    */

    function renderUnloadProductPicker() {

        const container =byId("unloadProductPickerList");


        if (!container) {

            return;

        }


        const searchInput = byId("unloadProductSearch");


        const search = (
                searchInput?.value ||
                ""
            )
                .trim()
                .toLowerCase();


        const products = unloadState.vehicleProducts

                .map(
                    normalizeUnloadProduct
                )

                .filter(

                    product => {

                        if (!search) {

                            return true;

                        }


                        const text = [

                            product.product_name,

                            product.category,

                            product.brand,

                            product.batch_number

                        ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();


                        return text.includes(search);

                    }

                );


        if (!products.length) {

            container.innerHTML = `

                <div class="empty-state">

                    <i class="fa-solid fa-box-open"></i>

                    <p>
                        No vehicle stock found.
                    </p>

                </div>

            `;

            return;

        }


        container.innerHTML = products

            .map(

                product => {

                    const selected =
                        unloadState.selectedProducts.some(

                            item =>
                                Number(
                                    item.vehicle_stock_id
                                ) ===
                                Number(
                                    product.vehicle_stock_id
                                )

                        );


                    return `

                        <div
                            class="product-picker-item"
                            data-unload-product-id="${product.vehicle_stock_id}"
                        >

                            <div class="product-picker-info">

                                <strong>
                                    ${escapeHtml(
                                        product.product_name
                                    )}
                                </strong>

                                <span>
                                    ${escapeHtml(
                                        product.category ||
                                        product.brand ||
                                        ""
                                    )}
                                </span>

                                ${
                                    product.batch_number
                                        ? `
                                            <small>
                                                Batch:
                                                ${escapeHtml(
                                                    product.batch_number
                                                )}
                                            </small>
                                        `
                                        : ""
                                }

                            </div>


                            <div class="product-picker-stock">

                                <span>
                                    Available:
                                </span>

                                <strong>
                                    ${quantity(
                                        product.quantity_available
                                    )}
                                </strong>

                            </div>


                            <button
                                type="button"
                                class="secondary-btn"
                                data-add-unload-product="${product.vehicle_stock_id}"
                                ${
                                    selected
                                        ? "disabled"
                                        : ""
                                }
                            >

                                ${
                                    selected
                                        ? "Added"
                                        : "Add"
                                }

                            </button>

                        </div>

                    `;

                }

            )

            .join("");

    }


    /*
    |--------------------------------------------------------------------------
    | OPEN PRODUCT PICKER
    |--------------------------------------------------------------------------
    */

    function openUnloadProductPicker() {

        const vehicle = getSelectedVehicle();


        if (!vehicle) {

            showMessage(
                "Please select a vehicle first.",
                "error"
            );

            return;

        }


        if (
            !unloadState.vehicleProducts.length
        ) {

            showMessage(
                "This vehicle has no available stock to unload.",
                "error"
            );

            return;

        }


        renderUnloadProductPicker();

        openModal(
            "unloadProductPickerModal"
        );

    }


    /*
    |--------------------------------------------------------------------------
    | ADD PRODUCT
    |--------------------------------------------------------------------------
    */

    function addUnloadProduct(
        vehicleStockId
    ) {

        const product = unloadState.vehicleProducts

                .map(
                    normalizeUnloadProduct
                )

                .find(

                    item =>
                        Number(
                            item.vehicle_stock_id
                        ) === Number(
                            vehicleStockId
                        )

                );


        if (!product) {

            showMessage(
                "Vehicle stock item was not found.",
                "error"
            );

            return;

        }


        const alreadySelected = unloadState.selectedProducts.some(

                item =>
                    Number(
                        item.vehicle_stock_id
                    ) ===
                    Number(
                        product.vehicle_stock_id
                    )

            );


        if (alreadySelected) {

            showMessage(
                "This product is already selected.",
                "error"
            );

            return;

        }


        unloadState.selectedProducts.push({

            ...product,

            quantity: 0

        });


        renderUnloadSelectedProducts();

        updateUnloadSummary();

        renderUnloadProductPicker();

    }


    /*
    |--------------------------------------------------------------------------
    | SELECTED PRODUCTS
    |--------------------------------------------------------------------------
    */

    function renderUnloadSelectedProducts() {

        const container = byId("unloadSelectedProducts");


        const empty = byId("unloadEmptyProducts");


        if (!container) {

            return;

        }


        if (
            !unloadState.selectedProducts.length
        ) {

            container.innerHTML = "";


            if (empty) {

                empty.style.display =
                    "block";

            }


            updateUnloadSummary();

            return;

        }


        if (empty) {

            empty.style.display =
                "none";

        }


        container.innerHTML = unloadState.selectedProducts

                .map(

                    (item, index) => `

                        <div
                            class="selected-product-row"
                            data-unload-selected-index="${index}"
                        >

                            <div class="selected-product-main">

                                <strong>
                                    ${escapeHtml(
                                        item.product_name
                                    )}
                                </strong>

                                <span>
                                    Available:
                                    ${quantity(
                                        item.quantity_available
                                    )}
                                </span>

                                ${
                                    item.batch_number
                                        ? `
                                            <small>
                                                Batch:
                                                ${escapeHtml(
                                                    item.batch_number
                                                )}
                                            </small>
                                        `
                                        : ""
                                }

                            </div>


                            <div class="selected-product-quantity">

                                <strong>
                                    ${quantity(
                                        item.quantity
                                    )}
                                </strong>

                                ${
                                    item.unit
                                        ? `
                                            <span>
                                                ${escapeHtml(
                                                    item.unit
                                                )}
                                            </span>
                                        `
                                        : ""
                                }

                            </div>


                            <div class="selected-product-actions">

                                <button
                                    type="button"
                                    class="secondary-btn"
                                    data-edit-unload-product="${index}"
                                >
                                    <i class="fa-solid fa-pen"></i>
                                    Edit
                                </button>


                                <button
                                    type="button"
                                    class="danger-btn"
                                    data-delete-unload-product="${index}"
                                >
                                    <i class="fa-solid fa-trash"></i>
                                    Delete
                                </button>

                            </div>

                        </div>

                    `

                )

                .join("");


        updateUnloadSummary();

    }


    /*
    |--------------------------------------------------------------------------
    | OPEN SELECTED PRODUCTS MANAGER
    |--------------------------------------------------------------------------
    */

    function openUnloadSelectedProductsManager() {

        if (
            !unloadState.selectedProducts.length
        ) {

            showMessage(
                "There are no selected products.",
                "error"
            );

            return;

        }


        renderUnloadSelectedProductsManager();


        openModal(
            "unloadSelectedProductsModal"
        );

    }


    /*
    |--------------------------------------------------------------------------
    | RENDER SELECTED PRODUCT MANAGER
    |--------------------------------------------------------------------------
    */

    function renderUnloadSelectedProductsManager() {

        const container = byId("unloadSelectedProductsManager");


        if (!container) {

            return;

        }


        if (
            !unloadState.selectedProducts.length
        ) {

            container.innerHTML = `

                <div class="empty-state">

                    <p>
                        No products selected.
                    </p>

                </div>

            `;

            return;

        }


        container.innerHTML = unloadState.selectedProducts

                .map(

                    (item, index) => `

                        <div
                            class="selected-product-manager-row"
                        >

                            <div>

                                <strong>
                                    ${escapeHtml(
                                        item.product_name
                                    )}
                                </strong>

                                <small>
                                    Available:
                                    ${quantity(
                                        item.quantity_available
                                    )}
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${quantity(
                                        item.quantity
                                    )}
                                </strong>

                            </div>


                            <div>

                                <button
                                    type="button"
                                    class="secondary-btn"
                                    data-manager-edit-unload="${index}"
                                >
                                    Edit
                                </button>


                                <button
                                    type="button"
                                    class="danger-btn"
                                    data-manager-delete-unload="${index}"
                                >
                                    Delete
                                </button>

                            </div>

                        </div>

                    `

                )

                .join("");

    }

/*
|--------------------------------------------------------------------------
| EDIT QUANTITY MODAL
|--------------------------------------------------------------------------
*/

let unloadEditingProductIndex = null;


/*
|--------------------------------------------------------------------------
| OPEN QUANTITY MODAL
|--------------------------------------------------------------------------
*/

function openUnloadQuantityModal(index) {

    const item =
        unloadState.selectedProducts[index];


    if (!item) {

        return;

    }


    unloadEditingProductIndex =
        index;


    const productName =
        byId("unloadQuantityProductName");


    const available =
        byId("unloadQuantityAvailable");


    const input =
        byId("unloadQuantityInput");


    const unit =
        byId("unloadQuantityUnit");


    if (productName) {

        productName.textContent =
            item.product_name ||
            "Unnamed product";

    }


    if (available) {

        available.textContent =
            quantity(
                item.quantity_available
            );

    }


    if (unit) {

        unit.textContent =
            item.unit ||
            "units";

    }


    if (input) {

        input.value =
            item.quantity > 0
                ? quantity(item.quantity)
                : "";

        input.max =
            quantity(
                item.quantity_available
            );

    }


    openModal(
        "unloadQuantityModal"
    );


    /*
    |--------------------------------------------------------------------------
    | Focus quantity input
    |--------------------------------------------------------------------------
    */

    setTimeout(() => {

        if (input) {

            input.focus();

            input.select();

        }

    }, 100);

}


/*
|--------------------------------------------------------------------------
| CLOSE QUANTITY MODAL
|--------------------------------------------------------------------------
*/

function closeUnloadQuantityModal() {

    unloadEditingProductIndex =
        null;


    closeModal(
        "unloadQuantityModal"
    );

}


/*
|--------------------------------------------------------------------------
| SAVE QUANTITY
|--------------------------------------------------------------------------
*/

function saveUnloadQuantity() {

    if (
        unloadEditingProductIndex === null
    ) {

        return;

    }


    const item =
        unloadState.selectedProducts[
            unloadEditingProductIndex
        ];


    if (!item) {

        closeUnloadQuantityModal();

        return;

    }


    const input =
        byId("unloadQuantityInput");


    const entered =
        input?.value;


    const newQuantity =
        quantity(entered);


    const available =
        quantity(
            item.quantity_available
        );


    if (
        newQuantity <= 0
    ) {

        showMessage(
            "Quantity must be greater than zero.",
            "error"
        );

        input?.focus();

        return;

    }


    if (
        newQuantity > available
    ) {

        showMessage(

            `Quantity cannot exceed the available vehicle stock of ${available}.`,

            "error"

        );

        input?.focus();

        return;

    }

    item.quantity = newQuantity;

    renderUnloadSelectedProducts();

    renderUnloadSelectedProductsManager();

    renderUnloadProductPicker();

    updateUnloadSummary();

    closeUnloadQuantityModal();

}

    function deleteUnloadProduct(index) {

        const item = unloadState.selectedProducts[index];


        if (!item) {

            return;

        }


        unloadState.selectedProducts.splice(
            index,
            1
        );


        renderUnloadSelectedProducts();

        renderUnloadSelectedProductsManager();

        renderUnloadProductPicker();

        updateUnloadSummary();

    }


    function calculateUnloadTotals() {

        let totalQuantity = 0;

        let totalCost = 0;

        let totalRevenue = 0;


        for (

            const item
            of unloadState.selectedProducts

        ) {

            const qty = quantity(item.quantity);


            totalQuantity +=
                qty;


            totalCost +=
                qty *
                number(item.cost_price);


            totalRevenue +=
                qty *
                number(item.selling_price);

        }


        totalQuantity = quantity(totalQuantity);


        totalCost = Math.round(
                totalCost * 100
            ) / 100;


        totalRevenue = Math.round(
                totalRevenue * 100
            ) / 100;


        const totalProfit = Math.round(
                (
                    totalRevenue -
                    totalCost
                ) * 100
            ) / 100;


        return {

            productCount:
                unloadState.selectedProducts.length,

            totalQuantity,

            totalCost,

            totalRevenue,

            totalProfit

        };

    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE SUMMARY
    |--------------------------------------------------------------------------
    */

    function updateUnloadSummary() {

        const summary = byId("unloadSummary");


        if (!summary) {

            return;

        }


        const vehicle = getSelectedVehicle();

        const branch = getSelectedBranch();

        const totals = calculateUnloadTotals();

        const vehicleElement = byId("unloadSummaryVehicle");

        const branchElement = byId("unloadSummaryBranch");

        const productsElement = byId("unloadSummaryProducts");

        const quantityElement = byId("unloadSummaryQuantity");

        const costElement = byId("unloadSummaryCost");

        const revenueElement = byId("unloadSummaryRevenue");
        const profitElement = byId("unloadSummaryProfit");


        if (vehicleElement) {

            vehicleElement.textContent =
                vehicle
                    ? vehicle.location_name
                    : "Not selected";

        }


        if (branchElement) {

            branchElement.textContent =
                branch
                    ? branch.branch_name
                    : "Not selected";

        }


        if (productsElement) {

            productsElement.textContent =
                totals.productCount;

        }


        if (quantityElement) {

            quantityElement.textContent =
                quantity(
                    totals.totalQuantity
                );

        }


        if (costElement) {

            costElement.textContent =
                `GH₵ ${money(
                    totals.totalCost
                )}`;

        }


        if (revenueElement) {

            revenueElement.textContent =
                `GH₵ ${money(
                    totals.totalRevenue
                )}`;

        }


        if (profitElement) {

            profitElement.textContent =
                `GH₵ ${money(
                    totals.totalProfit
                )}`;

        }


        if (

            vehicle &&
            branch &&
            totals.productCount > 0

        ) {

            summary.style.display =
                "";

        } else {

            summary.style.display =
                "none";

        }

    }


    /*
    |--------------------------------------------------------------------------
    | VALIDATE UNLOAD
    |--------------------------------------------------------------------------
    */

    function validateUnloadForm() {

        const vehicle = getSelectedVehicle();
        const branch = getSelectedBranch();

        if (!vehicle) {

            showMessage(
                "Please select a vehicle.",
                "error"
            );

            return false;

        }


        if (!branch) {

            showMessage(
                "Please select a destination branch.",
                "error"
            );

            return false;

        }


        if (
            !unloadState.selectedProducts.length
        ) {

            showMessage(
                "Please select at least one product to unload.",
                "error"
            );

            return false;

        }


        for (

            const item
            of unloadState.selectedProducts

        ) {

            const requested =
                quantity(item.quantity);


            const available =
                quantity(
                    item.quantity_available
                );


            if (
                !requested ||
                requested <= 0
            ) {

                showMessage(

                    `Enter a valid quantity for ${item.product_name}.`,

                    "error"

                );

                return false;

            }


            if (
                requested >
                available
            ) {

                showMessage(

                    `${item.product_name}: quantity cannot exceed available vehicle stock of ${available}.`,

                    "error"

                );

                return false;

            }


            if (
                !Number(item.vehicle_stock_id)
            ) {

                showMessage(
                    "A selected vehicle stock record is invalid.",
                    "error"
                );

                return false;

            }


            if (
                !Number(item.product_id)
            ) {

                showMessage(
                    "A selected product is invalid.",
                    "error"
                );

                return false;

            }

        }


        return true;

    }


    /*
    |--------------------------------------------------------------------------
    | CONFIRMATION SUMMARY
    |--------------------------------------------------------------------------
    */

    function populateUnloadConfirmation() {

        const vehicle =
            getSelectedVehicle();


        const branch =
            getSelectedBranch();


        const totals =
            calculateUnloadTotals();


        const vehicleElement =
            byId("unloadConfirmVehicle");


        const branchElement =
            byId("unloadConfirmBranch");


        const productsElement =
            byId("unloadConfirmProducts");


        const quantityElement =
            byId("unloadConfirmQuantity");


        const costElement =
            byId("unloadConfirmCost");


        const revenueElement =
            byId("unloadConfirmRevenue");


        const profitElement =
            byId("unloadConfirmProfit");


        if (vehicleElement) {

            vehicleElement.textContent =
                vehicle?.location_name ||
                "Not selected";

        }


        if (branchElement) {

            branchElement.textContent =
                branch?.branch_name ||
                "Not selected";

        }


        if (productsElement) {

            productsElement.textContent =
                totals.productCount;

        }


        if (quantityElement) {

            quantityElement.textContent =
                quantity(
                    totals.totalQuantity
                );

        }


        if (costElement) {

            costElement.textContent =
                `GH₵ ${money(
                    totals.totalCost
                )}`;

        }


        if (revenueElement) {

            revenueElement.textContent =
                `GH₵ ${money(
                    totals.totalRevenue
                )}`;

        }


        if (profitElement) {

            profitElement.textContent =
                `GH₵ ${money(
                    totals.totalProfit
                )}`;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | OPEN CONFIRMATION
    |--------------------------------------------------------------------------
    */

    function openUnloadConfirmation() {

        if (
            !validateUnloadForm()
        ) {

            return;

        }


        populateUnloadConfirmation();


        openModal(
            "unloadConfirmationModal"
        );

    }


    /*
    |--------------------------------------------------------------------------
    | EXECUTE UNLOAD
    |--------------------------------------------------------------------------
    */

    async function executeVehicleUnload() {

        if (
            !validateUnloadForm()
        ) {

            return;

        }


        const vehicle = getSelectedVehicle();


        const branch = getSelectedBranch();


        const notes =byId("unloadNotes")?.value
                ?.trim() || "";


        const submitButton = byId("submitUnloadVehicle");


        if (submitButton) {

            submitButton.disabled =
                true;


            submitButton.dataset.originalText = submitButton.innerHTML;


            submitButton.innerHTML = `

                <i class="fa-solid fa-spinner fa-spin"></i>
                Processing...

            `;

        }


        try {

            const payload = {

                vehicle_location_id:
                    Number(
                        vehicle.location_id
                    ),

                destination_branch_id:
                    Number(
                        branch.branch_id
                    ),

                products:
                    unloadState.selectedProducts.map(

                        item => ({

                            vehicle_stock_id:
                                Number(
                                    item.vehicle_stock_id
                                ),

                            product_id:
                                Number(
                                    item.product_id
                                ),

                            quantity:
                                quantity(
                                    item.quantity
                                )

                        })

                    ),

                notes

            };


            const data = await api(

                    "/unload-vehicle",

                    {

                        method: "POST",

                        body:
                            JSON.stringify(
                                payload
                            )

                    }

                );


            closeModal(
                "unloadConfirmationModal"
            );


            showMessage(

                data?.message ||
                "Vehicle stock unloaded successfully.",

                "success"

            );


            unloadState.selectedProducts = [];


            unloadState.vehicleProducts = [];


            renderUnloadSelectedProducts();


            await loadUnloadProducts();


            updateUnloadSummary();


        } catch (error) {

            console.error(
                "executeVehicleUnload error:",
                error
            );


            showMessage(

                error.message ||
                "Failed to unload vehicle.",

                "error"

            );

        } finally {

            if (submitButton) {

                submitButton.disabled =
                    false;


                submitButton.innerHTML =
                    submitButton.dataset.originalText ||
                    `

                        <i class="fa-solid fa-arrow-down"></i>
                        Confirm Unload

                    `;

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | CLEAR FORM
    |--------------------------------------------------------------------------
    */

    function clearVehicleUnload() {

        const vehicle = byId("unloadVehicle");


        const branch = byId("unloadBranch");


        const notes = byId("unloadNotes");


        if (vehicle) {

            vehicle.value = "";

        }


        if (branch) {

            branch.value = "";

        }


        if (notes) {

            notes.value = "";

        }


        unloadState.vehicleProducts = [];

        unloadState.selectedProducts = [];

        unloadState.currentVehicle = null;

        unloadState.currentBranch = null;


        renderUnloadProductPicker();

        renderUnloadSelectedProducts();

        updateUnloadSummary();

    }


    /*
    |--------------------------------------------------------------------------
    | PRODUCT PICKER SEARCH
    |--------------------------------------------------------------------------
    */

    let unloadProductSearchTimer = null;


    function handleUnloadProductSearch() {

        clearTimeout(
            unloadProductSearchTimer
        );


        unloadProductSearchTimer = setTimeout(

                () => {

                    renderUnloadProductPicker();

                },

                150

            );

    }


    /*
    |--------------------------------------------------------------------------
    | EVENT: VEHICLE CHANGE
    |--------------------------------------------------------------------------
    */

    byId(
        "unloadVehicle"
    )?.addEventListener(

        "change",

        async () => {

            unloadState.currentVehicle =
                getSelectedVehicle();


            unloadState.selectedProducts = [];


            renderUnloadSelectedProducts();


            await loadUnloadProducts();


            updateUnloadSummary();

        }

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: BRANCH CHANGE
    |--------------------------------------------------------------------------
    */

    byId(
        "unloadBranch"
    )?.addEventListener(

        "change",

        () => {

            unloadState.currentBranch =
                getSelectedBranch();


            updateUnloadSummary();

        }

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: OPEN PRODUCT PICKER
    |--------------------------------------------------------------------------
    */

    byId(
        "openUnloadProductPicker"
    )?.addEventListener(

        "click",

        openUnloadProductPicker

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: PRODUCT SEARCH
    |--------------------------------------------------------------------------
    */

    byId(
        "unloadProductSearch"
    )?.addEventListener(

        "input",

        handleUnloadProductSearch

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: CLOSE PRODUCT PICKER
    |--------------------------------------------------------------------------
    */

    byId(
        "closeUnloadProductPicker"
    )?.addEventListener(

        "click",

        () => {

            closeModal(
                "unloadProductPickerModal"
            );

        }

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: CLOSE SELECTED PRODUCTS
    |--------------------------------------------------------------------------
    */

    byId(
        "closeUnloadSelectedProducts"
    )?.addEventListener(

        "click",

        () => {

            closeModal(
                "unloadSelectedProductsModal"
            );

        }

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: PRODUCT PICKER BUTTONS
    |--------------------------------------------------------------------------
    */

    byId(
        "unloadProductPickerList"
    )?.addEventListener(

        "click",

        event => {

            const button = event.target.closest(

                    "[data-add-unload-product]"

                );


            if (!button) {

                return;

            }


            addUnloadProduct(

                Number(
                    button.dataset
                        .addUnloadProduct
                )

            );

        }

    );


/* ============================================================
   UNLOAD — SELECTED PRODUCT ACTIONS
   ============================================================ */

const unloadSelectedProductsContainer = byId("unloadSelectedProducts");

if (unloadSelectedProductsContainer) {

    unloadSelectedProductsContainer.addEventListener(
        "click",
        function (event) {

            const editButton = event.target.closest(
                    "[data-edit-unload-product]"
                );

            if (editButton) {

                event.preventDefault();
                event.stopPropagation();

                const index = Number(
                    editButton.getAttribute(
                        "data-edit-unload-product"
                    )
                );

                console.log(
                    "UNLOAD EDIT CLICKED:",
                    index
                );

                if (
                    !Number.isInteger(index) ||
                    !unloadState.selectedProducts[index]
                ) {

                    console.error(
                        "Invalid unload product index:",
                        index,
                        unloadState.selectedProducts
                    );

                    return;
                }

                openUnloadQuantityModal(index);

                return;
            }

            const deleteButton = event.target.closest(
                    "[data-delete-unload-product]"
                );

            if (deleteButton) {

                event.preventDefault();
                event.stopPropagation();

                const index = Number(
                    deleteButton.getAttribute(
                        "data-delete-unload-product"
                    )
                );
                deleteUnloadProduct(index);
            }
        }
    );
}

/* ============================================================
   UNLOAD — QUANTITY MODAL EVENTS
   ============================================================ */

        byId("saveUnloadQuantity")?.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                saveUnloadQuantity();
            }
        );

        byId("closeUnloadQuantityModal")?.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                closeUnloadQuantityModal();
            }
        );


        byId("cancelUnloadQuantity")?.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                closeUnloadQuantityModal();
            }
        );



    byId(
        "unloadSelectedProductsManager"
    )?.addEventListener(

        "click",

        event => {

            const editButton = event.target.closest(

                    "[data-manager-edit-unload]"

                );


            if (editButton) {

                openUnloadQuantityModal(
                    Number(
                        editButton.dataset
                            .managerEditUnload
                    )
                );

                return;

            }


            const deleteButton = event.target.closest(
                    "[data-manager-delete-unload]"
                );


            if (deleteButton) {

                deleteUnloadProduct(

                    Number(
                        deleteButton.dataset
                            .managerDeleteUnload
                    )

                );

            }

        }

    );


    byId(
        "openUnloadSelectedProducts"
    )?.addEventListener(

        "click",

        openUnloadSelectedProductsManager

    );


    byId(
        "editUnloadSelectedProducts"
    )?.addEventListener(

        "click",

        openUnloadSelectedProductsManager

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: CLEAR
    |--------------------------------------------------------------------------
    */

    byId(
        "clearUnloadVehicle"
    )?.addEventListener(

        "click",

        clearVehicleUnload

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: SUBMIT
    |--------------------------------------------------------------------------
    */

    byId(
        "submitUnloadVehicle"
    )?.addEventListener(

        "click",

        event => {

            event.preventDefault();

            openUnloadConfirmation();

        }

    );


    /*
    |--------------------------------------------------------------------------
    | EVENT: CONFIRM UNLOAD
    |--------------------------------------------------------------------------
    */

        byId(
            "confirmUnloadVehicleBtn"
        )?.addEventListener(

            "click",

            event => {

                event.preventDefault();

                executeVehicleUnload();

            }

        );


    /*
    |--------------------------------------------------------------------------
    | EVENT: CANCEL CONFIRMATION
    |--------------------------------------------------------------------------
    */

    byId(
        "cancelUnloadConfirmation"
    )?.addEventListener(
        "click",
        () => {
            closeModal(
                "unloadConfirmationModal"
            );
        }
    );
    byId("closeUnloadConfirmation")?.addEventListener(
            "click",
            () => {
                closeModal("unloadConfirmationModal");
            }
        );


    /*
    |--------------------------------------------------------------------------
    | FORM SUBMIT
    |--------------------------------------------------------------------------
    */

    byId(
        "unloadVehicleForm"
    )?.addEventListener(

        "submit",

        event => {

            event.preventDefault();

            openUnloadConfirmation();

        }

    );


    /*
    |--------------------------------------------------------------------------
    | CLOSE MODALS WHEN CLICKING OUTSIDE
    |--------------------------------------------------------------------------
    */

    document.addEventListener(

        "click",

        event => {

            const modal = event.target.closest(
                    ".movement-modal"
                );


            if (
                !modal
            ) {

                return;

            }


            if (
                event.target !==
                modal
            ) {

                return;

            }


            modal.classList.remove(
                "active"
            );


            modal.classList.remove(
                "is-open"
            );

        }

    );


    /*
    |--------------------------------------------------------------------------
    | INITIALIZE UNLOAD
    |--------------------------------------------------------------------------
    */

    async function initializeUnload() {

        const unloadForm = byId("unloadVehicleForm");


        if (!unloadForm) {

            return;

        }


        updateUnloadSummary();


        await Promise.all([

            loadUnloadVehicles(),

            loadUnloadBranches()

        ]);


        renderUnloadProductPicker();

        renderUnloadSelectedProducts();

        updateUnloadSummary();

    }

    initializeUnload();

});
