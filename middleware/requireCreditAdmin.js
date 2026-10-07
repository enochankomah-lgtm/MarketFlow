"use strict";

const requireCreditAdmin = (req, res, next) => {

    const role =
        String(
            req.user?.RoleName || ""
        )
        .trim()
        .toLowerCase();

    if(role !== "admin" &&
        role !== "administrator" &&
        role !== "owner"){
        if(req.xhr||req.path.startsWith("/api/")){
            return res.status(403).json({success:false,message:"Administrator access is required."});
        }
        return res.status(403).render("403",{message:"You are not authorized to access this page."});
    }

    next();
};

module.exports = requireCreditAdmin;