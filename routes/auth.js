const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth");
const requireAuth = require("../middleware/requireAuth");


// ================================================================
// PUBLIC AUTH ROUTES
// ================================================================

router.get(
    "/register",
    authController.getRegisterPage
);

router.post(
    "/register",
    authController.register
);

router.post(
    "/login",
    authController.login
);


// ================================================================
// EMPLOYEE ACCOUNT SETUP
// ================================================================

router.get(
    "/employee/setup",
    authController.showEmployeeSetup
);

router.post(
    "/employee/setup",
    authController.completeEmployeeSetup
);


// ================================================================
// AUTHENTICATED ROUTES
// ================================================================

router.get(
    "/logout",
    requireAuth,
    authController.logout
);

router.get(
    "/Account",
    authController.showRegister
);

router.get(
    "/profile",
    requireAuth,
    authController.getProfile
);

router.put(
    "/profileedit",
    requireAuth,
    authController.updateProfile
);

router.put(
    "/changepassword",
    requireAuth,
    authController.changePassword
);


module.exports = router;