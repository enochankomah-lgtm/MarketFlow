const express = require("express");
const router = express.Router();

const productController = require("../controllers/allproductpages");


router.get("/inventory", productController.getallproductpages);

router.get("/products", productController.getallproducts);

// show 
// router.get("/products/edit/:id", productController.showEditProduct);


router.post("/products/update", productController.updateProduct);

router.get("/stockintake", productController.getstockintake)

router.post("/add", productController.add);

router.get("/search-products", productController.searchProducts);
router.get("/main", productController.getallproductsinmain);
router.post("/add-stock", productController.addStock);

router.post('/sales/add',productController.addsalesproduct);

router.post('/clearCart', productController.ClearAllCarts);

router.delete('/sales/delete/:sales_id', productController.deleteitem);
 
router.post('/holdallsale', productController.holdSale);

router.post("/recall/:invoiceNumber", productController.recallHoldSale);

router.post('/deletesales',productController.deleteallsales)

module.exports = router;