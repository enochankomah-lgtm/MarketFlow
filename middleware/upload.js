const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDirectory = path.join(
    __dirname,
    "../public/uploads/products"
);

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, {
        recursive: true
    });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDirectory);
    },

    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname)
            .toLowerCase();

        const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`;

        cb(null, uniqueName);
    }
});

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
]);

const allowedExtensions = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
]);

const fileFilter = function (req, file, cb) {
    const mimeType = String(file.mimetype || "").toLowerCase();
    const extension = path.extname(file.originalname || "")
        .toLowerCase();

    if (
        allowedMimeTypes.has(mimeType) &&
        allowedExtensions.has(extension)
    ) {
        return cb(null, true);
    }

    return cb(
        new multer.MulterError("LIMIT_UNEXPECTED_FILE"),
        false
    );
};

const upload = multer({
    storage,
    fileFilter,

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    }
});

module.exports = upload;