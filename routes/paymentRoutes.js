"use strict";

const express = require("express");

const router = express.Router();

const paymentController =
    require("../controllers/paymentController");

const splitPaymentController =
    require("../controllers/splitPaymentController");



router.get(
    "/test-paystack",
    paymentController.testPaystack
);


router.post(
    "/mobile-money",
    paymentController.initiateMobileMoneyPayment
);


router.get(
    "/mobile-money/status/:reference",
    paymentController.checkMobileMoneyStatus
);


router.post(
    "/split",
    splitPaymentController.createSplitSale
);

router.post(
    "/split/:saleId/payment",
    splitPaymentController.addPayment
);

router.get(
    "/split/:saleId",
    splitPaymentController.getPaymentSummary
);


router.post(
    "/split/:saleId/pay-later",
    splitPaymentController.requestPayLater
);


router.post(
    "/split/payment/:paymentId/cancel",
    splitPaymentController.cancelPendingPayment
);


module.exports = router;