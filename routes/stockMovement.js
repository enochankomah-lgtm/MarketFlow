const express = require("express");

const router = express.Router();

const stockMovementController =
    require("../controllers/stockMovementController");

const requireAuth =
    require("../middleware/requireAuth");


/* AUTHENTICATION */

router.use(requireAuth);


/* STOCK MOVEMENT PAGE */

router.get("/", (req, res) => {
    res.render("stockMovement", {
        user: req.user
    });
});


/* LOAD VEHICLE - VEHICLE MANAGEMENT */

router.get(
    "/vehicles",
    stockMovementController.getVehicles
);

router.post(
    "/vehicles",
    stockMovementController.registerVehicle
);

router.put(
    "/vehicles/:vehicleId",
    stockMovementController.updateVehicle
);

router.patch(
    "/vehicles/:vehicleId/status",
    stockMovementController.setVehicleStatus
);


/* LOAD VEHICLE - SOURCE DATA */

router.get(
    "/load-branches",
    stockMovementController.getLoadVehicleBranches
);

router.get(
    "/load-products",
    stockMovementController.getVehicleLoadProducts
);


/* LOAD VEHICLE - MAIN TRANSACTION */

router.post(
    "/load-vehicle",
    stockMovementController.loadVehicle
);


/* LOAD VEHICLE INFORMATION */

router.get(
    "/vehicle-stock",
    stockMovementController.getVehicleStock
);

router.get(
    "/load-history",
    stockMovementController.getVehicleLoadHistory
);


/* UNLOAD VEHICLE */

router.get(
    "/unload-branches",
    stockMovementController.getUnloadVehicleBranches
);

router.get(
    "/unload-products",
    stockMovementController.getVehicleUnloadProducts
);

router.post(
    "/unload-vehicle",
    stockMovementController.unloadVehicle
);

router.get(
    "/unload-history",
    stockMovementController.getVehicleUnloadHistory
);


/* BRANCH TRANSFER */

router.get( "/branch-transfer/branches", stockMovementController.getBranchTransferBranches);

router.get("/branch-transfer/products", stockMovementController.getBranchTransferProducts);

router.post("/branch-transfer/resolve",stockMovementController.resolveBranchTransferProducts);

router.post("/branch-transfer",stockMovementController.transferBranchStock);

router.get("/branch-transfer/history", stockMovementController.getBranchTransferHistory);

router.post( "/stock/adjust", stockMovementController.adjustBranchStock);


router.post("/stock/loss", stockMovementController.recordStockLoss);

router.post("/stock/return", stockMovementController.recordStockReturn);


module.exports = router;