const express = require("express");

const router = express.Router();

const {
    getDashboard
} = require("../controllers/CustomerOverview");

router.get(
    "/customer-overview",
    getDashboard
);

module.exports = router;