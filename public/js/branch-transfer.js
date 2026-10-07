/* ============================================================
   BRANCH TRANSFER
============================================================ */

const branchTransferState = {
    branches: [],
    products: [],
    selectedProducts: [],
    editingProductIndex: -1,
    loading: false,
    resolutions: []
};

function branchTransferById(id) {
    return document.getElementById(id);
}

function branchTransferEscapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function branchTransferNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function branchTransferFormatQuantity(value) {
    const number = branchTransferNumber(value);

    if (Number.isInteger(number)) {
        return String(number);
    }

    return number.toFixed(3).replace(/\.?0+$/, "");
}

function branchTransferOpenModal(id) {
    const modal = branchTransferById(id);

    if (!modal) return;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function branchTransferCloseModal(id) {
    const modal = branchTransferById(id);

    if (!modal) return;

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");

    if (!document.querySelector(".movement-modal.active")) {
        document.body.classList.remove("modal-open");
    }
}

function branchTransferShowMessage(message, type = "error") {
    if (typeof showToast === "function") {
        showToast(message, type);
        return;
    }

    if (typeof showNotification === "function") {
        showNotification(message, type);
        return;
    }

    alert(message);
}

async function branchTransferFetch(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(options.headers || {})
        }
    });

    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (
        response.redirected &&
        response.url.includes("/login")
    ) {
        window.location.href = "/login";
        throw new Error("Authentication required.");
    }

    if (response.status === 401) {
        window.location.href = "/login";
        throw new Error("Authentication required.");
    }

    if (!response.ok || !data?.success) {
        throw new Error(
            data?.message ||
            `Request failed with status ${response.status}.`
        );
    }

    return data;
}


/* ============================================================
   BRANCHES
============================================================ */

async function loadBranchTransferBranches() {
    try {
        const data = await branchTransferFetch(
            "/stock-movements/branch-transfer/branches"
        );

        branchTransferState.branches =
            Array.isArray(data.branches)
                ? data.branches
                : [];

        populateBranchTransferBranches();
        updateBranchTransferSummary();

    } catch (error) {
        console.error(
            "Branch Transfer - load branches error:",
            error
        );

        branchTransferShowMessage(
            error.message ||
            "Unable to load branches.",
            "error"
        );
    }
}

function populateBranchTransferBranches() {
    const sourceSelect =
        branchTransferById("sourceBranch");

    const destinationSelect =
        branchTransferById("destinationBranch");

    if (!sourceSelect || !destinationSelect) return;

    const currentSource = sourceSelect.value;
    const currentDestination = destinationSelect.value;

    sourceSelect.innerHTML =
        `<option value="">Select source branch</option>`;

    destinationSelect.innerHTML =
        `<option value="">Select destination branch</option>`;

    branchTransferState.branches.forEach(branch => {
        const option = document.createElement("option");

        option.value = branch.branch_id;
        option.textContent = branch.branch_name;

        if (branch.location) {
            option.dataset.location = branch.location;
        }

        sourceSelect.appendChild(
            option.cloneNode(true)
        );

        destinationSelect.appendChild(option);
    });

    if (
        currentSource &&
        [...sourceSelect.options].some(
            option => option.value === currentSource
        )
    ) {
        sourceSelect.value = currentSource;
    }

    if (
        currentDestination &&
        [...destinationSelect.options].some(
            option => option.value === currentDestination
        )
    ) {
        destinationSelect.value = currentDestination;
    }

    updateDestinationBranchOptions();
}

function updateDestinationBranchOptions() {
    const sourceSelect =
        branchTransferById("sourceBranch");

    const destinationSelect =
        branchTransferById("destinationBranch");

    if (!sourceSelect || !destinationSelect) return;

    const sourceBranchId = sourceSelect.value;

    [...destinationSelect.options].forEach(option => {
        if (!option.value) return;

        option.disabled =
            option.value === sourceBranchId;
    });

    if (
        destinationSelect.value === sourceBranchId
    ) {
        destinationSelect.value = "";
    }

    updateBranchTransferSummary();
}


/* ============================================================
   PRODUCTS
============================================================ */

async function loadBranchTransferProducts() {
    const sourceBranchId =
        branchTransferById("sourceBranch")?.value;

    if (!sourceBranchId) {
        branchTransferState.products = [];
        renderBranchTransferProductPicker();
        return;
    }

    try {
        const data = await branchTransferFetch(
            `/stock-movements/branch-transfer/products?source_branch_id=${encodeURIComponent(sourceBranchId)}`
        );

        branchTransferState.products =
            Array.isArray(data.products)
                ? data.products
                : [];

        renderBranchTransferProductPicker();

    } catch (error) {
        console.error(
            "Branch Transfer - load products error:",
            error
        );

        branchTransferShowMessage(
            error.message ||
            "Unable to load source-branch products.",
            "error"
        );
    }
}

function branchTransferProductSearchMatches(
    product,
    searchTerm
) {
    if (!searchTerm) return true;

    const values = [
        product.product_name,
        product.product_code,
        product.product_master_code,
        product.category,
        product.brand,
        product.unit
    ];

    return values.some(value =>
        String(value || "")
            .toLowerCase()
            .includes(searchTerm)
    );
}

function renderBranchTransferProductPicker() {
    const container =
        branchTransferById(
            "transferProductPickerList"
        );

    if (!container) return;

    const searchInput =
        branchTransferById(
            "transferProductSearch"
        );

    const searchTerm =
        String(searchInput?.value || "")
            .trim()
            .toLowerCase();

    const selectedIds = new Set(
        branchTransferState.selectedProducts.map(
            product =>
                String(product.product_id)
        )
    );

    const products =
        branchTransferState.products.filter(
            product =>
                branchTransferProductSearchMatches(
                    product,
                    searchTerm
                )
        );

    if (!products.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-box-open"></i>
                <p>No products available.</p>
                <span>
                    ${
                        searchTerm
                            ? "No products match your search."
                            : "Select a source branch first."
                    }
                </span>
            </div>
        `;

        return;
    }

    container.innerHTML = products.map(product => {
        const productId =
            String(product.product_id);

        const selected =
            selectedIds.has(productId);

        const availableQuantity =
            branchTransferNumber(
                product.quantity_available
            );

        const productCode =
            product.product_code ||
            product.product_master_code ||
            "No code";

        return `
            <div
                class="product-picker-item ${selected ? "selected" : ""}"
                data-transfer-product-id="${branchTransferEscapeHtml(productId)}"
            >
                <div class="product-picker-info">
                    <div class="product-picker-icon">
                        <i class="fa-solid fa-box"></i>
                    </div>

                    <div>
                        <strong>
                            ${branchTransferEscapeHtml(
                                product.product_name
                            )}
                        </strong>

                        <span>
                            Code:
                            ${branchTransferEscapeHtml(
                                productCode
                            )}
                        </span>

                        <span>
                            ${branchTransferEscapeHtml(
                                product.category || "Uncategorized"
                            )}
                            •
                            ${branchTransferEscapeHtml(
                                product.brand || "No brand"
                            )}
                            •
                            ${branchTransferEscapeHtml(
                                product.unit || "units"
                            )}
                        </span>

                        <span>
                            Available:
                            ${branchTransferFormatQuantity(
                                availableQuantity
                            )}
                            ${branchTransferEscapeHtml(
                                product.unit || "units"
                            )}
                        </span>
                    </div>
                </div>

                <button
                    type="button"
                    class="secondary-btn product-picker-add"
                    data-transfer-add-product="${branchTransferEscapeHtml(productId)}"
                    ${selected ? "disabled" : ""}
                >
                    <i class="fa-solid ${
                        selected
                            ? "fa-check"
                            : "fa-plus"
                    }"></i>

                    ${selected ? "Added" : "Add"}
                </button>
            </div>
        `;
    }).join("");
}


/* ============================================================
   BATCHES
============================================================ */

function branchTransferGetBatches(product) {
    if (!Array.isArray(product.batches)) {
        return [];
    }

    return product.batches.filter(batch =>
        branchTransferNumber(
            batch.quantity_available
        ) > 0
    );
}

function branchTransferRenderBatchOptions(product) {
    const batches =
        branchTransferGetBatches(product);

    if (!batches.length) {
        return `
            <option value="">
                FIFO - automatic batch allocation
            </option>
        `;
    }

    return `
        <option value="">
            FIFO - automatic batch allocation
        </option>

        ${batches.map(batch => `
            <option value="${branchTransferEscapeHtml(
                batch.stock_id
            )}">
                ${branchTransferEscapeHtml(
                    batch.batch_number || "Unnamed batch"
                )}
                -
                Available:
                ${branchTransferFormatQuantity(
                    batch.quantity_available
                )}
                ${branchTransferEscapeHtml(
                    product.unit || "units"
                )}
                ${
                    batch.expiry_date
                        ? ` - Exp: ${branchTransferEscapeHtml(
                            batch.expiry_date
                        )}`
                        : ""
                }
            </option>
        `).join("")}
    `;
}


/* ============================================================
   ADD PRODUCT
============================================================ */

function addBranchTransferProduct(productId) {
    const product =
        branchTransferState.products.find(
            item =>
                String(item.product_id) ===
                String(productId)
        );

    if (!product) {
        branchTransferShowMessage(
            "The selected product could not be found.",
            "error"
        );

        return;
    }

    const alreadySelected =
        branchTransferState.selectedProducts.some(
            item =>
                String(item.product_id) ===
                String(product.product_id)
        );

    if (alreadySelected) {
        branchTransferShowMessage(
            "This product has already been selected.",
            "error"
        );

        return;
    }

    const availableQuantity =
        branchTransferNumber(
            product.quantity_available
        );

    if (availableQuantity <= 0) {
        branchTransferShowMessage(
            "This product has no available stock.",
            "error"
        );

        return;
    }

    const batches =
        branchTransferGetBatches(product);

    branchTransferState.selectedProducts.push({
        product_id: product.product_id,
        product_master_id:
            product.product_master_id ||
            null,
        product_code:
            product.product_code ||
            product.product_master_code ||
            "",
        product_name:
            product.product_name,
        category:
            product.category || "",
        brand:
            product.brand || "",
        unit:
            product.unit || "units",
        cost_price:
            branchTransferNumber(
                product.cost_price
            ),
        selling_price:
            branchTransferNumber(
                product.selling_price
            ),
        quantity_available:
            availableQuantity,
        quantity: 1,
        stock_id:
            batches.length === 1
                ? batches[0].stock_id
                : null,
        batch_number:
            batches.length === 1
                ? batches[0].batch_number
                : null,
        destination_action:
            null,
        destination_product_id:
            null
    });

    renderBranchTransferSelectedProducts();
    renderBranchTransferProductPicker();
    updateBranchTransferSummary();
}


/* ============================================================
   SELECTED PRODUCTS
============================================================ */

function renderBranchTransferSelectedProducts() {
    const container =
        branchTransferById(
            "transferSelectedProducts"
        );

    if (!container) return;

    if (
        !branchTransferState.selectedProducts.length
    ) {
        container.innerHTML = `
            <div
                id="transferEmptyProducts"
                class="empty-state"
            >
                <i class="fa-solid fa-box-open"></i>
                <p>No products selected.</p>
                <span>
                    Add products from the source branch.
                </span>
            </div>
        `;

        return;
    }

    container.innerHTML =
        branchTransferState.selectedProducts
            .map((product, index) => {
                const batches =
                    branchTransferGetBatches(
                        product
                    );

                return `
                    <div
                        class="selected-product-item"
                        data-transfer-selected-index="${index}"
                    >
                        <div class="selected-product-info">
                            <div class="selected-product-icon">
                                <i class="fa-solid fa-box"></i>
                            </div>

                            <div>
                                <strong>
                                    ${branchTransferEscapeHtml(
                                        product.product_name
                                    )}
                                </strong>

                                <span>
                                    Code:
                                    ${branchTransferEscapeHtml(
                                        product.product_code ||
                                        "No code"
                                    )}
                                </span>

                                <span>
                                    Available:
                                    ${branchTransferFormatQuantity(
                                        product.quantity_available
                                    )}
                                    ${branchTransferEscapeHtml(
                                        product.unit
                                    )}
                                </span>
                            </div>
                        </div>

                        <div class="selected-product-middle">
                            <label>
                                Batch
                            </label>

                            <select
                                class="branch-transfer-batch-select"
                                data-transfer-batch-index="${index}"
                            >
                                ${branchTransferRenderBatchOptions(
                                    product
                                )}
                            </select>

                            ${
                                product.stock_id
                                    ? `
                                        <small>
                                            Selected:
                                            ${branchTransferEscapeHtml(
                                                product.batch_number ||
                                                "Batch"
                                            )}
                                        </small>
                                    `
                                    : `
                                        <small>
                                            FIFO allocation
                                        </small>
                                    `
                            }
                        </div>

                        <div class="selected-product-actions">
                            <div class="selected-product-quantity">
                                <strong>
                                    ${branchTransferFormatQuantity(
                                        product.quantity
                                    )}
                                </strong>

                                <span>
                                    ${branchTransferEscapeHtml(
                                        product.unit
                                    )}
                                </span>
                            </div>

                            <button
                                type="button"
                                class="icon-btn"
                                title="Edit quantity"
                                aria-label="Edit quantity"
                                data-transfer-edit-index="${index}"
                            >
                                <i class="fa-solid fa-pen"></i>
                            </button>

                            <button
                                type="button"
                                class="icon-btn danger"
                                title="Remove product"
                                aria-label="Remove product"
                                data-transfer-delete-index="${index}"
                            >
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            })
            .join("");
}


/* ============================================================
   BATCH SELECTION
============================================================ */

function setBranchTransferBatch(index, stockId) {
    const product =
        branchTransferState.selectedProducts[index];

    if (!product) return;

    if (!stockId) {
        product.stock_id = null;
        product.batch_number = null;

        renderBranchTransferSelectedProducts();
        return;
    }

    const batch =
        branchTransferGetBatches(product).find(
            item =>
                String(item.stock_id) ===
                String(stockId)
        );

    if (!batch) {
        branchTransferShowMessage(
            "The selected stock batch could not be found.",
            "error"
        );

        renderBranchTransferSelectedProducts();
        return;
    }

    product.stock_id = Number(
        batch.stock_id
    );

    product.batch_number =
        batch.batch_number || null;

    const batchAvailable =
        branchTransferNumber(
            batch.quantity_available
        );

    product.quantity_available =
        batchAvailable;

    if (
        product.quantity >
        batchAvailable
    ) {
        product.quantity =
            batchAvailable;
    }

    renderBranchTransferSelectedProducts();
    updateBranchTransferSummary();
}


/* ============================================================
   EDIT QUANTITY
============================================================ */

function openBranchTransferQuantityModal(index) {
    const product =
        branchTransferState.selectedProducts[index];

    if (!product) return;

    branchTransferState.editingProductIndex =
        index;

    const nameElement =
        branchTransferById(
            "transferQuantityProductName"
        );

    const availableElement =
        branchTransferById(
            "transferQuantityAvailable"
        );

    const unitElement =
        branchTransferById(
            "transferQuantityUnit"
        );

    const input =
        branchTransferById(
            "transferQuantityInput"
        );

    if (nameElement) {
        nameElement.textContent =
            product.product_name;
    }

    if (availableElement) {
        availableElement.textContent =
            branchTransferFormatQuantity(
                product.quantity_available
            );
    }

    if (unitElement) {
        unitElement.textContent =
            product.unit || "units";
    }

    if (input) {
        input.max =
            product.quantity_available;

        input.value =
            product.quantity;

        input.min = "0.001";
        input.step = "0.001";
    }

    branchTransferOpenModal(
        "transferQuantityModal"
    );

    setTimeout(() => {
        input?.focus();
        input?.select();
    }, 50);
}

function saveBranchTransferQuantity() {
    const index =
        branchTransferState.editingProductIndex;

    const product =
        branchTransferState.selectedProducts[index];

    const input =
        branchTransferById(
            "transferQuantityInput"
        );

    if (!product || !input) return;

    const quantity =
        branchTransferNumber(
            input.value
        );

    if (quantity <= 0) {
        branchTransferShowMessage(
            "Enter a valid transfer quantity.",
            "error"
        );

        return;
    }

    if (
        quantity >
        product.quantity_available
    ) {
        branchTransferShowMessage(
            "Transfer quantity cannot exceed the available stock for the selected batch.",
            "error"
        );

        return;
    }

    product.quantity = quantity;

    branchTransferState.editingProductIndex =
        -1;

    branchTransferCloseModal(
        "transferQuantityModal"
    );

    renderBranchTransferSelectedProducts();
    updateBranchTransferSummary();
}


/* ============================================================
   DELETE PRODUCT
============================================================ */

function deleteBranchTransferProduct(index) {
    if (
        index < 0 ||
        index >=
            branchTransferState.selectedProducts.length
    ) {
        return;
    }

    branchTransferState.selectedProducts.splice(
        index,
        1
    );

    renderBranchTransferSelectedProducts();
    renderBranchTransferProductPicker();
    updateBranchTransferSummary();
}


/* ============================================================
   SUMMARY
============================================================ */

function updateBranchTransferSummary() {
    const sourceSelect =
        branchTransferById("sourceBranch");

    const destinationSelect =
        branchTransferById("destinationBranch");

    const sourceName =
        sourceSelect
            ?.selectedOptions[0]
            ?.textContent
            ?.trim() || "—";

    const destinationName =
        destinationSelect
            ?.selectedOptions[0]
            ?.textContent
            ?.trim() || "—";

    const productCount =
        branchTransferState.selectedProducts.length;

    const totalQuantity =
        branchTransferState.selectedProducts.reduce(
            (total, product) =>
                total +
                branchTransferNumber(
                    product.quantity
                ),
            0
        );

    const productsElement =
        branchTransferById(
            "transferSummaryProducts"
        );

    const quantityElement =
        branchTransferById(
            "transferSummaryQuantity"
        );

    const sourceElement =
        branchTransferById(
            "transferSummarySource"
        );

    const destinationElement =
        branchTransferById(
            "transferSummaryDestination"
        );

    if (productsElement) {
        productsElement.textContent =
            productCount;
    }

    if (quantityElement) {
        quantityElement.textContent =
            branchTransferFormatQuantity(
                totalQuantity
            );
    }

    if (sourceElement) {
        sourceElement.textContent =
            sourceSelect?.value
                ? sourceName
                : "—";
    }

    if (destinationElement) {
        destinationElement.textContent =
            destinationSelect?.value
                ? destinationName
                : "—";
    }
}


/* ============================================================
   DESTINATION PRODUCT RESOLUTION
============================================================ */

function branchTransferEnsureResolutionModal() {
    let modal =
        branchTransferById("branchTransferResolutionModal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "branchTransferResolutionModal";
        modal.className = "movement-modal";
        modal.setAttribute("aria-hidden", "true");

        modal.innerHTML = `
            <div class="movement-modal-overlay"></div>

            <div class="movement-modal-content">
                <div class="movement-modal-header">
                    <div>
                        <h3>Destination Product Review</h3>
                        <p>
                            Review how each source product should be represented at the destination branch.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="icon-btn"
                        id="closeBranchTransferResolution"
                        aria-label="Close"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div
                    id="branchTransferResolutionBody"
                    class="movement-modal-body"
                ></div>

                <div class="movement-modal-footer">
                    <button
                        type="button"
                        class="secondary-btn"
                        id="cancelBranchTransferResolution"
                    >
                        Cancel Transfer
                    </button>

                    <button
                        type="button"
                        class="primary-btn"
                        id="continueBranchTransferResolution"
                    >
                        Continue
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /*
    |--------------------------------------------------------------------------
    | Support both the older HBS modal and the dynamic modal.
    |--------------------------------------------------------------------------
    */
    let content =
        modal.querySelector("#branchTransferResolutionBody") ||
        modal.querySelector("#branchTransferResolutionList");

    if (!content) {
        content = document.createElement("div");
        content.id = "branchTransferResolutionBody";
        content.className = "movement-modal-body";

        const footer =
            modal.querySelector(".movement-modal-footer");

        if (footer) {
            footer.parentNode.insertBefore(content, footer);
        } else {
            const container =
                modal.querySelector(
                    ".movement-modal-container, .movement-modal-content"
                ) || modal;

            container.appendChild(content);
        }
    }

    if (!modal.dataset.branchTransferResolutionBound) {
        modal.dataset.branchTransferResolutionBound = "true";

        modal.querySelector(
            "#closeBranchTransferResolution"
        )?.addEventListener(
            "click",
            cancelBranchTransferResolution
        );

        modal.querySelector(
            "#cancelBranchTransferResolution"
        )?.addEventListener(
            "click",
            cancelBranchTransferResolution
        );

        modal.querySelector(
            "#continueBranchTransferResolution"
        )?.addEventListener(
            "click",
            applyBranchTransferResolutions
        );

        modal.querySelector(
            ".movement-modal-overlay"
        )?.addEventListener(
            "click",
            cancelBranchTransferResolution
        );
    }

    return modal;
}

function branchTransferGetResolutionContainer(modal) {
    return (
        modal?.querySelector("#branchTransferResolutionBody") ||
        modal?.querySelector("#branchTransferResolutionList") ||
        null
    );
}

function branchTransferSetResolutionLoading(message = "Checking destination products...") {
    const modal =
        branchTransferEnsureResolutionModal();

    const container =
        branchTransferGetResolutionContainer(modal);

    if (!container) return;

    container.innerHTML = `
        <div class="empty-state branch-transfer-resolution-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>${branchTransferEscapeHtml(message)}</p>
            <span>Please wait while the destination branch is checked.</span>
        </div>
    `;
}

function branchTransferResolutionOptionHtml(
    value,
    label,
    disabled = false,
    selected = false
) {
    return `
        <option
            value="${branchTransferEscapeHtml(value)}"
            ${disabled ? "disabled" : ""}
            ${selected ? "selected" : ""}
        >
            ${branchTransferEscapeHtml(label)}
        </option>
    `;
}

function renderBranchTransferResolutionModal(resolutions) {
    const modal =
        branchTransferEnsureResolutionModal();

    const container =
        branchTransferGetResolutionContainer(modal);

    if (!container) {
        throw new Error(
            "Destination Product Review container was not found."
        );
    }

    const canApprove =
        branchTransferState.resolutionCanApprove !== false;

    container.innerHTML = resolutions.map(
        (resolution, index) => {
            const product =
                resolution.source_product ||
                resolution.product ||
                {};

            const candidates =
                Array.isArray(resolution.candidates)
                    ? resolution.candidates
                    : [];

            const status =
                resolution.status ||
                resolution.result ||
                "REVIEW_REQUIRED";

            const exact =
                status === "EXACT_MATCH";

            const noMatch =
                status === "NO_MATCH";

            const candidateOptions = candidates
                .map(candidate => {
                    const code =
                        candidate.product_code ||
                        candidate.product_master_code ||
                        "No code";

                    const name =
                        candidate.product_name ||
                        "Destination product";

                    const brand = candidate.brand
                        ? ` • ${candidate.brand}`
                        : "";

                    return branchTransferResolutionOptionHtml(
                        candidate.product_id,
                        `${code} - ${name}${brand}`
                    );
                })
                .join("");

            let actionOptions = "";

            if (exact) {
                actionOptions = branchTransferResolutionOptionHtml(
                    "USE_EXISTING",
                    "Use Existing Destination Product",
                    false,
                    true
                );
            } else if (canApprove) {
                if (candidates.length) {
                    actionOptions +=
                        branchTransferResolutionOptionHtml(
                            "USE_EXISTING",
                            "Use Existing Destination Product",
                            false,
                            true
                        );
                }

                actionOptions +=
                    branchTransferResolutionOptionHtml(
                        "CREATE_NEW",
                        "Create New Destination Product",
                        false,
                        !candidates.length
                    );

                actionOptions +=
                    branchTransferResolutionOptionHtml(
                        "CANCEL",
                        "Cancel Transfer"
                    );
            } else {
                actionOptions =
                    branchTransferResolutionOptionHtml(
                        "CANCEL",
                        "Cancel Transfer",
                        false,
                        true
                    );
            }

            const sourceName =
                product.product_name ||
                resolution.product_name ||
                "Product";

            const sourceCode =
                product.product_code ||
                product.product_master_code ||
                "No code";

            return `
                <div
                    class="branch-transfer-resolution-card"
                    data-resolution-index="${index}"
                >
                    <div class="resolution-product-header">
                        <strong>
                            ${branchTransferEscapeHtml(sourceName)}
                        </strong>

                        <span>
                            Source code:
                            ${branchTransferEscapeHtml(sourceCode)}
                        </span>

                        <span>
                            Destination status:
                            ${branchTransferEscapeHtml(status)}
                        </span>
                    </div>

                    ${
                        exact
                            ? `
                                <div class="resolution-status exact">
                                    <i class="fa-solid fa-circle-check"></i>
                                    Exact product master found. The matching destination product will be used automatically.
                                </div>
                            `
                            : `
                                <div class="resolution-choice">
                                    <label for="branchTransferResolutionAction${index}">
                                        Destination action
                                    </label>

                                    <select
                                        id="branchTransferResolutionAction${index}"
                                        class="branch-transfer-resolution-action"
                                        data-resolution-action="${index}"
                                        ${canApprove ? "" : "disabled"}
                                    >
                                        ${actionOptions}
                                    </select>
                                </div>

                                <div
                                    class="resolution-existing-product"
                                    data-resolution-existing="${index}"
                                >
                                    ${
                                        candidates.length
                                            ? `
                                                <label for="branchTransferResolutionProduct${index}">
                                                    Existing destination product
                                                </label>

                                                <select
                                                    id="branchTransferResolutionProduct${index}"
                                                    class="branch-transfer-resolution-product"
                                                    data-resolution-product="${index}"
                                                >
                                                    <option value="">
                                                        Select destination product
                                                    </option>
                                                    ${candidateOptions}
                                                </select>
                                            `
                                            : `
                                                <div class="resolution-status">
                                                    No similar destination product was found.
                                                    ${
                                                        canApprove
                                                            ? "An authorized user may create a new destination product."
                                                            : "An authorized owner or administrator must review this transfer."
                                                    }
                                                </div>
                                            `
                                    }
                                </div>

                                ${
                                    !canApprove
                                        ? `
                                            <div class="resolution-status warning">
                                                <i class="fa-solid fa-lock"></i>
                                                This product requires owner/administrator approval before the transfer can continue.
                                            </div>
                                        `
                                        : noMatch
                                            ? `
                                                <div class="resolution-status">
                                                    <i class="fa-solid fa-circle-info"></i>
                                                    No destination product currently shares this product identity.
                                                </div>
                                            `
                                            : `
                                                <div class="resolution-status warning">
                                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                                    Similar destination products were found. Review carefully before proceeding.
                                                </div>
                                            `
                                }
                            `
                    }
                </div>
            `;
        }
    ).join("");

    container.querySelectorAll(
        ".branch-transfer-resolution-action"
    ).forEach(select => {
        select.addEventListener(
            "change",
            event => {
                const index = Number(
                    event.target.dataset.resolutionAction
                );

                updateBranchTransferResolutionChoice(index);
            }
        );
    });

    resolutions.forEach(
        (_, index) =>
            updateBranchTransferResolutionChoice(index)
    );
}

function updateBranchTransferResolutionChoice(index) {
    const modal =
        branchTransferById("branchTransferResolutionModal");

    const action =
        modal?.querySelector(
            `[data-resolution-action="${index}"]`
        );

    const existing =
        modal?.querySelector(
            `[data-resolution-existing="${index}"]`
        );

    if (!action || !existing) return;

    existing.style.display =
        action.value === "USE_EXISTING"
            ? ""
            : "none";
}

function cancelBranchTransferResolution() {
    branchTransferState.resolutions = [];
    branchTransferState.resolutionCanApprove = false;

    branchTransferCloseModal(
        "branchTransferResolutionModal"
    );
}

function applyBranchTransferResolutions() {
    const resolutions =
        branchTransferState.resolutions;

    if (!resolutions.length) {
        branchTransferCloseModal(
            "branchTransferResolutionModal"
        );
        return;
    }

    const modal =
        branchTransferById("branchTransferResolutionModal");

    const canApprove =
        branchTransferState.resolutionCanApprove !== false;

    for (
        let index = 0;
        index < resolutions.length;
        index++
    ) {
        const resolution =
            resolutions[index];

        const status =
            resolution.status ||
            resolution.result;

        const sourceProduct =
            resolution.source_product ||
            resolution.product ||
            {};

        const selected =
            branchTransferState.selectedProducts.find(
                item =>
                    String(item.product_id) ===
                    String(sourceProduct.product_id)
            );

        if (!selected) {
            continue;
        }

        if (status === "EXACT_MATCH") {
            const exactProduct =
                resolution.destination_product ||
                resolution.destinationProduct ||
                {};

            selected.destination_action =
                "USE_EXISTING";

            selected.destination_product_id =
                exactProduct.product_id ||
                resolution.destination_product_id ||
                null;

            continue;
        }

        if (!canApprove) {
            branchTransferShowMessage(
                "This transfer requires owner or administrator approval before it can continue.",
                "error"
            );
            return;
        }

        const action =
            modal?.querySelector(
                `[data-resolution-action="${index}"]`
            )?.value;

        if (!action) {
            branchTransferShowMessage(
                "Choose an action for every destination product.",
                "error"
            );
            return;
        }

        if (action === "CANCEL") {
            cancelBranchTransferResolution();
            return;
        }

        selected.destination_action = action;

        if (action === "USE_EXISTING") {
            const destinationProductId =
                modal?.querySelector(
                    `[data-resolution-product="${index}"]`
                )?.value;

            if (!destinationProductId) {
                branchTransferShowMessage(
                    "Select the destination product to use.",
                    "error"
                );
                return;
            }

            selected.destination_product_id =
                Number(destinationProductId);
        } else if (action === "CREATE_NEW") {
            selected.destination_product_id = null;
        } else {
            branchTransferShowMessage(
                "Invalid destination product action.",
                "error"
            );
            return;
        }
    }

    branchTransferCloseModal(
        "branchTransferResolutionModal"
    );

    openBranchTransferFinalConfirmation();
}


/* ============================================================
   RESOLVE PRODUCTS
============================================================ */

async function resolveBranchTransferProducts() {
    const sourceBranchId =
        branchTransferById(
            "sourceBranch"
        )?.value;

    const destinationBranchId =
        branchTransferById(
            "destinationBranch"
        )?.value;

    if (!sourceBranchId || !destinationBranchId) {
        throw new Error(
            "Select both source and destination branches."
        );
    }

    const products =
        branchTransferState.selectedProducts.map(
            product => ({
                product_id:
                    Number(product.product_id),

                quantity:
                    Number(product.quantity),

                stock_id:
                    product.stock_id
                        ? Number(product.stock_id)
                        : null
            })
        );

    if (!products.length) {
        throw new Error(
            "Add at least one product to the transfer."
        );
    }

    const modal =
        branchTransferEnsureResolutionModal();

    branchTransferSetResolutionLoading();

    branchTransferOpenModal(
        "branchTransferResolutionModal"
    );

    try {
        const data =
            await branchTransferFetch(
                "/stock-movements/branch-transfer/resolve",
                {
                    method: "POST",

                    body: JSON.stringify({
                        source_branch_id:
                            Number(sourceBranchId),

                        destination_branch_id:
                            Number(destinationBranchId),

                        products
                    })
                }
            );

        branchTransferState.resolutions =
            Array.isArray(data.resolutions)
                ? data.resolutions
                : Array.isArray(data.products)
                    ? data.products
                    : [];

        branchTransferState.resolutionCanApprove =
            data.can_approve !== false;

        if (!branchTransferState.resolutions.length) {
            branchTransferCloseModal(
                "branchTransferResolutionModal"
            );

            openBranchTransferFinalConfirmation();
            return;
        }

        const requiresReview =
            branchTransferState.resolutions.some(
                resolution => {
                    const status =
                        resolution.status ||
                        resolution.result;

                    return status !== "EXACT_MATCH";
                }
            );

        if (requiresReview) {
            renderBranchTransferResolutionModal(
                branchTransferState.resolutions
            );

            branchTransferOpenModal(
                "branchTransferResolutionModal"
            );

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Every product matched exactly. Apply the destination product IDs
        | automatically and move directly to final confirmation.
        |--------------------------------------------------------------------------
        */
        branchTransferState.resolutions.forEach(
            resolution => {
                const sourceProduct =
                    resolution.source_product ||
                    resolution.product ||
                    {};

                const destinationProduct =
                    resolution.destination_product ||
                    resolution.destinationProduct ||
                    {};

                const selected =
                    branchTransferState.selectedProducts.find(
                        item =>
                            String(item.product_id) ===
                            String(sourceProduct.product_id)
                    );

                if (!selected) return;

                selected.destination_action =
                    "USE_EXISTING";

                selected.destination_product_id =
                    destinationProduct.product_id ||
                    resolution.destination_product_id ||
                    null;
            }
        );

        branchTransferCloseModal(
            "branchTransferResolutionModal"
        );

        openBranchTransferFinalConfirmation();
    } catch (error) {
        console.error(
            "Branch Transfer - destination resolution error:",
            error
        );

        branchTransferCloseModal(
            "branchTransferResolutionModal"
        );

        throw error;
    }
}


/* ============================================================
   FINAL CONFIRMATION
============================================================ */

function openBranchTransferFinalConfirmation() {
    const sourceBranchId =
        branchTransferById(
            "sourceBranch"
        )?.value;

    const destinationBranchId =
        branchTransferById(
            "destinationBranch"
        )?.value;

    const sourceName =
        branchTransferById(
            "sourceBranch"
        )
            ?.selectedOptions[0]
            ?.textContent
            ?.trim() || "—";

    const destinationName =
        branchTransferById(
            "destinationBranch"
        )
            ?.selectedOptions[0]
            ?.textContent
            ?.trim() || "—";

    const totalQuantity =
        branchTransferState.selectedProducts.reduce(
            (total, product) =>
                total +
                branchTransferNumber(
                    product.quantity
                ),
            0
        );

    const confirmSource =
        branchTransferById(
            "transferConfirmSource"
        );

    const confirmDestination =
        branchTransferById(
            "transferConfirmDestination"
        );

    const confirmProducts =
        branchTransferById(
            "transferConfirmProducts"
        );

    const confirmQuantity =
        branchTransferById(
            "transferConfirmQuantity"
        );

    if (confirmSource) {
        confirmSource.textContent =
            sourceName;
    }

    if (confirmDestination) {
        confirmDestination.textContent =
            destinationName;
    }

    if (confirmProducts) {
        confirmProducts.textContent =
            branchTransferState
                .selectedProducts.length;
    }

    if (confirmQuantity) {
        confirmQuantity.textContent =
            branchTransferFormatQuantity(
                totalQuantity
            );
    }

    renderBranchTransferConfirmationProducts();

    branchTransferOpenModal(
        "branchTransferConfirmationModal"
    );
}

function openBranchTransferConfirmation() {
    const sourceBranchId =
        branchTransferById(
            "sourceBranch"
        )?.value;

    const destinationBranchId =
        branchTransferById(
            "destinationBranch"
        )?.value;

    if (!sourceBranchId) {
        branchTransferShowMessage(
            "Select a source branch first.",
            "error"
        );

        return;
    }

    if (!destinationBranchId) {
        branchTransferShowMessage(
            "Select a destination branch first.",
            "error"
        );

        return;
    }

    if (
        sourceBranchId ===
        destinationBranchId
    ) {
        branchTransferShowMessage(
            "Source and destination branches must be different.",
            "error"
        );

        return;
    }

    if (
        !branchTransferState.selectedProducts.length
    ) {
        branchTransferShowMessage(
            "Add at least one product to the transfer.",
            "error"
        );

        return;
    }

    const invalidProduct =
        branchTransferState.selectedProducts.find(
            product =>
                product.quantity <= 0 ||
                product.quantity >
                    product.quantity_available
        );

    if (invalidProduct) {
        branchTransferShowMessage(
            `Invalid quantity for ${invalidProduct.product_name}.`,
            "error"
        );

        return;
    }

    resolveBranchTransferProducts()
        .catch(error => {
            console.error(
                "Branch Transfer - resolution error:",
                error
            );

            branchTransferShowMessage(
                error.message ||
                "Unable to resolve destination products.",
                "error"
            );
        });
}

function renderBranchTransferConfirmationProducts() {
    const container =
        branchTransferById(
            "transferConfirmationProductsList"
        );

    if (!container) return;

    container.innerHTML =
        branchTransferState.selectedProducts
            .map(product => `
                <div class="confirmation-product-item">
                    <div>
                        <strong>
                            ${branchTransferEscapeHtml(
                                product.product_name
                            )}
                        </strong>

                        <span>
                            Code:
                            ${branchTransferEscapeHtml(
                                product.product_code ||
                                "No code"
                            )}
                        </span>

                        <span>
                            ${branchTransferFormatQuantity(
                                product.quantity
                            )}
                            ${branchTransferEscapeHtml(
                                product.unit
                            )}
                            ${
                                product.batch_number
                                    ? ` • ${branchTransferEscapeHtml(
                                        product.batch_number
                                    )}`
                                    : " • FIFO"
                            }
                        </span>

                        <span>
                            Destination:
                            ${
                                product.destination_action ===
                                "CREATE_NEW"
                                    ? "Create new product"
                                    : product.destination_product_id
                                        ? `Use existing product #${product.destination_product_id}`
                                        : "Automatic"
                            }
                        </span>
                    </div>
                </div>
            `)
            .join("");
}


/* ============================================================
   SUBMIT TRANSFER
============================================================ */

async function confirmBranchTransfer() {
    if (branchTransferState.loading) {
        return;
    }

    const sourceBranchId =
        branchTransferById(
            "sourceBranch"
        )?.value;

    const destinationBranchId =
        branchTransferById(
            "destinationBranch"
        )?.value;

    const notes =
        branchTransferById(
            "branchTransferNotes"
        )?.value?.trim() || "";

    if (
        !sourceBranchId ||
        !destinationBranchId
    ) {
        branchTransferShowMessage(
            "Select both source and destination branches.",
            "error"
        );

        return;
    }

    if (
        sourceBranchId ===
        destinationBranchId
    ) {
        branchTransferShowMessage(
            "Source and destination branches must be different.",
            "error"
        );

        return;
    }

    if (
        !branchTransferState.selectedProducts.length
    ) {
        branchTransferShowMessage(
            "Add at least one product.",
            "error"
        );

        return;
    }

    const products =
        branchTransferState.selectedProducts
            .map(product => ({
                product_id:
                    Number(product.product_id),

                stock_id:
                    product.stock_id
                        ? Number(product.stock_id)
                        : null,

                quantity:
                    Number(product.quantity),

                destination_action:
                    product.destination_action ||
                    null,

                destination_product_id:
                    product.destination_product_id
                        ? Number(
                            product.destination_product_id
                        )
                        : null
            }));

    try {
        branchTransferState.loading = true;

        const confirmButton =
            branchTransferById(
                "confirmBranchTransferBtn"
            );

        if (confirmButton) {
            confirmButton.disabled = true;

            confirmButton.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Processing...
            `;
        }

        const data =
            await branchTransferFetch(
                "/stock-movements/branch-transfer",
                {
                    method: "POST",

                    body: JSON.stringify({
                        source_branch_id:
                            Number(sourceBranchId),

                        destination_branch_id:
                            Number(destinationBranchId),

                        products,

                        notes
                    })
                }
            );

        branchTransferCloseModal(
            "branchTransferConfirmationModal"
        );

        branchTransferShowMessage(
            data.message ||
            "Branch transfer completed successfully.",
            "success"
        );

        clearBranchTransfer(false);

        await loadBranchTransferProducts();

    } catch (error) {
        console.error(
            "Branch Transfer - submit error:",
            error
        );

        branchTransferShowMessage(
            error.message ||
            "Unable to complete branch transfer.",
            "error"
        );

    } finally {
        branchTransferState.loading = false;

        const confirmButton =
            branchTransferById(
                "confirmBranchTransferBtn"
            );

        if (confirmButton) {
            confirmButton.disabled = false;

            confirmButton.innerHTML = `
                <i class="fa-solid fa-check"></i>
                Confirm Transfer
            `;
        }
    }
}


/* ============================================================
   CLEAR
============================================================ */

function clearBranchTransfer(
    closeModals = true
) {
    branchTransferState.selectedProducts = [];
    branchTransferState.editingProductIndex = -1;
    branchTransferState.resolutions = [];

    const sourceSelect =
        branchTransferById(
            "sourceBranch"
        );

    const destinationSelect =
        branchTransferById(
            "destinationBranch"
        );

    const notes =
        branchTransferById(
            "branchTransferNotes"
        );

    const searchInput =
        branchTransferById(
            "transferProductSearch"
        );

    if (sourceSelect) {
        sourceSelect.value = "";
    }

    if (destinationSelect) {
        destinationSelect.value = "";
    }

    if (notes) {
        notes.value = "";
    }

    if (searchInput) {
        searchInput.value = "";
    }

    branchTransferState.products = [];

    renderBranchTransferSelectedProducts();
    renderBranchTransferProductPicker();
    updateBranchTransferSummary();

    if (closeModals) {
        branchTransferCloseModal(
            "transferProductPickerModal"
        );

        branchTransferCloseModal(
            "transferQuantityModal"
        );

        branchTransferCloseModal(
            "branchTransferConfirmationModal"
        );

        branchTransferCloseModal(
            "branchTransferResolutionModal"
        );
    }
}


/* ============================================================
   EVENT LISTENERS
============================================================ */

function initializeBranchTransfer() {
    const sourceBranch =
        branchTransferById(
            "sourceBranch"
        );

    const destinationBranch =
        branchTransferById(
            "destinationBranch"
        );

    const openProductPicker =
        branchTransferById(
            "openTransferProductPickerBtn"
        );

    const closeProductPicker =
        branchTransferById(
            "closeTransferProductPicker"
        );

    const cancelProductPicker =
        branchTransferById(
            "cancelTransferProductPicker"
        );

    const productSearch =
        branchTransferById(
            "transferProductSearch"
        );

    const saveQuantity =
        branchTransferById(
            "saveTransferQuantity"
        );

    const cancelQuantity =
        branchTransferById(
            "cancelTransferQuantity"
        );

    const closeQuantity =
        branchTransferById(
            "closeTransferQuantityModal"
        );

    const clearButton =
        branchTransferById(
            "clearBranchTransferBtn"
        );

    const reviewButton =
        branchTransferById(
            "viewBranchTransferSummaryBtn"
        );

    const closeConfirmation =
        branchTransferById(
            "closeBranchTransferConfirmation"
        );

    const cancelConfirmation =
        branchTransferById(
            "cancelBranchTransferConfirmation"
        );

    const confirmButton =
        branchTransferById(
            "confirmBranchTransferBtn"
        );

    sourceBranch?.addEventListener(
        "change",
        async () => {
            updateDestinationBranchOptions();

            branchTransferState.selectedProducts = [];

            renderBranchTransferSelectedProducts();
            updateBranchTransferSummary();

            await loadBranchTransferProducts();
        }
    );

    destinationBranch?.addEventListener(
        "change",
        updateBranchTransferSummary
    );

    openProductPicker?.addEventListener(
        "click",
        async () => {
            if (!sourceBranch?.value) {
                branchTransferShowMessage(
                    "Select a source branch first.",
                    "error"
                );

                return;
            }

            branchTransferOpenModal(
                "transferProductPickerModal"
            );

            await loadBranchTransferProducts();
        }
    );

    closeProductPicker?.addEventListener(
        "click",
        () => {
            branchTransferCloseModal(
                "transferProductPickerModal"
            );
        }
    );

    cancelProductPicker?.addEventListener(
        "click",
        () => {
            branchTransferCloseModal(
                "transferProductPickerModal"
            );
        }
    );

    productSearch?.addEventListener(
        "input",
        renderBranchTransferProductPicker
    );

    document.addEventListener(
        "click",
        event => {
            const addButton =
                event.target.closest(
                    "[data-transfer-add-product]"
                );

            if (addButton) {
                addBranchTransferProduct(
                    addButton.dataset
                        .transferAddProduct
                );

                renderBranchTransferProductPicker();
                return;
            }

            const editButton =
                event.target.closest(
                    "[data-transfer-edit-index]"
                );

            if (editButton) {
                openBranchTransferQuantityModal(
                    Number(
                        editButton.dataset
                            .transferEditIndex
                    )
                );

                return;
            }

            const deleteButton =
                event.target.closest(
                    "[data-transfer-delete-index]"
                );

            if (deleteButton) {
                deleteBranchTransferProduct(
                    Number(
                        deleteButton.dataset
                            .transferDeleteIndex
                    )
                );
            }
        }
    );

    document.addEventListener(
        "change",
        event => {
            const batchSelect =
                event.target.closest(
                    ".branch-transfer-batch-select"
                );

            if (!batchSelect) return;

            setBranchTransferBatch(
                Number(
                    batchSelect.dataset
                        .transferBatchIndex
                ),
                batchSelect.value
            );
        }
    );

    saveQuantity?.addEventListener(
        "click",
        saveBranchTransferQuantity
    );

    cancelQuantity?.addEventListener(
        "click",
        () => {
            branchTransferCloseModal(
                "transferQuantityModal"
            );
        }
    );

    closeQuantity?.addEventListener(
        "click",
        () => {
            branchTransferCloseModal(
                "transferQuantityModal"
            );
        }
    );

    clearButton?.addEventListener(
        "click",
        () => {
            clearBranchTransfer();
        }
    );

    reviewButton?.addEventListener(
        "click",
        openBranchTransferConfirmation
    );

    closeConfirmation?.addEventListener(
        "click",
        () => {
            branchTransferCloseModal(
                "branchTransferConfirmationModal"
            );
        }
    );

    cancelConfirmation?.addEventListener(
        "click",
        () => {
            branchTransferCloseModal(
                "branchTransferConfirmationModal"
            );
        }
    );

    confirmButton?.addEventListener(
        "click",
        confirmBranchTransfer
    );

    document.querySelectorAll(
        "#transferProductPickerModal .movement-modal-overlay, " +
        "#transferQuantityModal .movement-modal-overlay, " +
        "#branchTransferConfirmationModal .movement-modal-overlay, " +
        "#branchTransferResolutionModal .movement-modal-overlay"
    ).forEach(overlay => {
        overlay.addEventListener(
            "click",
            event => {
                const modal =
                    event.currentTarget.closest(
                        ".movement-modal"
                    );

                if (modal?.id) {
                    branchTransferCloseModal(
                        modal.id
                    );
                }
            }
        );
    });

    renderBranchTransferSelectedProducts();
    renderBranchTransferProductPicker();
    updateBranchTransferSummary();

    branchTransferEnsureResolutionModal();

    loadBranchTransferBranches();
}


/* ============================================================
   INITIALIZE
============================================================ */

if (
    document.readyState === "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeBranchTransfer
    );
} else {
    initializeBranchTransfer();
}