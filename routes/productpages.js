const express = require("express");
const multer = require("multer");

const router = express.Router();

const productController = require("../controllers/allproductpages");
const upload = require("../middleware/upload");
const requireAuth = require("../middleware/requireAuth");

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| Inventory / Product Pages
|--------------------------------------------------------------------------
*/

router.get(
    "/inventory",
    
    productController.getallproductpages
);

router.get(
    "/products",
    productController.getallproducts
);

router.get(
    "/products/edit/:id",
    productController.showEditProduct
);

/*
|--------------------------------------------------------------------------
| Product Management
|--------------------------------------------------------------------------
*/

router.post(
    "/products/update",
    upload.single("product_image"),
    productController.updateProduct
);

router.post(
    "/add",
    upload.single("product_image"),
    productController.add
);

/*
|--------------------------------------------------------------------------
| Stock
|--------------------------------------------------------------------------
*/

router.get(
    "/stockintake",
    productController.getstockintake
);

router.post(
    "/add-stock",
    productController.addStock
);

/*
|--------------------------------------------------------------------------
| Product / Customer Search
|--------------------------------------------------------------------------
*/

router.get(
    "/search-products",
    productController.searchProducts
);

router.get(
    "/search-customers",
    productController.searchCustomers
);

router.post(
    "/customers/register",
    productController.registerCustomer
);

/*
|--------------------------------------------------------------------------
| POS
|--------------------------------------------------------------------------
*/

router.get(
    "/main",
    productController.getallproductsinmain
);

router.post(
    "/sales/add",
    productController.addsalesproduct
);

router.post(
    "/clearCart",
    productController.ClearAllCarts
);

router.delete(
    "/sales/delete/:sales_id",
    productController.deleteitem
);

/*
|--------------------------------------------------------------------------
| Held Sales
|--------------------------------------------------------------------------
*/

router.get(
    "/held-sales",
    productController.getallsalesinit
);

router.post(
    "/holdallsale",
    productController.holdSale
);

router.post(
    "/recall/:invoiceNumber",
    productController.recallHoldSale
);

router.post(
    "/deletesales",
    productController.deleteallsales
);

/*
|--------------------------------------------------------------------------
| Complete Sale
|--------------------------------------------------------------------------
*/

router.post(
    "/Onsalesitems/purchase",
    productController.pointofsales
);

/*
|--------------------------------------------------------------------------
| Multer / Upload Error Handler
|--------------------------------------------------------------------------
*/

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                success: false,
                message: "Product image must not exceed 5 MB."
            });
        }

        if (error.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                success: false,
                message:
                    "Only JPG, JPEG, PNG and WEBP product images are allowed."
            });
        }

        return res.status(400).json({
            success: false,
            message: "There was a problem uploading the product image."
        });
    }

    console.error("Product route error:", error);

    return res.status(500).json({
        success: false,
        message: "An unexpected error occurred."
    });
});

module.exports = router;