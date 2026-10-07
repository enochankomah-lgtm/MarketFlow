// ============================================================
// MARKETFLOW SETTINGS PAGE JAVASCRIPT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // ========================================================
    // TAX & TRANSACTION DISCOUNT ELEMENTS
    // ========================================================

    const taxDiscountForm =
        document.getElementById('taxDiscountForm');

    const managerSearch =
        document.getElementById('managerSearch');

    const managerId =
        document.getElementById('managerId');

    const managerResults =
        document.getElementById('managerResults');

    const selectedManager =
        document.getElementById('selectedManager');

    const selectedManagerName =
        document.getElementById('selectedManagerName');

    const selectedManagerRole =
        document.getElementById('selectedManagerRole');

    const clearManager =
        document.getElementById('clearManager');

    const reason =
        document.getElementById('changeReason');

    const reasonCount =
        document.getElementById('reasonCount');

    const formMessage =
        document.getElementById('formMessage');

    const saveButton =
        document.getElementById('saveSettings');

    const resetButton =
        document.getElementById('resetForm');

    const currentTax =
        document.getElementById('currentTax');

    const currentDiscount =
        document.getElementById('currentDiscount');

    const historyBody =
        document.getElementById('historyBody');

    const branchSelector =
        document.getElementById('branchSelector');

    const settingsBranchId =
        document.getElementById('settingsBranchId');

    const transactionScopeInputs =
        document.querySelectorAll(
            'input[name="settings_scope"]'
        );


    // ========================================================
    // PRODUCT DISCOUNT ELEMENTS
    // ========================================================

    const productDiscountSearch =
        document.getElementById('productDiscountSearch');

    const productDiscountBody =
        document.getElementById('productDiscountBody');

    const productDiscountCount =
        document.getElementById('productDiscountCount');

    const productDiscountModal =
        document.getElementById('productDiscountModal');

    const productDiscountModalOverlay =
        document.getElementById('productDiscountModalOverlay');

    const closeProductDiscountModal =
        document.getElementById('closeProductDiscountModal');

    const cancelProductDiscount =
        document.getElementById('cancelProductDiscount');

    const productDiscountForm =
        document.getElementById('productDiscountForm');

    const productDiscountProductId =
        document.getElementById('productDiscountProductId');

    const modalProductName =
        document.getElementById('modalProductName');

    const modalProductId =
        document.getElementById('modalProductId');

    const modalSellingPrice =
        document.getElementById('modalSellingPrice');

    const productDiscountRate =
        document.getElementById('productDiscountRate');

    const productDiscountReason =
        document.getElementById('productDiscountReason');

    const productReasonCount =
        document.getElementById('productReasonCount');

    const productDiscountMessage =
        document.getElementById('productDiscountMessage');

    const saveProductDiscount =
        document.getElementById('saveProductDiscount');

    const productBranchSelector =
        document.getElementById('productBranchSelector');

    const productDiscountBranchId =
        document.getElementById(
            'productDiscountBranchId'
        );

    const productScopeInputs =
        document.querySelectorAll(
            'input[name="product_discount_scope"]'
        );


    // ========================================================
    // HELPER — GET SELECTED TRANSACTION SCOPE
    // ========================================================

    function getTransactionScope() {

        const selected =
            document.querySelector(
                'input[name="settings_scope"]:checked'
            );

        return selected
            ? selected.value
            : 'business';

    }


    // ========================================================
    // HELPER — GET SELECTED PRODUCT SCOPE
    // ========================================================

    function getProductDiscountScope() {

        const selected =
            document.querySelector(
                'input[name="product_discount_scope"]:checked'
            );

        return selected
            ? selected.value
            : 'business';

    }


    // ========================================================
    // TRANSACTION SCOPE CHANGE
    // ========================================================

    transactionScopeInputs.forEach(input => {

        input.addEventListener(
            'change',
            updateTransactionScope
        );

    });


    function updateTransactionScope() {

        const scope = getTransactionScope();

        if (!branchSelector || !settingsBranchId) {
            return;
        }

        if (scope === 'branch') {

            branchSelector.classList.remove('hidden');

            settingsBranchId.required = true;

        } else {

            branchSelector.classList.add('hidden');

            settingsBranchId.required = false;
            settingsBranchId.value = '';
        }
    }


    // ========================================================
    // PRODUCT DISCOUNT SCOPE CHANGE
    // ========================================================

    productScopeInputs.forEach(input => {

        input.addEventListener(
            'change',
            updateProductDiscountScope
        );

    });


    function updateProductDiscountScope() {

        const scope =
            getProductDiscountScope();

        if (
            !productBranchSelector ||
            !productDiscountBranchId
        ) {
            return;
        }

        if (scope === 'branch') {

            productBranchSelector.classList.remove(
                'hidden'
            );

            productDiscountBranchId.required = true;

        } else {

            productBranchSelector.classList.add(
                'hidden'
            );

            productDiscountBranchId.required = false;

            productDiscountBranchId.value = '';

        }

    }


    // ========================================================
    // INITIALIZE SCOPE CONTROLS
    // ========================================================

    updateTransactionScope();
    updateProductDiscountScope();


    // ========================================================
    // MANAGER SEARCH
    // ========================================================

    let searchTimer = null;


    if (managerSearch) {

        managerSearch.addEventListener(
            'input',
            () => {

                const search =
                    managerSearch.value.trim();

                managerId.value = '';

                selectedManager.classList.add(
                    'hidden'
                );

                clearTimeout(searchTimer);

                if (!search) {

                    managerResults.innerHTML = '';

                    managerResults.style.display =
                        'none';

                    return;

                }

                searchTimer = setTimeout(
                    () => {
                        searchManagers(search);
                    },
                    250
                );

            }
        );

    }


    async function searchManagers(search) {

        try {

            managerResults.innerHTML = `
                <div class="manager-result">
                    <div class="manager-info">
                        <span>Searching...</span>
                    </div>
                </div>
            `;

            managerResults.style.display =
                'block';


            const response =
                await fetch(
                    `/settings/managers/search?search=${encodeURIComponent(search)}`
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    'Unable to search managers.'
                );

            }


            displayManagers(
                data.managers
            );


        } catch (error) {

            console.error(
                'Manager search error:',
                error
            );


            managerResults.innerHTML = `
                <div class="manager-result">
                    <div class="manager-info">
                        <span>Unable to load managers.</span>
                    </div>
                </div>
            `;

        }

    }


    function displayManagers(managers) {

        if (
            !managers ||
            managers.length === 0
        ) {

            managerResults.innerHTML = `
                <div class="manager-result">
                    <div class="manager-info">
                        <span>No active managers found.</span>
                    </div>
                </div>
            `;

            managerResults.style.display =
                'block';

            return;

        }


        managerResults.innerHTML = '';


        managers.forEach(manager => {

            const firstName =
                manager.FirstName || '';

            const lastName =
                manager.LastName || '';

            const fullName =
                `${firstName} ${lastName}`.trim();


            const role =
                manager.RoleName ||
                manager.JobTitle ||
                'Manager';


            const initials =
                (
                    firstName.charAt(0) +
                    lastName.charAt(0)
                ).toUpperCase();


            const button =
                document.createElement('button');

            button.type =
                'button';

            button.className =
                'manager-result';


            button.innerHTML = `
                <span class="manager-avatar">
                    ${escapeHtml(initials)}
                </span>

                <span class="manager-info">

                    <strong>
                        ${escapeHtml(fullName)}
                    </strong>

                    <span>
                        ${escapeHtml(role)}
                    </span>

                </span>
            `;


            button.addEventListener(
                'click',
                () => {

                    selectManager(
                        manager.UserID,
                        fullName,
                        role
                    );

                }
            );


            managerResults.appendChild(
                button
            );

        });


        managerResults.style.display =
            'block';

    }


    // ========================================================
    // SELECT MANAGER
    // ========================================================

    function selectManager(
        id,
        name,
        role
    ) {

        managerId.value =
            id;

        managerSearch.value =
            name;

        selectedManagerName.textContent =
            name;

        selectedManagerRole.textContent =
            role;

        selectedManager.classList.remove(
            'hidden'
        );

        managerResults.innerHTML =
            '';

        managerResults.style.display =
            'none';

    }


    // ========================================================
    // CHANGE MANAGER
    // ========================================================

    if (clearManager) {

        clearManager.addEventListener(
            'click',
            () => {

                managerId.value =
                    '';

                managerSearch.value =
                    '';

                selectedManager.classList.add(
                    'hidden'
                );

                managerSearch.focus();

            }
        );

    }


    // ========================================================
    // CLOSE MANAGER RESULTS
    // ========================================================

    document.addEventListener(
        'click',
        event => {

            if (
                !event.target.closest(
                    '.manager-search'
                )
            ) {

                if (managerResults) {

                    managerResults.style.display =
                        'none';

                }

            }

        }
    );


    // ========================================================
    // REASON CHARACTER COUNT
    // ========================================================

    if (reason) {

        reason.addEventListener(
            'input',
            () => {

                reasonCount.textContent =
                    reason.value.length;

            }
        );

    }


    // ========================================================
    // TAX & TRANSACTION DISCOUNT SUBMISSION
    // ========================================================

    if (taxDiscountForm) {

        taxDiscountForm.addEventListener(
            'submit',
            async event => {

                event.preventDefault();


                hideMessage();


                const taxRate =
                    document.getElementById(
                        'taxRate'
                    ).value.trim();


                const discountRate =
                    document.getElementById(
                        'discountRate'
                    ).value.trim();


                const scope =
                    getTransactionScope();


                const branchId =
                    settingsBranchId
                        ? settingsBranchId.value.trim()
                        : '';


                // ------------------------------------------------
                // MANAGER VALIDATION
                // ------------------------------------------------

                if (!managerId.value) {

                    showMessage(
                        'error',
                        'Please select an authorized manager from the list.'
                    );

                    managerSearch.focus();

                    return;

                }


                // ------------------------------------------------
                // SCOPE VALIDATION
                // ------------------------------------------------

                if (
                    scope === 'branch' &&
                    !branchId
                ) {

                    showMessage(
                        'error',
                        'Please select a branch.'
                    );

                    if (settingsBranchId) {
                        settingsBranchId.focus();
                    }

                    return;

                }


                // ------------------------------------------------
                // RATE VALIDATION
                // ------------------------------------------------

                const taxValue =
                    Number(taxRate);

                const discountValue =
                    Number(discountRate);


                if (
                    !Number.isFinite(taxValue) ||
                    taxValue < 0 ||
                    taxValue > 100
                ) {

                    showMessage(
                        'error',
                        'Tax rate must be between 0% and 100%.'
                    );

                    return;

                }


                if (
                    !Number.isFinite(discountValue) ||
                    discountValue < 0 ||
                    discountValue > 100
                ) {

                    showMessage(
                        'error',
                        'Transaction discount must be between 0% and 100%.'
                    );

                    return;

                }


                // ------------------------------------------------
                // REASON VALIDATION
                // ------------------------------------------------

                if (!reason.value.trim()) {

                    showMessage(
                        'error',
                        'Please provide a reason for the change.'
                    );

                    reason.focus();

                    return;

                }


                if (
                    reason.value.trim().length >
                    255
                ) {

                    showMessage(
                        'error',
                        'The reason cannot exceed 255 characters.'
                    );

                    reason.focus();

                    return;

                }


                // ------------------------------------------------
                // DISABLE BUTTON
                // ------------------------------------------------

                saveButton.disabled =
                    true;

                saveButton.textContent =
                    'Saving...';


                try {

                    const body =
                        new URLSearchParams();


                    body.append(
                        'tax_rate',
                        taxValue.toFixed(2)
                    );


                    body.append(
                        'discount_rate',
                        discountValue.toFixed(2)
                    );


                    body.append(
                        'change_reason',
                        reason.value.trim()
                    );


                    body.append(
                        'manager_id',
                        managerId.value
                    );


                    // IMPORTANT:
                    // Scope is sent explicitly.
                    // business_id is NEVER sent from the browser.

                    body.append(
                        'settings_scope',
                        scope
                    );


                    if (
                        scope === 'branch'
                    ) {

                        body.append(
                            'branch_id',
                            branchId
                        );

                    }


                    const response =
                        await fetch(
                            '/settings/tax-discount',
                            {
                                method: 'POST',

                                headers: {
                                    'Content-Type':
                                        'application/x-www-form-urlencoded'
                                },

                                body
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
                            'Unable to update settings.'
                        );

                    }


                    // ------------------------------------------------
                    // UPDATE CURRENT DISPLAY
                    // ------------------------------------------------

                    if (data.settings) {
                        currentTax.textContent =
                            `${Number(data.settings.tax_rate || 0).toFixed(2)}%`;

                        currentDiscount.textContent =
                            `${Number(data.settings.discount_rate || 0).toFixed(2)}%`;
                    }

                    // Reload the effective settings for the currently selected scope.
                    loadCurrentSettings();


                    showMessage(
                        'success',
                        data.message ||
                        'Settings updated successfully.'
                    );


                    loadHistory();


                } catch (error) {

                    console.error(
                        'Settings update error:',
                        error
                    );


                    showMessage(
                        'error',
                        error.message ||
                        'Unable to update settings.'
                    );


                } finally {

                    saveButton.disabled =
                        false;

                    saveButton.textContent =
                        'Save Settings';

                }

            }
        );

    }


    // ========================================================
// LOAD CURRENT TRANSACTION SETTINGS
// ========================================================

async function loadCurrentSettings() {
    try {
        const scope = getTransactionScope();

        let url = '/settings/settings';

        if (scope === 'branch' && settingsBranchId?.value) {
            url += `?branch_id=${encodeURIComponent(
                settingsBranchId.value
            )}`;
        }

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });

        const contentType =
            response.headers.get('content-type') || '';

        if (!contentType.includes('application/json')) {
            return;
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
            return;
        }

        const settings = data.settings || data.pageSettings;

        if (!settings) {
            return;
        }

        if (currentTax) {
            currentTax.textContent =
                `${Number(settings.tax_rate || 0).toFixed(2)}%`;
        }

        if (currentDiscount) {
            currentDiscount.textContent =
                `${Number(settings.discount_rate || 0).toFixed(2)}%`;
        }

    } catch (error) {
        console.error(
            'Unable to load current transaction settings:',
            error
        );
    }
}

    // ========================================================
    // RESET FORM
    // ========================================================

    if (resetButton) {

        resetButton.addEventListener(
            'click',
            () => {

                window.location.reload();

            }
        );

    }


    // ========================================================
    // SHOW MESSAGE
    // ========================================================

    function showMessage(
        type,
        message
    ) {

        formMessage.className =
            `form-message ${type}`;

        formMessage.textContent =
            message;

        formMessage.classList.remove(
            'hidden'
        );

    }


    // ========================================================
    // HIDE MESSAGE
    // ========================================================

    function hideMessage() {

        formMessage.className =
            'form-message hidden';

        formMessage.textContent =
            '';

    }


    // ========================================================
    // LOAD HISTORY
    // ========================================================

    async function loadHistory() {

        try {

            const response =
                await fetch(
                    '/settings/tax-discount/history'
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    'Unable to load history.'
                );

            }


            renderHistory(
                data.history
            );


        } catch (error) {

            console.error(
                'History error:',
                error
            );


            historyBody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="loading-history"
                    >
                        Unable to load history.
                    </td>
                </tr>
            `;

        }

    }


    // ========================================================
    // RENDER HISTORY
    // ========================================================

    function renderHistory(history) {

        if (
            !history ||
            history.length === 0
        ) {

            historyBody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="loading-history"
                    >
                        No tax or discount changes have been recorded yet.
                    </td>
                </tr>
            `;

            return;

        }


        historyBody.innerHTML =
            '';


        history.forEach(item => {

            const row =
                document.createElement('tr');


            const date =
                item.changed_at
                    ? new Date(
                        item.changed_at
                    ).toLocaleString()
                    : '-';


            const manager =
                item.manager_name ||
                'Unknown';


            const tax =
                `${Number(
                    item.old_tax_rate
                ).toFixed(2)}% → ${Number(
                    item.new_tax_rate
                ).toFixed(2)}%`;


            const discount =
                `${Number(
                    item.old_discount_rate
                ).toFixed(2)}% → ${Number(
                    item.new_discount_rate
                ).toFixed(2)}%`;


            const reason =
                item.change_reason ||
                '-';


            row.innerHTML = `

                <td>
                    ${escapeHtml(date)}
                </td>

                <td>
                    <strong>
                        ${escapeHtml(manager)}
                    </strong>
                </td>

                <td>
                    ${escapeHtml(tax)}
                </td>

                <td>
                    ${escapeHtml(discount)}
                </td>

                <td>
                    ${escapeHtml(reason)}
                </td>

            `;


            historyBody.appendChild(
                row
            );

        });

    }


    // ========================================================
    // PRODUCT SEARCH
    // ========================================================

    let productSearchTimer = null;


    if (productDiscountSearch) {

        productDiscountSearch.addEventListener(
            'input',
            () => {

                const search =
                    productDiscountSearch.value.trim();


                clearTimeout(
                    productSearchTimer
                );


                if (!search) {

                    loadProductDiscounts();

                    return;

                }


                productSearchTimer =
                    setTimeout(
                        () => {

                            searchProductDiscounts(
                                search
                            );

                        },
                        250
                    );

            }
        );

    }


    // ========================================================
    // LOAD ALL PRODUCT DISCOUNTS
    // ========================================================

    async function loadProductDiscounts() {

        try {

            productDiscountBody.innerHTML = `
                <tr>
                    <td
                        colspan="7"
                        class="loading-history"
                    >
                        Loading product discount settings...
                    </td>
                </tr>
            `;


            const response =
                await fetch(
                    '/settings/product-discounts'
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    'Unable to load product discounts.'
                );

            }


            renderProductDiscounts(
                data.productDiscounts
            );


        } catch (error) {

            console.error(
                'Product discount loading error:',
                error
            );


            productDiscountBody.innerHTML = `
                <tr>
                    <td
                        colspan="7"
                        class="loading-history"
                    >
                        Unable to load product discount settings.
                    </td>
                </tr>
            `;

        }

    }


    // ========================================================
    // SEARCH PRODUCT DISCOUNTS
    // ========================================================

    async function searchProductDiscounts(search) {

        try {

            productDiscountBody.innerHTML = `
                <tr>
                    <td
                        colspan="7"
                        class="loading-history"
                    >
                        Searching...
                    </td>
                </tr>
            `;


            const response =
                await fetch(
                    `/settings/product-discounts/search?search=${encodeURIComponent(search)}`
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    'Unable to search products.'
                );

            }


            renderProductDiscounts(
                data.productDiscounts
            );


        } catch (error) {

            console.error(
                'Product discount search error:',
                error
            );


            productDiscountBody.innerHTML = `
                <tr>
                    <td
                        colspan="7"
                        class="loading-history"
                    >
                        Unable to search products.
                    </td>
                </tr>
            `;

        }

    }


    // ========================================================
    // RENDER PRODUCT DISCOUNTS
    // ========================================================

    function renderProductDiscounts(products) {

        if (
            !products ||
            products.length === 0
        ) {

            productDiscountBody.innerHTML = `
                <tr>
                    <td
                        colspan="7"
                        class="empty-product-discounts"
                    >

                        <div class="empty-settings">

                            <div class="empty-settings-icon">
                                %
                            </div>

                            <strong>
                                No product discount settings found
                            </strong>

                            <p>
                                Try another product name or product ID.
                            </p>

                        </div>

                    </td>
                </tr>
            `;


            productDiscountCount.textContent =
                '0';


            return;

        }


        productDiscountBody.innerHTML =
            '';


        productDiscountCount.textContent =
            products.length;


        products.forEach(product => {

            const row =
                document.createElement('tr');


            row.className =
                'product-discount-row';


            row.dataset.productId =
                product.product_id;


            row.dataset.productName =
                product.product_name;


            const productName =
                product.product_name ||
                'Unnamed Product';


            const firstLetter =
                productName
                    .charAt(0)
                    .toUpperCase();


            const sellingPrice =
                Number(
                    product.selling_price || 0
                ).toFixed(2);


            const discount =
                Number(
                    product.discount || 0
                );


            const reason =
                product.reason ||
                'No reason provided';


            const updatedAt =
                product.updated_at
                    ? new Date(
                        product.updated_at
                    ).toLocaleString()
                    : '-';


            const discountClass =
                discount > 0
                    ? 'has-discount'
                    : 'no-discount';


            row.innerHTML = `

                <td>

                    <div class="product-table-name">

                        <div class="product-table-icon">
                            ${escapeHtml(firstLetter)}
                        </div>

                        <div>

                            <strong>
                                ${escapeHtml(productName)}
                            </strong>

                            <span>
                                Product pricing
                            </span>

                        </div>

                    </div>

                </td>


                <td>

                    <span class="product-id">
                        #${escapeHtml(product.product_id)}
                    </span>

                </td>


                <td>

                    <strong class="selling-price">
                        GHS ${sellingPrice}
                    </strong>

                </td>


                <td>

                    <span
                        class="discount-badge ${discountClass}"
                    >
                        ${discount.toFixed(2)}%
                    </span>

                </td>


                <td>

                    <span class="discount-reason">
                        ${escapeHtml(reason)}
                    </span>

                </td>


                <td>

                    <span class="updated-date">
                        ${escapeHtml(updatedAt)}
                    </span>

                </td>


                <td>

                    <button
                        type="button"
                        class="product-discount-edit"
                        data-product-id="${escapeHtml(product.product_id)}"
                    >
                        Edit
                    </button>

                </td>

            `;


            productDiscountBody.appendChild(
                row
            );

        });

    }


    // ========================================================
    // EDIT PRODUCT DISCOUNT
    // ========================================================

    if (productDiscountBody) {

        productDiscountBody.addEventListener(
            'click',
            event => {

                const button =
                    event.target.closest(
                        '.product-discount-edit'
                    );


                if (!button) {
                    return;
                }


                const productId =
                    button.dataset.productId;


                openProductDiscountModal(
                    productId
                );

            }
        );

    }


    // ========================================================
    // OPEN PRODUCT DISCOUNT MODAL
    // ========================================================

    async function openProductDiscountModal(
        productId
    ) {

        try {

            productDiscountMessage.className =
                'form-message hidden';

            productDiscountMessage.textContent =
                '';


            productDiscountForm.reset();


            // Reset product scope to business-wide
            const businessScope =
                document.querySelector(
                    'input[name="product_discount_scope"][value="business"]'
                );

            if (businessScope) {
                businessScope.checked = true;
            }


            updateProductDiscountScope();


            productDiscountProductId.value =
                productId;


            modalProductName.textContent =
                'Loading product...';


            modalProductId.textContent =
                `Product ID: #${productId}`;


            modalSellingPrice.textContent =
                '0.00';


            productDiscountModal.classList.remove(
                'hidden'
            );


            const response =
                await fetch(
                    `/settings/product-discounts/${encodeURIComponent(productId)}`
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    'Unable to load product discount.'
                );

            }


            const product =
                data.productDiscount;


            modalProductName.textContent =
                product.product_name ||
                'Unnamed Product';


            modalProductId.textContent =
                `Product ID: #${product.product_id}`;


            modalSellingPrice.textContent =
                Number(
                    product.selling_price || 0
                ).toFixed(2);


            productDiscountRate.value =
                Number(
                    product.discount || 0
                ).toFixed(2);


            productDiscountReason.value =
                product.reason || '';


            // ------------------------------------------------
            // RESTORE EXISTING SCOPE
            // ------------------------------------------------

            const productScope =
                product.branch_id !== null &&
                product.branch_id !== undefined
                    ? 'branch'
                    : 'business';


            const scopeInput =
                document.querySelector(
                    `input[name="product_discount_scope"][value="${productScope}"]`
                );


            if (scopeInput) {
                scopeInput.checked = true;
            }


            if (
                productScope === 'branch' &&
                productDiscountBranchId
            ) {

                productDiscountBranchId.value =
                    product.branch_id;

            } else if (productDiscountBranchId) {

                productDiscountBranchId.value =
                    '';

            }


            updateProductDiscountScope();


            updateProductReasonCount();


            productDiscountRate.focus();


        } catch (error) {

            console.error(
                'Product discount modal error:',
                error
            );


            closeProductDiscountModalWindow();


            alert(
                error.message ||
                'Unable to load product discount.'
            );

        }

    }


    // ========================================================
    // PRODUCT REASON CHARACTER COUNT
    // ========================================================

    if (productDiscountReason) {

        productDiscountReason.addEventListener(
            'input',
            updateProductReasonCount
        );

    }


    function updateProductReasonCount() {

        if (!productDiscountReason) {
            return;
        }


        productReasonCount.textContent =
            productDiscountReason.value.length;

    }


    // ========================================================
    // SAVE PRODUCT DISCOUNT
    // ========================================================

    if (productDiscountForm) {

        productDiscountForm.addEventListener(
            'submit',
            async event => {

                event.preventDefault();


                const productId =
                    productDiscountProductId.value.trim();


                const discount =
                    productDiscountRate.value.trim();


                const productReason =
                    productDiscountReason.value.trim();


                const scope =
                    getProductDiscountScope();


                const branchId =
                    productDiscountBranchId
                        ? productDiscountBranchId.value.trim()
                        : '';


                // ------------------------------------------------
                // PRODUCT VALIDATION
                // ------------------------------------------------

                if (!productId) {

                    showProductDiscountMessage(
                        'error',
                        'Invalid product.'
                    );

                    return;

                }


                // ------------------------------------------------
                // DISCOUNT VALIDATION
                // ------------------------------------------------

                const discountValue =
                    Number(discount);


                if (
                    !Number.isFinite(discountValue) ||
                    discountValue < 0 ||
                    discountValue > 100
                ) {

                    showProductDiscountMessage(
                        'error',
                        'Product discount must be between 0% and 100%.'
                    );

                    return;

                }


                // ------------------------------------------------
                // SCOPE VALIDATION
                // ------------------------------------------------

                if (
                    scope === 'branch' &&
                    !branchId
                ) {

                    showProductDiscountMessage(
                        'error',
                        'Please select a branch.'
                    );

                    if (productDiscountBranchId) {
                        productDiscountBranchId.focus();
                    }

                    return;

                }


                // ------------------------------------------------
                // REASON VALIDATION
                // ------------------------------------------------

                if (!productReason) {

                    showProductDiscountMessage(
                        'error',
                        'Please provide a reason for the change.'
                    );

                    productDiscountReason.focus();

                    return;

                }


                if (
                    productReason.length >
                    255
                ) {

                    showProductDiscountMessage(
                        'error',
                        'The reason cannot exceed 255 characters.'
                    );

                    productDiscountReason.focus();

                    return;

                }


                // ------------------------------------------------
                // DISABLE BUTTON
                // ------------------------------------------------

                saveProductDiscount.disabled =
                    true;


                showProductDiscountMessage(
                    '',
                    'Saving...'
                );


                try {

                    const body =
                        new URLSearchParams();


                    body.append(
                        'product_id',
                        productId
                    );


                    body.append(
                        'discount',
                        discountValue.toFixed(2)
                    );


                    body.append(
                        'reason',
                        productReason
                    );


                    // IMPORTANT:
                    // business_id is never sent by the browser.

                    body.append(
                        'discount_scope',
                        scope
                    );


                    if (
                        scope === 'branch'
                    ) {

                        body.append(
                            'branch_id',
                            branchId
                        );

                    }


                    const response =
                        await fetch(
                            `/settings/product-discounts/${encodeURIComponent(productId)}`,
                            {
                                method: 'PUT',

                                headers: {
                                    'Content-Type':
                                        'application/x-www-form-urlencoded'
                                },

                                body
                            }
                        );


                    const contentType =
                        response.headers.get(
                            'content-type'
                        ) || '';


                    if (
                        !contentType.includes(
                            'application/json'
                        )
                    ) {

                        const text =
                            await response.text();


                        console.error(
                            'Expected JSON but received:',
                            text
                        );


                        throw new Error(
                            `Server returned an unexpected response (${response.status}).`
                        );

                    }


                    const data =
                        await response.json();


                    if (
                        !response.ok ||
                        !data.success
                    ) {

                        throw new Error(
                            data.message ||
                            'Unable to update product discount.'
                        );

                    }


                    showProductDiscountMessage(
                        'success',
                        data.message ||
                        'Product discount updated successfully.'
                    );


                    setTimeout(
                        () => {

                            closeProductDiscountModalWindow();

                            loadProductDiscounts();

                        },
                        700
                    );


                } catch (error) {

                    console.error(
                        'Product discount save error:',
                        error
                    );


                    showProductDiscountMessage(
                        'error',
                        error.message ||
                        'Unable to save product discount.'
                    );


                } finally {

                    saveProductDiscount.disabled =
                        false;

                }

            }
        );

    }


    // ========================================================
    // PRODUCT DISCOUNT MESSAGE
    // ========================================================

    function showProductDiscountMessage(
        type,
        message
    ) {

        if (!productDiscountMessage) {
            return;
        }


        if (type) {

            productDiscountMessage.className =
                `form-message ${type}`;

        } else {

            productDiscountMessage.className =
                'form-message';

        }


        productDiscountMessage.textContent =
            message;


        productDiscountMessage.classList.remove(
            'hidden'
        );

    }


    // ========================================================
    // CLOSE PRODUCT DISCOUNT MODAL
    // ========================================================

    if (closeProductDiscountModal) {

        closeProductDiscountModal.addEventListener(
            'click',
            closeProductDiscountModalWindow
        );

    }


    if (cancelProductDiscount) {

        cancelProductDiscount.addEventListener(
            'click',
            closeProductDiscountModalWindow
        );

    }


    if (productDiscountModalOverlay) {

        productDiscountModalOverlay.addEventListener(
            'click',
            closeProductDiscountModalWindow
        );

    }


    function closeProductDiscountModalWindow() {

        if (!productDiscountModal) {
            return;
        }


        productDiscountModal.classList.add(
            'hidden'
        );

    }


    // ========================================================
    // ESCAPE KEY — CLOSE MODAL
    // ========================================================

    document.addEventListener(
        'keydown',
        event => {

            if (
                event.key === 'Escape' &&
                productDiscountModal &&
                !productDiscountModal.classList.contains(
                    'hidden'
                )
            ) {

                closeProductDiscountModalWindow();

            }

        }
    );


    // ========================================================
    // BASIC HTML ESCAPE
    // ========================================================

    function escapeHtml(value) {

        return String(value)
            .replaceAll(
                '&',
                '&amp;'
            )
            .replaceAll(
                '<',
                '&lt;'
            )
            .replaceAll(
                '>',
                '&gt;'
            )
            .replaceAll(
                '"',
                '&quot;'
            )
            .replaceAll(
                "'",
                '&#039;'
            );

    }

    // ========================================================
    // INITIAL LOAD
    // ========================================================

    loadHistory();

    loadProductDiscounts();

});