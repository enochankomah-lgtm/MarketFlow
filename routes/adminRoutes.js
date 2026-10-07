const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");

const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");

// ================================================================
// ALL ADMIN ROUTES REQUIRE LOGIN + ADMINISTRATOR ROLE
// ================================================================

router.use(requireAuth);
router.use(requireAdmin);

// ================================================================
// DASHBOARD
// ================================================================

router.get(
    "/dashboard",
    adminController.dashboard
);

// ================================================================
// PUBLIC REGISTRATIONS
// ================================================================

router.get(
    "/registrations",
    adminController.pendingRegistrations
);

router.get(
    "/pendingRegistration",
    adminController.pendingRegistrations
);

router.post(
    "/registrations/:userId/approve",
    adminController.approveRegistration
);

router.post(
    "/registrations/:userId/reject",
    adminController.rejectRegistration
);


// ================================================================
// EMPLOYEES
// ================================================================

router.get(
    "/employees",
    adminController.employees
);

router.post(
    "/employees",
    adminController.createEmployee
);

router.post(
    "/employees/:userId/activate",
    adminController.activateEmployee
);

router.post(
    "/employees/:userId/deactivate",
    adminController.deactivateEmployee
);


module.exports = router;