/*
|--------------------------------------------------------------------------
| MARKETFLOW - LOAD VEHICLE JAVASCRIPT
|--------------------------------------------------------------------------
|
| This file currently handles ONLY:
|
|   - Vehicle management
|   - Source branches
|   - Product picker
|   - Batch selection
|   - Quantity editing
|   - Executive summary
|   - Confirmation
|   - Vehicle loading
|   - Vehicle stock
|   - Load history
|
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", () => {

    "use strict";


    /*
    |--------------------------------------------------------------------------
    | API
    |--------------------------------------------------------------------------
    */

    const API_BASE = "/stock-movements";


    async function api(url, options = {}) {

        const config = {
            ...options,
            headers: {
                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(options.headers || {})
            }
        };

        const response =
            await fetch(url, config);

        let data = {};

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok || data.success === false) {

            throw new Error(
                data.message ||
                `Request failed with status ${response.status}`
            );
        }

        return data;
    }


    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    const state = {

        vehicles: [],

        branches: [],

        pickerProducts: [],

        selectedProducts: [],

        editingIndex: null,

        history: [],

        currentVehicleStockId: null
    };


    /*
    |--------------------------------------------------------------------------
    | DOM HELPERS
    |--------------------------------------------------------------------------
    */

    const $ = (selector) =>
        document.querySelector(selector);


    const byId = (id) =>
        document.getElementById(id);


    function showMessage(message, type = "success") {

        const element =
            byId("movementMessage");

        if (!element) {
            alert(message);
            return;
        }

        element.textContent = message;

        element.className =
            `movement-message ${type}`;

        element.classList.add("show");

        clearTimeout(
            showMessage.timer
        );

        showMessage.timer =
            setTimeout(() => {

                element.classList.remove("show");

            }, 4500);
    }


    function escapeHtml(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function number(value) {

        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : 0;
    }


    function quantity(value) {

        return number(value)
            .toFixed(3);
    }


    function money(value) {

        return number(value)
            .toFixed(2);
    }


    function openModal(id) {

        const modal = byId(id);

        if (!modal) {
            return;
        }

        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        modal.classList.add("active");

        document.body.classList.add(
            "modal-open"
        );
    }


    function closeModal(id) {

        const modal = byId(id);

        if (!modal) {
            return;
        }

        modal.setAttribute(
            "aria-hidden",
            "true"
        );

        modal.classList.remove("active");

        if (
            !document.querySelector(
                ".movement-modal.active"
            )
        ) {
            document.body.classList.remove(
                "modal-open"
            );
        }
    }


    function closeAllModals() {

        document
            .querySelectorAll(".movement-modal.active")
            .forEach(modal => {

                modal.classList.remove("active");

                modal.setAttribute(
                    "aria-hidden",
                    "true"
                );
            });

        document.body.classList.remove(
            "modal-open"
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SELECTED PRODUCT KEY
    |--------------------------------------------------------------------------
    */

    function selectedKey(product) {

        if (product.stock_id) {
            return `stock:${product.stock_id}`;
        }

        return `product:${product.product_id}`;
    }


    function findSelectedIndex(product) {

        const key =
            selectedKey(product);

        return state.selectedProducts.findIndex(
            item =>
                selectedKey(item) === key
        );
    }


    /*
    |--------------------------------------------------------------------------
    | CALCULATIONS
    |--------------------------------------------------------------------------
    */

    function calculateTotals() {

        let totalQuantity = 0;
        let totalCost = 0;
        let totalSales = 0;

        state.selectedProducts.forEach(item => {

            const qty =
                number(item.quantity);

            const cost =
                number(item.cost_price);

            const selling =
                number(item.selling_price);

            totalQuantity += qty;

            totalCost +=
                qty * cost;

            totalSales +=
                qty * selling;
        });

        return {

            products:
                state.selectedProducts.length,

            quantity:
                totalQuantity,

            cost:
                totalCost,

            sales:
                totalSales,

            profit:
                totalSales - totalCost
        };
    }


    /*
    |--------------------------------------------------------------------------
    | SOURCE BRANCH
    |--------------------------------------------------------------------------
    */

    async function loadBranches() {

        try {

            const data =
                await api(
                    `${API_BASE}/load-branches`
                );

            state.branches =
                data.branches || [];

            renderBranches();

        } catch (error) {

            console.error(error);

            showMessage(
                error.message ||
                "Unable to load branches.",
                "error"
            );
        }
    }


    function renderBranches() {

        const select =
            byId("loadSourceBranch");

        if (!select) {
            return;
        }

        const current =
            select.value;

        select.innerHTML = `
            <option value="">
                Select source branch
            </option>
        `;

        state.branches.forEach(branch => {

            const option =
                document.createElement("option");

            option.value =
                branch.branch_id;

            option.textContent =
                branch.branch_name;

            select.appendChild(option);
        });

        if (current) {
            select.value = current;
        }

        updateLoadAction();
    }


    function getSelectedBranch() {

        const select =
            byId("loadSourceBranch");

        if (!select?.value) {
            return null;
        }

        return state.branches.find(
            branch =>
                String(branch.branch_id) ===
                String(select.value)
        ) || null;
    }


    /*
    |--------------------------------------------------------------------------
    | VEHICLES
    |--------------------------------------------------------------------------
    */

    async function loadVehicles() {

        try {

            const data =
                await api(
                    `${API_BASE}/vehicles`
                );

            state.vehicles =
                data.vehicles || [];

            renderVehicleSelect();

            renderVehicleManagement();

            renderHistoryVehicleFilter();

            updateLoadAction();

        } catch (error) {

            console.error(error);

            showMessage(
                error.message ||
                "Unable to load vehicles.",
                "error"
            );
        }
    }


    function renderVehicleSelect() {

        const select =
            byId("loadVehicle");

        if (!select) {
            return;
        }

        const current =
            select.value;

        select.innerHTML = `
            <option value="">
                Select vehicle
            </option>
        `;

        state.vehicles.forEach(vehicle => {

            const option =
                document.createElement("option");

            option.value =
                vehicle.location_id;

            option.textContent =
                vehicle.location_name;

            option.dataset.vehicleName =
                vehicle.location_name;

            option.dataset.status =
                vehicle.active ? "1" : "0";

            option.disabled =
                !Boolean(vehicle.active);

            select.appendChild(option);
        });

        if (
            current &&
            state.vehicles.some(
                vehicle =>
                    String(vehicle.location_id) ===
                    String(current) &&
                    Boolean(vehicle.active)
            )
        ) {
            select.value = current;
        }
    }


    function getSelectedVehicle() {

        const select =
            byId("loadVehicle");

        if (!select?.value) {
            return null;
        }

        return state.vehicles.find(
            vehicle =>
                String(vehicle.location_id) ===
                String(select.value)
        ) || null;
    }


    /*
    |--------------------------------------------------------------------------
    | REGISTER VEHICLE
    |--------------------------------------------------------------------------
    */

    function openRegisterVehicleModal() {

        const form =
            byId("registerVehicleForm");

        if (form) {
            form.reset();
        }

        openModal(
            "registerVehicleModal"
        );
    }


    async function registerVehicle(event) {

        event.preventDefault();

        const name =
            byId("vehicleName")?.value.trim();

        const description =
            byId("vehicleDescription")?.value.trim();

        if (!name) {

            showMessage(
                "Vehicle name is required.",
                "error"
            );

            return;
        }

        try {

            const data =
                await api(
                    `${API_BASE}/vehicles`,
                    {
                        method: "POST",

                        body: JSON.stringify({
                            location_name: name,
                            description
                        })
                    }
                );

            closeModal(
                "registerVehicleModal"
            );

            await loadVehicles();

            const select =
                byId("loadVehicle");

            if (select && data.vehicle) {

                select.value =
                    data.vehicle.location_id;
            }

            updateLoadAction();

            showMessage(
                data.message ||
                "Vehicle registered successfully."
            );

        } catch (error) {

            console.error(error);

            showMessage(
                error.message ||
                "Unable to register vehicle.",
                "error"
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | VEHICLE MANAGEMENT
    |--------------------------------------------------------------------------
    */

    function renderVehicleManagement() {

        const tbody =
            byId(
                "vehicleManagementTableBody"
            );

        if (!tbody) {
            return;
        }

        const search =
            (
                byId("vehicleSearchInput")?.value ||
                ""
            )
                .trim()
                .toLowerCase();

        const vehicles =
            state.vehicles.filter(vehicle => {

                if (!search) {
                    return true;
                }

                return [
                    vehicle.location_name,
                    vehicle.description
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(search);
            });

        if (!vehicles.length) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        No vehicles found.
                    </td>
                </tr>
            `;

            return;
        }

        tbody.innerHTML =
            vehicles.map(vehicle => {

                const active =
                    Boolean(vehicle.active);

                const stock =
                    number(
                        vehicle.current_stock_quantity
                    );

                return `
                    <tr>
                        <td>
                            <strong>
                                ${escapeHtml(
                                    vehicle.location_name
                                )}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(
                                vehicle.description || "—"
                            )}
                        </td>

                        <td>
                            <span class="status-badge ${
                                active
                                    ? "active"
                                    : "inactive"
                            }">
                                ${
                                    active
                                        ? "Active"
                                        : "Inactive"
                                }
                            </span>
                        </td>

                        <td>
                            ${quantity(stock)}
                        </td>

                        <td>
                            <div class="table-actions">

                                <button
                                    type="button"
                                    class="secondary-action-btn"
                                    data-vehicle-stock="${vehicle.location_id}"
                                >
                                    <i class="fas fa-boxes"></i>
                                    Stock
                                </button>

                                <button
                                    type="button"
                                    class="secondary-action-btn"
                                    data-edit-vehicle="${vehicle.location_id}"
                                >
                                    <i class="fas fa-edit"></i>
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    class="secondary-action-btn"
                                    data-toggle-vehicle="${vehicle.location_id}"
                                    data-active="${active ? "1" : "0"}"
                                >
                                    <i class="fas fa-power-off"></i>
                                    ${
                                        active
                                            ? "Deactivate"
                                            : "Activate"
                                    }
                                </button>

                            </div>
                        </td>
                    </tr>
                `;

            }).join("");
    }


    async function editVehicle(vehicleId) {

        const vehicle =
            state.vehicles.find(
                item =>
                    String(item.location_id) ===
                    String(vehicleId)
            );

        if (!vehicle) {
            return;
        }

        const name =
            prompt(
                "Vehicle name:",
                vehicle.location_name
            );

        if (name === null) {
            return;
        }

        const cleanName =
            name.trim();

        if (!cleanName) {

            showMessage(
                "Vehicle name is required.",
                "error"
            );

            return;
        }

        const description =
            prompt(
                "Vehicle description:",
                vehicle.description || ""
            );

        if (description === null) {
            return;
        }

        try {

            const data =
                await api(
                    `${API_BASE}/vehicles/${vehicleId}`,
                    {
                        method: "PUT",

                        body: JSON.stringify({
                            location_name:
                                cleanName,

                            description:
                                description.trim()
                        })
                    }
                );

            await loadVehicles();

            showMessage(
                data.message ||
                "Vehicle updated successfully."
            );

        } catch (error) {

            console.error(error);

            showMessage(
                error.message ||
                "Unable to update vehicle.",
                "error"
            );
        }
    }


    async function toggleVehicle(
        vehicleId,
        currentlyActive
    ) {

        const action =
            currentlyActive
                ? "deactivate"
                : "activate";

        const confirmed =
            window.confirm(
                `Are you sure you want to ${action} this vehicle?`
            );

        if (!confirmed) {
            return;
        }

        try {

            const data =
                await api(
                    `${API_BASE}/vehicles/${vehicleId}/status`,
                    {
                        method: "PATCH",

                        body: JSON.stringify({
                            active:
                                !currentlyActive
                        })
                    }
                );

            await loadVehicles();

            showMessage(
                data.message ||
                "Vehicle status updated."
            );

        } catch (error) {

            console.error(error);

            showMessage(
                error.message ||
                "Unable to update vehicle status.",
                "error"
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | PRODUCT PICKER
    |--------------------------------------------------------------------------
    */

    async function openProductPicker() {

        const branch =
            getSelectedBranch();

        if (!branch) {

            showMessage(
                "Select a source branch first.",
                "error"
            );

            return;
        }

        byId(
            "selectedSourceBranchName"
        ).textContent =
            branch.branch_name;

        openModal(
            "productPickerModal"
        );

        await loadProducts();
    }


    async function loadProducts() {

        const branch =
            getSelectedBranch();

        if (!branch) {
            return;
        }

        const search =
            byId("productSearchInput")?.value
                .trim() || "";

        const category =
            byId("productCategoryFilter")?.value
                || "";

        const params =
            new URLSearchParams();

        params.set(
            "branch_id",
            branch.branch_id
        );

        if (search) {
            params.set(
                "search",
                search
            );
        }

        if (category) {
            params.set(
                "category",
                category
            );
        }

        try {

            const data =
                await api(
                    `${API_BASE}/load-products?${params.toString()}`
                );

            state.pickerProducts =
                data.products || [];

            renderCategories(
                data.categories || []
            );

            renderProductPicker();

        } catch (error) {

            console.error(error);

            showMessage(
                error.message ||
                "Unable to load products.",
                "error"
            );
        }
    }


    function renderCategories(
        categories
    ) {

        const select =
            byId(
                "productCategoryFilter"
            );

        if (!select) {
            return;
        }

        const current =
            select.value;

        select.innerHTML = `
            <option value="">
                All Categories
            </option>
        `;

        categories.forEach(category => {

            const option =
                document.createElement("option");

            option.value = category;

            option.textContent =
                category;

            select.appendChild(option);
        });

        if (
            categories.includes(current)
        ) {
            select.value =
                current;
        }
    }


    function renderProductPicker() {

        const tbody =
            byId(
                "productPickerTableBody"
            );

        if (!tbody) {
            return;
        }

        byId(
            "availableProductCount"
        ).textContent =
            state.pickerProducts.length;

        if (!state.pickerProducts.length) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        No available stock found.
                    </td>
                </tr>
            `;

            updatePickerSummary();

            return;
        }

        tbody.innerHTML =
            state.pickerProducts
                .map(product => {

                    const selectedIndex =
                        findSelectedIndex({
                            stock_id:
                                product.stock_id,
                            product_id:
                                product.product_id
                        });

                    const selected =
                        selectedIndex !== -1;

                    return `
                        <tr>
                            <td>
                                <strong>
                                    ${escapeHtml(
                                        product.product_name
                                    )}
                                </strong>

                                ${
                                    product.brand
                                        ? `<small>
                                            ${escapeHtml(
                                                product.brand
                                            )}
                                           </small>`
                                        : ""
                                }
                            </td>

                            <td>
                                ${escapeHtml(
                                    product.category || "—"
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    product.batch_number || "—"
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    product.expiry_date || "—"
                                )}
                            </td>

                            <td>
                                ${quantity(
                                    product.quantity_available
                                )}
                            </td>

                            <td>
                                ${money(
                                    product.cost_price
                                )}
                            </td>

                            <td>
                                ${money(
                                    product.selling_price
                                )}
                            </td>

                            <td>
                                <button
                                    type="button"
                                    class="${
                                        selected
                                            ? "secondary-action-btn"
                                            : "primary-action-btn"
                                    }"
                                    data-picker-stock-id="${
                                        product.stock_id
                                    }"
                                >
                                    <i class="fas ${
                                        selected
                                            ? "fa-check"
                                            : "fa-plus"
                                    }"></i>

                                    ${
                                        selected
                                            ? "Added"
                                            : "Add"
                                    }
                                </button>
                            </td>
                        </tr>
                    `;

                })
                .join("");

        updatePickerSummary();
    }


    function addPickerProduct(stockId) {

        const product =
            state.pickerProducts.find(
                item =>
                    String(item.stock_id) ===
                    String(stockId)
            );

        if (!product) {
            return;
        }

        const existingIndex =
            findSelectedIndex({
                stock_id:
                    product.stock_id,
                product_id:
                    product.product_id
            });

        if (existingIndex !== -1) {

            state.selectedProducts[
                existingIndex
            ].quantity =
                number(
                    state.selectedProducts[
                        existingIndex
                    ].quantity
                );

        } else {

            state.selectedProducts.push({

                stock_id:
                    Number(product.stock_id),

                product_id:
                    Number(product.product_id),

                product_name:
                    product.product_name,

                category:
                    product.category,

                brand:
                    product.brand,

                batch_number:
                    product.batch_number,

                expiry_date:
                    product.expiry_date,

                quantity:
                    Math.min(
                        1,
                        number(
                            product.quantity_available
                        )
                    ),

                available:
                    number(
                        product.quantity_available
                    ),

                cost_price:
                    number(
                        product.cost_price
                    ),

                selling_price:
                    number(
                        product.selling_price
                    ),

                unit:
                    product.unit
            });
        }

        renderProductPicker();

        renderSelectedProducts();

        updateLoadAction();
    }


    function updatePickerSummary() {

        const count =
            state.selectedProducts.length;

        const total =
            state.selectedProducts.reduce(
                (sum, item) =>
                    sum +
                    number(item.quantity),
                0
            );

        byId(
            "pickerSelectedCount"
        ).textContent =
            `${count} selected`;

        byId(
            "pickerSelectedQuantity"
        ).textContent =
            `${quantity(total)} quantity`;
    }


    /*
    |--------------------------------------------------------------------------
    | SELECTED PRODUCTS
    |--------------------------------------------------------------------------
    */

    function renderSelectedProducts() {

        const panel =
            byId(
                "selectedProductsPanel"
            );

        const tbody =
            byId(
                "selectedProductsTableBody"
            );

        if (!panel || !tbody) {
            return;
        }

        if (!state.selectedProducts.length) {

            panel.style.display =
                "none";

            tbody.innerHTML = "";

            updateTotals();

            return;
        }

        panel.style.display =
            "block";

        tbody.innerHTML =
            state.selectedProducts
                .map((item, index) => {

                    const qty =
                        number(item.quantity);

                    const cost =
                        qty *
                        number(item.cost_price);

                    const sales =
                        qty *
                        number(item.selling_price);

                    return `
                        <tr>

                            <td>
                                <strong>
                                    ${escapeHtml(
                                        item.product_name
                                    )}
                                </strong>
                            </td>

                            <td>
                                ${escapeHtml(
                                    item.batch_number || "—"
                                )}
                            </td>

                            <td>
                                ${quantity(
                                    item.available
                                )}
                            </td>

                            <td>
                                <strong>
                                    ${quantity(qty)}
                                </strong>
                            </td>

                            <td>
                                ${money(cost)}
                            </td>

                            <td>
                                ${money(sales)}
                            </td>

                            <td>

                                <div class="table-actions">

                                    <button
                                        type="button"
                                        class="secondary-action-btn"
                                        data-edit-selected="${index}"
                                    >
                                        <i class="fas fa-edit"></i>
                                    </button>

                                    <button
                                        type="button"
                                        class="secondary-action-btn"
                                        data-delete-selected="${index}"
                                    >
                                        <i class="fas fa-trash"></i>
                                    </button>

                                </div>

                            </td>

                        </tr>
                    `;

                })
                .join("");

        updateTotals();
    }


    function updateTotals() {

        const totals =
            calculateTotals();

        byId(
            "selectedProductCount"
        ).textContent =
            `${totals.products} ${
                totals.products === 1
                    ? "product"
                    : "products"
            }`;

        byId(
            "totalProductsValue"
        ).textContent =
            totals.products;

        byId(
            "totalLoadQuantity"
        ).textContent =
            quantity(
                totals.quantity
            );

        byId(
            "totalLoadCost"
        ).textContent =
            money(
                totals.cost
            );

        byId(
            "totalPotentialSales"
        ).textContent =
            money(
                totals.sales
            );

        byId(
            "totalPotentialProfit"
        ).textContent =
            money(
                totals.profit
            );

        updatePickerSummary();
    }


    /*
    |--------------------------------------------------------------------------
    | EDIT SELECTED PRODUCT
    |--------------------------------------------------------------------------
    */

    function openEditProduct(index) {

        const item =
            state.selectedProducts[index];

        if (!item) {
            return;
        }

        state.editingIndex =
            index;

        byId(
            "editProductName"
        ).textContent =
            item.product_name;

        byId(
            "editProductBatch"
        ).textContent =
            `Batch: ${
                item.batch_number || "—"
            }`;

        byId(
            "editProductAvailable"
        ).textContent =
            `Available: ${
                quantity(item.available)
            }`;

        byId(
            "editLoadQuantity"
        ).value =
            number(item.quantity);

        updateEditProductPreview();

        openModal(
            "editLoadProductModal"
        );
    }


    function updateEditProductPreview() {

        if (
            state.editingIndex === null
        ) {
            return;
        }

        const item =
            state.selectedProducts[
                state.editingIndex
            ];

        if (!item) {
            return;
        }

        const qty =
            number(
                byId(
                    "editLoadQuantity"
                )?.value
            );

        const cost =
            qty *
            number(item.cost_price);

        const sales =
            qty *
            number(item.selling_price);

        const profit =
            sales - cost;

        byId(
            "editProductCostValue"
        ).textContent =
            money(cost);

        byId(
            "editProductSalesValue"
        ).textContent =
            money(sales);

        byId(
            "editProductProfitValue"
        ).textContent =
            money(profit);

        const warning =
            byId("quantityWarning");

        const invalid =
            !validClientQuantity(qty) ||
            qty >
            number(item.available);

        if (warning) {

            warning.style.display =
                invalid
                    ? "flex"
                    : "none";
        }

        const save =
            byId(
                "saveLoadProductQuantityBtn"
            );

        if (save) {
            save.disabled =
                invalid;
        }
    }


    function validClientQuantity(value) {

        return (
            Number.isFinite(
                Number(value)
            ) &&
            Number(value) > 0
        );
    }


    function saveEditedQuantity() {

        if (
            state.editingIndex === null
        ) {
            return;
        }

        const item =
            state.selectedProducts[
                state.editingIndex
            ];

        if (!item) {
            return;
        }

        const newQuantity =
            number(
                byId(
                    "editLoadQuantity"
                )?.value
            );

        if (
            !validClientQuantity(
                newQuantity
            )
        ) {

            showMessage(
                "Enter a valid quantity.",
                "error"
            );

            return;
        }

        if (
            newQuantity >
            number(item.available)
        ) {

            showMessage(
                "Quantity cannot exceed available stock.",
                "error"
            );

            return;
        }

        item.quantity =
            Math.round(
                newQuantity * 1000
            ) / 1000;

        closeModal(
            "editLoadProductModal"
        );

        renderSelectedProducts();

        updateLoadAction();
    }


    function deleteSelectedProduct(index) {

        const item =
            state.selectedProducts[index];

        if (!item) {
            return;
        }

        state.selectedProducts.splice(
            index,
            1
        );

        renderProductPicker();

        renderSelectedProducts();

        updateLoadAction();
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD ACTION INFORMATION
    |--------------------------------------------------------------------------
    */

    function updateLoadAction() {

        const vehicle =
            getSelectedVehicle();

        const actionVehicle =
            byId(
                "loadActionVehicle"
            );

        const actionSummary =
            byId(
                "loadActionSummary"
            );

        if (actionVehicle) {

            actionVehicle.textContent =
                vehicle
                    ? vehicle.location_name
                    : "No vehicle selected";
        }

        const totals =
            calculateTotals();

        if (actionSummary) {

            if (!vehicle) {

                actionSummary.textContent =
                    "Select a vehicle to begin.";

            } else if (
                !totals.products
            ) {

                actionSummary.textContent =
                    "Add products to begin loading.";

            } else {

                actionSummary.textContent =
                    `${totals.products} products • ` +
                    `${quantity(totals.quantity)} quantity • ` +
                    `${money(totals.cost)} cost`;
            }
        }

        const loadButton =
            byId(
                "loadVehicleBtn"
            );

        if (loadButton) {

            loadButton.disabled =
                !vehicle ||
                !getSelectedBranch() ||
                !state.selectedProducts.length;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | EXECUTIVE SUMMARY
    |--------------------------------------------------------------------------
    */

    function populateSummary() {

        const branch =
            getSelectedBranch();

        const vehicle =
            getSelectedVehicle();

        const totals =
            calculateTotals();

        byId(
            "summarySourceBranch"
        ).textContent =
            branch
                ? branch.branch_name
                : "—";

        byId(
            "summaryVehicle"
        ).textContent =
            vehicle
                ? vehicle.location_name
                : "—";

        byId(
            "summaryTotalProducts"
        ).textContent =
            totals.products;

        byId(
            "summaryTotalQuantity"
        ).textContent =
            quantity(
                totals.quantity
            );

        byId(
            "summaryCostValue"
        ).textContent =
            money(
                totals.cost
            );

        byId(
            "summaryPotentialRevenue"
        ).textContent =
            money(
                totals.sales
            );

        byId(
            "summaryPotentialProfit"
        ).textContent =
            money(
                totals.profit
            );

        const tbody =
            byId(
                "loadSummaryTableBody"
            );

        if (!tbody) {
            return;
        }

        tbody.innerHTML =
            state.selectedProducts
                .map(item => {

                    const qty =
                        number(item.quantity);

                    const cost =
                        qty *
                        number(item.cost_price);

                    const revenue =
                        qty *
                        number(item.selling_price);

                    return `
                        <tr>

                            <td>
                                ${escapeHtml(
                                    item.product_name
                                )}
                            </td>

                            <td>
                                ${quantity(qty)}
                            </td>

                            <td>
                                ${money(cost)}
                            </td>

                            <td>
                                ${money(revenue)}
                            </td>

                            <td>
                                ${money(
                                    revenue - cost
                                )}
                            </td>

                        </tr>
                    `;

                })
                .join("");
    }


    function openLoadSummary() {

        if (!validateLoadForm()) {
            return;
        }

        populateSummary();

        openModal(
            "loadSummaryModal"
        );
    }


    /*
    |--------------------------------------------------------------------------
    | CONFIRMATION
    |--------------------------------------------------------------------------
    */

    function populateConfirmation() {

        const branch =
            getSelectedBranch();

        const vehicle =
            getSelectedVehicle();

        const totals =
            calculateTotals();

        byId(
            "confirmationSourceBranch"
        ).textContent =
            branch
                ? branch.branch_name
                : "—";

        byId(
            "confirmationVehicle"
        ).textContent =
            vehicle
                ? vehicle.location_name
                : "—";

        byId(
            "confirmationProducts"
        ).textContent =
            totals.products;

        byId(
            "confirmationQuantity"
        ).textContent =
            quantity(
                totals.quantity
            );

        byId(
            "confirmationCost"
        ).textContent =
            money(
                totals.cost
            );

        byId(
            "confirmationSales"
        ).textContent =
            money(
                totals.sales
            );
    }


    function openConfirmation() {

        if (!validateLoadForm()) {
            return;
        }

        populateConfirmation();

        closeModal(
            "loadSummaryModal"
        );

        openModal(
            "confirmVehicleLoadModal"
        );
    }


    /*
    |--------------------------------------------------------------------------
    | VALIDATE LOAD
    |--------------------------------------------------------------------------
    */

    function validateLoadForm() {

        const branch =
            getSelectedBranch();

        const vehicle =
            getSelectedVehicle();

        if (!branch) {

            showMessage(
                "Please select a source branch.",
                "error"
            );

            return false;
        }

        if (!vehicle) {

            showMessage(
                "Please select an active vehicle.",
                "error"
            );

            return false;
        }

        if (!state.selectedProducts.length) {

            showMessage(
                "Please add at least one product.",
                "error"
            );

            return false;
        }

        for (
            const item
            of state.selectedProducts
        ) {

            if (
                !validClientQuantity(
                    item.quantity
                )
            ) {

                showMessage(
                    `Enter a valid quantity for ${item.product_name}.`,
                    "error"
                );

                return false;
            }

            if (
                number(item.quantity) >
                number(item.available)
            ) {

                showMessage(
                    `The quantity for ${item.product_name} exceeds available stock.`,
                    "error"
                );

                return false;
            }
        }

        return true;
    }


    /*
    |--------------------------------------------------------------------------
    | EXECUTE LOAD
    |--------------------------------------------------------------------------
    */

    async function executeVehicleLoad() {

        if (!validateLoadForm()) {
            return;
        }

        const branch =
            getSelectedBranch();

        const vehicle =
            getSelectedVehicle();

        const notes =
            byId(
                "loadVehicleNotes"
            )?.value.trim() || "";

        const payload = {

            source_branch_id:
                Number(branch.branch_id),

            vehicle_location_id:
                Number(vehicle.location_id),

            products:
                state.selectedProducts.map(
                    item => ({
                        product_id:
                            Number(item.product_id),

                        stock_id:
                            item.stock_id
                                ? Number(item.stock_id)
                                : undefined,

                        quantity:
                            Number(item.quantity)
                    })
                ),

            notes
        };

        const button =
            byId(
                "confirmVehicleLoadBtn"
            );

        const originalText =
            button?.innerHTML;

        if (button) {

            button.disabled = true;

            button.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Loading...
            `;
        }

        try {

            const data =
                await api(
                    `${API_BASE}/load-vehicle`,
                    {
                        method: "POST",

                        body:
                            JSON.stringify(
                                payload
                            )
                    }
                );

            closeAllModals();

            showMessage(
                data.message ||
                "Vehicle loaded successfully."
            );

            /*
            --------------------------------------------------------------
            | Clear only after server successfully commits.
            --------------------------------------------------------------
            */

            clearVehicleLoad();

            /*
            --------------------------------------------------------------
            | Refresh vehicle information.
            --------------------------------------------------------------
            */

            await loadVehicles();

        } catch (error) {

            console.error(
                "Vehicle load failed:",
                error
            );

            showMessage(
                error.message ||
                "Vehicle load failed.",
                "error"
            );

        } finally {

            if (button) {

                button.disabled = false;

                button.innerHTML =
                    originalText ||
                    `
                    <i class="fas fa-check-circle"></i>
                    Confirm & Load Vehicle
                    `;
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | CLEAR LOAD
    |--------------------------------------------------------------------------
    */

    function clearVehicleLoad(
        askConfirmation = true
    ) {

        if (
            askConfirmation &&
            (
                state.selectedProducts.length ||
                byId(
                    "loadVehicleNotes"
                )?.value.trim()
            )
        ) {

            const confirmed =
                window.confirm(
                    "Clear the current vehicle load setup?"
                );

            if (!confirmed) {
                return;
            }
        }

        state.selectedProducts = [];

        state.editingIndex = null;

        const notes =
            byId(
                "loadVehicleNotes"
            );

        if (notes) {
            notes.value = "";
        }

        updateNotesCounter();

        renderSelectedProducts();

        renderProductPicker();

        updateLoadAction();
    }


    /*
    |--------------------------------------------------------------------------
    | NOTES
    |--------------------------------------------------------------------------
    */

    function updateNotesCounter() {

        const textarea =
            byId(
                "loadVehicleNotes"
            );

        const counter =
            byId(
                "loadNotesCounter"
            );

        if (!textarea || !counter) {
            return;
        }

        counter.textContent =
            textarea.value.length;
    }


    /*
    |--------------------------------------------------------------------------
    | VEHICLE STOCK
    |--------------------------------------------------------------------------
    */

    async function openVehicleStock(
        vehicleId = null
    ) {

        const id =
            vehicleId ||
            byId("loadVehicle")?.value;

        if (!validClientId(id)) {

            showMessage(
                "Select a vehicle first.",
                "error"
            );

            return;
        }

        try {

            const data =
                await api(
                    `${API_BASE}/vehicle-stock?vehicle_location_id=${encodeURIComponent(id)}`
                );

            state.currentVehicleStockId =
                id;

            byId(
                "vehicleStockVehicleName"
            ).textContent =
                data.vehicle?.location_name ||
                "—";

            byId(
                "vehicleStockTotalQuantity"
            ).textContent =
                quantity(
                    data.summary?.total_quantity
                );

            byId(
                "vehicleStockCostValue"
            ).textContent =
                money(
                    data.summary?.total_cost
                );

            byId(
                "vehicleStockPotentialSales"
            ).textContent =
                money(
                    data.summary?.potential_sales
                );

            const tbody =
                byId(
                    "vehicleStockTableBody"
                );

            const rows =
                data.stock || [];

            if (!rows.length) {

                tbody.innerHTML = `
                    <tr>
                        <td colspan="8">
                            This vehicle currently has no available stock.
                        </td>
                    </tr>
                `;

            } else {

                tbody.innerHTML =
                    rows.map(row => {

                        const qty =
                            number(
                                row.quantity_available
                            );

                        const value =
                            qty *
                            number(
                                row.cost_price
                            );

                        return `
                            <tr>

                                <td>
                                    ${escapeHtml(
                                        row.product_name
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        row.batch_number || "—"
                                    )}
                                </td>

                                <td>
                                    ${quantity(
                                        row.quantity_received
                                    )}
                                </td>

                                <td>
                                    ${quantity(
                                        row.quantity_available
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        row.expiry_date || "—"
                                    )}
                                </td>

                                <td>
                                    ${money(
                                        row.cost_price
                                    )}
                                </td>

                                <td>
                                    ${money(
                                        row.selling_price
                                    )}
                                </td>

                                <td>
                                    ${money(value)}
                                </td>

                            </tr>
                        `;

                    }).join("");
            }

            openModal(
                "vehicleStockModal"
            );

        } catch (error) {

            console.error(error);

            showMessage(
                error.message ||
                "Unable to load vehicle stock.",
                "error"
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD HISTORY
    |--------------------------------------------------------------------------
    */

    async function openLoadHistory() {

        try {

            const data =
                await api(
                    `${API_BASE}/load-history`
                );

            state.history =
                data.history || [];

            renderHistoryVehicleFilter();

            renderLoadHistory();

            openModal(
                "loadHistoryModal"
            );

        } catch (error) {

            console.error(error);

            showMessage(
                error.message ||
                "Unable to load load history.",
                "error"
            );
        }
    }


    function renderHistoryVehicleFilter() {

        const select =
            byId(
                "loadHistoryVehicleFilter"
            );

        if (!select) {
            return;
        }

        const current =
            select.value;

        select.innerHTML = `
            <option value="">
                All Vehicles
            </option>
        `;

        state.vehicles.forEach(vehicle => {

            const option =
                document.createElement("option");

            option.value =
                vehicle.location_id;

            option.textContent =
                vehicle.location_name;

            select.appendChild(option);
        });

        if (current) {
            select.value = current;
        }
    }


    function renderLoadHistory() {

        const tbody =
            byId(
                "loadHistoryTableBody"
            );

        if (!tbody) {
            return;
        }

        const search =
            (
                byId(
                    "loadHistorySearch"
                )?.value || ""
            )
                .trim()
                .toLowerCase();

        const vehicleFilter =
            byId(
                "loadHistoryVehicleFilter"
            )?.value || "";

        const filtered =
            state.history.filter(row => {

                if (
                    vehicleFilter &&
                    String(
                        row.destination_location_id
                    ) !==
                    String(vehicleFilter)
                ) {
                    return false;
                }

                if (!search) {
                    return true;
                }

                return [
                    row.vehicle_name,
                    row.source_branch_name,
                    row.notes,
                    row.movement_id
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(search);
            });

        if (!filtered.length) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        No load history found.
                    </td>
                </tr>
            `;

            return;
        }

        tbody.innerHTML =
            filtered.map(row => {

                return `
                    <tr>

                        <td>
                            ${formatDate(
                                row.created_at
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.vehicle_name || "—"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.source_branch_name || "—"
                            )}
                        </td>

                        <td>
                            ${number(
                                row.product_count
                            )}
                        </td>

                        <td>
                            ${quantity(
                                row.total_quantity
                            )}
                        </td>

                        <td>
                            ${money(
                                row.total_cost
                            )}
                        </td>

                        <td>
                            <span class="status-badge active">
                                ${escapeHtml(
                                    row.status || "COMPLETED"
                                )}
                            </span>
                        </td>

                        <td>

                            <button
                                type="button"
                                class="secondary-action-btn"
                                data-history-stock="${
                                    row.destination_location_id
                                }"
                            >
                                <i class="fas fa-boxes"></i>
                                Stock
                            </button>

                        </td>

                    </tr>
                `;

            }).join("");
    }


    function formatDate(value) {

        if (!value) {
            return "—";
        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return String(value);
        }

        return date.toLocaleString();
    }


    function validClientId(value) {

        return (
            Number.isInteger(
                Number(value)
            ) &&
            Number(value) > 0
        );
    }


    /*
    |--------------------------------------------------------------------------
    | EVENT LISTENERS
    |--------------------------------------------------------------------------
    */

    /*
    | Close modal buttons
    */

    document.addEventListener(
        "click",
        event => {

            const closeButton =
                event.target.closest(
                    "[data-close-modal]"
                );

            if (closeButton) {

                closeModal(
                    closeButton.dataset.closeModal
                );

                return;
            }

            /*
            --------------------------------------------------------------
            | Product picker Add
            --------------------------------------------------------------
            */

            const pickerButton =
                event.target.closest(
                    "[data-picker-stock-id]"
                );

            if (pickerButton) {

                addPickerProduct(
                    pickerButton.dataset
                        .pickerStockId
                );

                return;
            }

            /*
            --------------------------------------------------------------
            | Edit selected product
            --------------------------------------------------------------
            */

            const editButton =
                event.target.closest(
                    "[data-edit-selected]"
                );

            if (editButton) {

                openEditProduct(
                    Number(
                        editButton.dataset
                            .editSelected
                    )
                );

                return;
            }

            /*
            --------------------------------------------------------------
            | Delete selected product
            --------------------------------------------------------------
            */

            const deleteButton =
                event.target.closest(
                    "[data-delete-selected]"
                );

            if (deleteButton) {

                deleteSelectedProduct(
                    Number(
                        deleteButton.dataset
                            .deleteSelected
                    )
                );

                return;
            }

            /*
            --------------------------------------------------------------
            | Vehicle stock
            --------------------------------------------------------------
            */

            const vehicleStockButton =
                event.target.closest(
                    "[data-vehicle-stock]"
                );

            if (vehicleStockButton) {

                openVehicleStock(
                    vehicleStockButton.dataset
                        .vehicleStock
                );

                return;
            }

            /*
            --------------------------------------------------------------
            | Edit vehicle
            --------------------------------------------------------------
            */

            const editVehicleButton =
                event.target.closest(
                    "[data-edit-vehicle]"
                );

            if (editVehicleButton) {

                editVehicle(
                    editVehicleButton.dataset
                        .editVehicle
                );

                return;
            }

            /*
            --------------------------------------------------------------
            | Toggle vehicle
            --------------------------------------------------------------
            */

            const toggleVehicleButton =
                event.target.closest(
                    "[data-toggle-vehicle]"
                );

            if (toggleVehicleButton) {

                toggleVehicle(
                    toggleVehicleButton.dataset
                        .toggleVehicle,

                    toggleVehicleButton.dataset
                        .active === "1"
                );

                return;
            }

            /*
            --------------------------------------------------------------
            | History stock
            --------------------------------------------------------------
            */

            const historyStockButton =
                event.target.closest(
                    "[data-history-stock]"
                );

            if (historyStockButton) {

                openVehicleStock(
                    historyStockButton.dataset
                        .historyStock
                );
            }
        }
    );


    /*
    | Source branch
    */

    byId(
        "loadSourceBranch"
    )?.addEventListener(
        "change",
        () => {

            /*
            A change of source branch invalidates
            the currently selected stock batches.
            */

            state.selectedProducts = [];

            renderSelectedProducts();

            const branch =
                getSelectedBranch();

            byId(
                "selectedSourceBranchName"
            ).textContent =
                branch
                    ? branch.branch_name
                    : "No branch selected";

            updateLoadAction();
        }
    );


    /*
    | Vehicle
    */

    byId(
        "loadVehicle"
    )?.addEventListener(
        "change",
        updateLoadAction
    );


    /*
    | Register vehicle
    */

    byId(
        "registerVehicleBtn"
    )?.addEventListener(
        "click",
        openRegisterVehicleModal
    );


    byId(
        "modalRegisterVehicleBtn"
    )?.addEventListener(
        "click",
        openRegisterVehicleModal
    );


    byId(
        "registerVehicleForm"
    )?.addEventListener(
        "submit",
        registerVehicle
    );


    /*
    | Manage vehicles
    */

    byId(
        "manageVehiclesBtn"
    )?.addEventListener(
        "click",
        () => {

            renderVehicleManagement();

            openModal(
                "manageVehiclesModal"
            );
        }
    );


    byId(
        "vehicleSearchInput"
    )?.addEventListener(
        "input",
        renderVehicleManagement
    );


    /*
    | Product picker
    */

    byId(
        "openProductPickerBtn"
    )?.addEventListener(
        "click",
        openProductPicker
    );


    byId(
        "productSearchInput"
    )?.addEventListener(
        "input",
        debounce(
            loadProducts,
            300
        )
    );


    byId(
        "productCategoryFilter"
    )?.addEventListener(
        "change",
        loadProducts
    );


    byId(
        "clearProductSearchBtn"
    )?.addEventListener(
        "click",
        () => {

            const input =
                byId(
                    "productSearchInput"
                );

            if (input) {
                input.value = "";
            }

            loadProducts();
        }
    );


    /*
    | Edit selected products
    */

    byId(
        "editSelectedProductsBtn"
    )?.addEventListener(
        "click",
        () => {

            if (
                !state.selectedProducts.length
            ) {

                showMessage(
                    "There are no selected products.",
                    "error"
                );

                return;
            }

            openProductPicker();
        }
    );


    /*
    | Quantity controls
    */

    byId(
        "decreaseLoadQuantity"
    )?.addEventListener(
        "click",
        () => {

            const input =
                byId(
                    "editLoadQuantity"
                );

            if (!input) {
                return;
            }

            input.value =
                Math.max(
                    0.001,
                    number(input.value) - 0.001
                ).toFixed(3);

            updateEditProductPreview();
        }
    );


    byId(
        "increaseLoadQuantity"
    )?.addEventListener(
        "click",
        () => {

            const input =
                byId(
                    "editLoadQuantity"
                );

            if (!input) {
                return;
            }

            const item =
                state.selectedProducts[
                    state.editingIndex
                ];

            if (!item) {
                return;
            }

            input.value =
                Math.min(
                    number(item.available),
                    number(input.value) + 0.001
                ).toFixed(3);

            updateEditProductPreview();
        }
    );


    byId(
        "editLoadQuantity"
    )?.addEventListener(
        "input",
        updateEditProductPreview
    );


    byId(
        "saveLoadProductQuantityBtn"
    )?.addEventListener(
        "click",
        saveEditedQuantity
    );


    /*
    | Summary
    */

    byId(
        "viewLoadSummaryBtn"
    )?.addEventListener(
        "click",
        openLoadSummary
    );


    byId(
        "summaryProceedLoadBtn"
    )?.addEventListener(
        "click",
        openConfirmation
    );


    /*
    | Load Vehicle
    */

    byId(
        "loadVehicleBtn"
    )?.addEventListener(
        "click",
        openLoadSummary
    );


    byId(
        "confirmVehicleLoadBtn"
    )?.addEventListener(
        "click",
        executeVehicleLoad
    );


    /*
    | Clear
    */

    byId(
        "clearVehicleLoadBtn"
    )?.addEventListener(
        "click",
        () => clearVehicleLoad(true)
    );


    /*
    | Notes
    */

    byId(
        "loadVehicleNotes"
    )?.addEventListener(
        "input",
        updateNotesCounter
    );


    /*
    | Vehicle stock
    */

    byId(
        "viewVehicleStockBtn"
    )?.addEventListener(
        "click",
        () => {

            const vehicle =
                getSelectedVehicle();

            if (!vehicle) {

                showMessage(
                    "Select a vehicle first.",
                    "error"
                );

                return;
            }

            openVehicleStock(
                vehicle.location_id
            );
        }
    );


    /*
    | Load history
    */

    byId("viewLoadHistoryBtn")?.addEventListener(
        "click",
        openLoadHistory
    );


    byId(
        "loadHistorySearch"
    )?.addEventListener(
        "input",
        renderLoadHistory
    );


    byId(
        "loadHistoryVehicleFilter"
    )?.addEventListener(
        "change",
        renderLoadHistory
    );


    /*
    |--------------------------------------------------------------------------
    | Debounce
    |--------------------------------------------------------------------------
    */

    function debounce(
        callback,
        delay
    ) {

        let timer;

        return (...args) => {

            clearTimeout(timer);

            timer =
                setTimeout(
                    () => callback(...args),
                    delay
                );
        };
    }


    /*
    |--------------------------------------------------------------------------
    | INITIALIZE
    |--------------------------------------------------------------------------
    */

    async function initialize() {

        updateNotesCounter();

        updateLoadAction();

        await Promise.all([
            loadBranches(),
            loadVehicles()
        ]);

        renderSelectedProducts();

        updateLoadAction();
    }


    initialize();

});