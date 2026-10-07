const express = require("express");

const router = express.Router();

const {  productPerformance } = require("../controllers/productPerformance");

router.get("/product-performance", productPerformance );

module.exports = router;