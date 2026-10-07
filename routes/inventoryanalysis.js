const express = require("express");

const router = express.Router();

const inventoryAnalysis = require("../controllers/inventorydashboard");

/* ============================================================
   INVENTORY ANALYSIS PAGE
   ============================================================ */

router.get(
    "/inventoryanalyst",
    inventoryAnalysis.inventoryDashboard
);

module.exports = router;