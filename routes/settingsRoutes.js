// ============================================================
// MARKETFLOW — SETTINGS ROUTES
// ============================================================

const express = require('express');

const router = express.Router();

const settingsController =
    require('../controllers/settingsController');

const requireAuth =
    require('../middleware/requireAuth');


// ============================================================
// AUTHENTICATION
// ============================================================
//
// Every settings route requires an authenticated user.
//
// Business and branch identity will come from:
//     req.user.business_id
//     req.user.branch_id
//
// They must NOT come from the browser.
// ============================================================

router.use(requireAuth);


// ============================================================
// SETTINGS PAGE
// ============================================================

router.get(
    '/settings',
    settingsController.getSettings
);

router.get(
    '/settings/managers/search',
    settingsController.searchManagers
);

router.post(
    '/settings/tax-discount',
    settingsController.updateTaxDiscount
);


// ============================================================
// TAX & TRANSACTION DISCOUNT HISTORY
// ============================================================

router.get(
    '/settings/tax-discount/history',
    settingsController.getTaxDiscountHistory
);


// ============================================================
// PRODUCT DISCOUNT SETTINGS
// ============================================================

router.get(
    '/settings/product-discounts',
    settingsController.getProductDiscountSettings
);

router.get(
    '/settings/product-discounts/search',
    settingsController.searchProductDiscountSettings
);


// IMPORTANT:
// Keep sync-names BEFORE :product_id

router.put(
    '/settings/product-discounts/sync-names',
    settingsController.syncProductDiscountNames
);

router.get(
    '/settings/product-discounts/:product_id',
    settingsController.getProductDiscountSetting
);

router.put(
    '/settings/product-discounts/:product_id',
    settingsController.updateProductDiscountSetting
);


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;