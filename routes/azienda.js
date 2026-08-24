// routes/azienda.js
const express = require('express');
const router = express.Router();
const connectMongo = require('../config/mongo');

router.get('/accessAnalysis', async (req, res) => {
    const { companyId } = req.query;

    if (!companyId) {
        return res.status(400).json({ success: false, error: "Identificativo azienda mancante." });
    }

    try {
        const db = await connectMongo();
        const ownCollection = db.collection('CompanyOwnAccount');
        
        const reportAccess = await ownCollection.aggregate([
            { 
                $match: { 
                    companyId: companyId
                } 
            },

            {
                $lookup: {
                    from: "MediumSignInAccount",
                    localField: "accountId",
                    foreignField: "accountId",
                    as: "allMediumSignInForAccount"
                }
            },

            { $unwind: "$allMediumSignInForAccount" },

            {
                $lookup: {
                    from: "Medium",
                    localField: "allMediumSignInForAccount.mediumId",
                    foreignField: "mediumId",
                    as: "finalMediumData"
                }
            },

            { $unwind: "$finalMediumData" },

            {
                $project: {
                    isBlocked: "$finalMediumData.isBlocked",
                    mediumType: "$finalMediumData.mediumType",
                    riskLevel: "$finalMediumData.riskLevel"
                }
            },

            {
                $group: {
                    _id: {
                        type: "$mediumType",
                        risk: "$riskLevel"
                    },
                    countForRisk: { $sum: 1 },
                    blockedForRisk: {
                        $sum: { $cond: [{ $eq: ["$isBlocked", true] }, 1, 0] }
                    }
                }
            },

            {
                $group: {
                    _id: "$_id.type",
                    totalAccessesForMethod: { $sum: "$countForRisk" },
                    
                    riskBreakdown: {
                        $push: {
                            level: "$_id.risk",
                            count: "$countForRisk",
                            blocked: "$blockedForRisk",
                        }
                    }
                }
            },
            
            {
                $project: {
                    accessMethod: "$_id",
                    totalAccesses: "$totalAccessesForMethod",
                    riskBreakdown: 1
                }
            }

        ]).toArray();

        return res.json({ success: true, data: reportAccess });

    } catch (error) {
        console.error("Errore durante l'aggregazione a doppio lookup della Query 3:", error);
        return res.status(500).json({ success: false, error: "Errore interno durante l'analisi analitica dei canali." });
    }
});

module.exports = router;