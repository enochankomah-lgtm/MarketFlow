const express = require("express");

const router = express.Router();

const dashboardController =  require("../controllers/RevenueProfitableAnalysis");

router.get( "/profitabledashboard",  dashboardController.getDashboard
);

module.exports = router;