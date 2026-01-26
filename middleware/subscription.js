const Subscription = require("../models/Subscription");

/**
 * Middleware to require any active subscription
 */
exports.requireSubscription = async (req, res, next) => {
    try {
        const { user } = req;

        // Check if user has any active subscription
        const activeSub = await Subscription.findOne({
            userId: user._id,
            status: "active",
            endDate: { $gt: new Date() }
        });

        if (!activeSub) {
            return res.status(403).json({
                success: false,
                message: "Premium subscription required for this action",
                code: "SUBSCRIPTION_REQUIRED"
            });
        }

        req.activeSubscription = activeSub;
        next();
    } catch (error) {
        console.error("Subscription middleware error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

/**
 * Middleware to require a specific subscription type (vip, mvp, guardian)
 */
exports.requireSubscriptionType = (type) => {
    return async (req, res, next) => {
        try {
            const { user } = req;

            const activeSub = await Subscription.findOne({
                userId: user._id,
                type: type,
                status: "active",
                endDate: { $gt: new Date() }
            });

            if (!activeSub) {
                return res.status(403).json({
                    success: false,
                    message: `${type.toUpperCase()} subscription required`,
                    code: `${type.toUpperCase()}_REQUIRED`
                });
            }

            req[`active${type.charAt(0).toUpperCase() + type.slice(1)}Subscription`] = activeSub;
            next();
        } catch (error) {
            console.error("Subscription type middleware error:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    };
};

/**
 * Middleware to require a minimum VIP tier
 * Tiers: normal < super < diamond
 */
exports.requireVipTier = (minTier) => {
    const tiers = ["normal", "super", "diamond"];
    const minTierIndex = tiers.indexOf(minTier);

    return async (req, res, next) => {
        try {
            const { user } = req;

            const activeVip = await Subscription.findOne({
                userId: user._id,
                type: "vip",
                status: "active",
                endDate: { $gt: new Date() }
            });

            if (!activeVip) {
                return res.status(403).json({
                    success: false,
                    message: "VIP subscription required",
                    code: "VIP_REQUIRED"
                });
            }

            const userTierIndex = tiers.indexOf(activeVip.tier);
            if (userTierIndex < minTierIndex) {
                return res.status(403).json({
                    success: false,
                    message: `Minimum VIP tier ${minTier.toUpperCase()} required`,
                    code: "INSUFFICIENT_VIP_TIER"
                });
            }

            req.activeVipSubscription = activeVip;
            next();
        } catch (error) {
            console.error("VIP tier middleware error:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    };
};
