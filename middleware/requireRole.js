const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        const user = req.user || req.session?.user;

        if (!user) {
            if (req.xhr || req.path.startsWith("/api/")) {
                return res.status(401).json({
                    success: false,
                    message: "Please log in to continue."
                });
            }

            return res.redirect("/login");
        }

        if (!user.id || !user.business_id) {
            return res.status(403).json({
                success: false,
                message: "Invalid business access."
            });
        }

        const userRole = String(user.RoleName || "")
            .trim()
            .toLowerCase();

        const normalizedRoles = allowedRoles.map(role =>
            String(role).trim().toLowerCase()
        );

        if (!normalizedRoles.includes(userRole)) {
            if (req.xhr || req.path.startsWith("/api/")) {
                return res.status(403).json({
                    success: false,
                    message: "You are not authorized to access this resource."
                });
            }

            return res.status(403).render("403", {
                message: "You are not authorized to access this page."
            });
        }

        next();
    };
};

module.exports = requireRole;