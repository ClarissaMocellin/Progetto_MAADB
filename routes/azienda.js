const express = require('express');
const router = express.Router();
const connectMongo = require('../config/mongo');
const { getNeo4jSession } = require('../config/neo4j');

router.get('/analisi-accessi', async (req, res) => {
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

router.get('/potenziali-investitori', async (req, res) => {
    let neo4jSession;
    
    try {
        const { companyCountry } = req.query;

        if (!companyCountry) {
            return res.status(400).json({ 
                success: false, 
                message: "Parametro 'companyCountry' obbligatorio mancante." 
            });
        }
        
        // ============================== MongoDB ===================================
        const db = await connectMongo();
        const candidatiMongo = await db.collection("Person").aggregate([
            {
                $match: {
                    isBlocked: false,
                    country: companyCountry
                }
            },
            {
                $lookup: {
                    from: "PersonOwnAccount",
                    localField: "personId",
                    foreignField: "personId",
                    as: "tuttiIConti"
                }
            },
            {
                $lookup: {
                    from: "Account",
                    localField: "tuttiIConti.accountId",
                    foreignField: "accountId",
                    as: "dettagliConti"
                }
            },
            {
                $project: {
                    personId: 1,
                    personName: 1,
                    contiAttivi: {
                        $filter: {
                            input: "$dettagliConti",
                            as: "conto",
                            cond: { $eq: ["$$conto.isBlocked", false] }
                        }
                    }
                }                  
            },
            {
                $match: {
                    "contiAttivi.0": { $exists: true }
                }
            },
            {
                $lookup: {
                    from: "PersonApplyLoan",
                    localField: "personId",
                    foreignField: "personId",
                    as: "loanLinks"
                }
            },
            {
                $lookup: {
                    from: "Loan",
                    localField: "loanLinks.loanId",
                    foreignField: "loanId",
                    as: "loanDetails"
                }
            },
            {
                $lookup: {
                    from: "AccountRepayLoan",
                    localField: "contiAttivi.accountId",
                    foreignField: "accountId",
                    as: "repayDetails"
                }
            },
            {
                $project: {
                    personId: 1,
                    personName: 1,
                    contiAttivi: 1,
                    loanAmount: { "$sum": "$loanDetails.amount" },
                    repayAmount: { "$sum": "$repayDetails.amount" },
                }
            },
            {
                $match: {
                    $expr: {
                        $or: [
                            { $eq: ["$loanAmount", 0] },
                            { $gte: ["$repayAmount", { $multiply: ["$loanAmount", 0.6] }] }
                        ]
                    }
                }
            }    
        ]).toArray();

        
        if (!candidatiMongo || candidatiMongo.length === 0) {
            return res.status(200).json({ success: true, leadClassifica: [] });
        }

        const listaIdAccount = candidatiMongo.flatMap(c => c.contiAttivi.map(acc => acc.accountId));
        const accountPersonMap = {};
        const mappaAccountFinale = {};

        candidatiMongo.forEach(c => {
            if (!mappaAccountFinale[c.personId]) {
                mappaAccountFinale[c.personId] = {
                    personId: c.personId,
                    personName: c.personName,
                    affidability: 0
                };
            }
            c.contiAttivi.forEach(acc => {
                accountPersonMap[acc.accountId] = c.personId;
            });
        });

        // ============================== Neo4j ===================================
        neo4jSession = getNeo4jSession();

        const queryCypher = `
            MATCH (targetAcc:Account)
            WHERE targetAcc.fromId IN $listaIdAccount
            
            OPTIONAL MATCH (sourceAcc:Account)-[:TRANSFER*1..3]->(targetAcc)
            WITH targetAcc, count(distinct sourceAcc) AS accountTerziUnici
            
            OPTIONAL MATCH (sourceAccAnomalia:Account)-[:TRANSFER*1..3]->(targetAcc)
            OPTIONAL MATCH (sourceAccAnomalia)-[w:WITHDRAW]->()
            WITH targetAcc, accountTerziUnici, count(w) AS conteggioPrelieviNetwork
            
            WITH targetAcc,
                ((accountTerziUnici * 10) - (conteggioPrelieviNetwork)) AS indiceSolidita
            
            RETURN targetAcc.fromId AS AccountId, indiceSolidita
        `;

        const neo4jResult = await neo4jSession.run(queryCypher, { listaIdAccount });

        neo4jResult.records.forEach(record => {
            const accountId = record.get('AccountId');
            const score = record.get('indiceSolidita').toNumber();

            const personId = accountPersonMap[accountId];

            if (personId && mappaAccountFinale[personId]) {
                mappaAccountFinale[personId].affidability += score;
            }
        });

        const classificaFinale = Object.values(mappaAccountFinale);
        classificaFinale.sort((a, b) => b.affidability - a.affidability);
        const top20Investor = classificaFinale.slice(0, 20);

        res.status(200).json({
            success: true,
            leadClassifica: top20Investor
        });
    } catch (error) {
        console.error("Errore server durante l'elaborazione dei dati:", error);
        if (neo4jSession) {
            try { await neo4jSession.close(); } catch (e) { console.error("Errore chiusura sessione:", e); }
        }

        return res.status(500).json({ 
            success: false, 
            message: "Errore interno del server durante il calcolo analitico dei lead investitori." 
        });
    }
});

module.exports = router;