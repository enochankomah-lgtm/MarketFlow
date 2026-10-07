const express = require("express");

const router = express.Router();

const branchController = require("../controllers/branchController");
const requireAuth = require("../middleware/requireAuth");

router.use(requireAuth);

router.get(
    "/",
    branchController.showNewBranch
);

router.get(
    "/list",
    branchController.getBranches
);

router.post(
    "/",
    branchController.createBranch
);

module.exports = router;