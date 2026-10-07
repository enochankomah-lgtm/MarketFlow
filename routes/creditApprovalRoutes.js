"use strict";

const express = require("express");

const router = express.Router();

const requireAuth = require("../middleware/requireAuth");

const requireCreditAdmin = require("../middleware/requireCreditAdmin");

const creditApprovalController = require("../controllers/creditApprovalController");

router.get(
    "/",
    requireAuth,
    requireCreditAdmin,
    creditApprovalController.getCreditRequests
);

router.post("/:requestId/approve", requireAuth,  requireCreditAdmin,  creditApprovalController.approveCreditRequest);


router.post(
    "/:requestId/reject",
    requireAuth,
    requireCreditAdmin,
    creditApprovalController.rejectCreditRequest
);

router.post(
    "/:requestId/settle",
    requireAuth,
    requireCreditAdmin,
    creditApprovalController.settleCreditRequest
);


module.exports = router;