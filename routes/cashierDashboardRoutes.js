const express = require("express");

const router = express.Router();

const cashierDashboardController =
    require("../controllers/cashierDashboard");


// CASHIER DASHBOARD

router.get(
    "/cashier-dashboard",
    cashierDashboardController.getCashierDashboard
);


module.exports = router;