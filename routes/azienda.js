const express = require('express');
const router = express.Router();
const connectMongo = require('../config/mongo');
const {getNeo4jSession} = require('../config/neo4j');

router.get('/accessAnalysis', async (req, res) => {
    const {companyId} = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false, 
            error: "Identificativo azienda mancante."
        });
    }

    try {
        const db = await connectMongo();
        const ownCollection = db.collection('CompanyOwnAccount');
        
        // ============================== MongoDB ===================================
        const reportAccess = await ownCollection.aggregate([
            {
                $match: {
                    companyId: companyId
                }
            },
            {
                $project: {
                    companyId: 1,
                    accountId: 1
                }
            },
            {
                $lookup: {
                    from: "MediumSignInAccount",
                    let: {account_corrente: "$accountId"}, 
                    pipeline: [
                        { 
                            $match: { 
                                $expr: {$eq: ["$accountId", "$$account_corrente"]} 
                            } 
                        },
                        {
                            $group: {
                                _id: "$mediumId"
                            }
                        },
                        { 
                            $project: { 
                                _id: 0, 
                                mediumId: "$_id"
                            } 
                        }
                    ],
                    as: "allMediumSignInForAccount"
                }
            },
            {
                $project: {
                    companyId: 1,
                    accountId: 1,
                    mediumSignInForAccount: "$allMediumSignInForAccount.mediumId"
                }
            },
            {
                $lookup: {
                    from: "Medium",
                    let: {medium_corrente: "$mediumSignInForAccount"}, 
                    pipeline: [
                        { 
                            $match: {
                                $expr: {$in: ["$mediumId", "$$medium_corrente"]}
                            } 
                        },
                        { 
                            $project: { 
                                _id: 0, 
                                mediumId: 1,
                                mediumType: 1,
                                isBlocked: 1,
                                riskLevel: 1
                            } 
                        }
                    ],
                    as: "allMediumSignInDetails"
                }
            },
            {
                $unset: "mediumSignInForAccount"
            }
        ]).toArray();

        return res.json({
            success: true, 
            data: reportAccess
        });

    } catch (error) {
        console.error("Errore durante l'aggregazione a doppio lookup della Query 3:", error);
        return res.status(500).json({
            success: false, 
            error: "Errore interno durante l'analisi analitica dei canali."
        });
    }
});

router.get('/searchInvestors', async (req, res) => {
    let neo4jSession;
    
    try {
        const {companyCountry} = req.query;

        if (!companyCountry) {
            return res.status(400).json({
                success: false, 
                message: "Parametro 'companyCountry' obbligatorio mancante." 
            });
        }
        
        // ============================== MongoDB ===================================
        const db = await connectMongo();
        const candidateMongo = await db.collection("Person").aggregate([
            {
                $match: {
                    isBlocked: false,
                    country: companyCountry
                }
            },
            {
                $project: {
                    personId: 1,
                    personName: 1,
                    isBlocked: 1
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
                            cond: {$eq: ["$$conto.isBlocked", false]}
                        }
                    }
                }                  
            },
            {
                $match: {
                    "contiAttivi.0": {$exists: true}
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
                    loanAmount: {"$sum": "$loanDetails.loanAmount"},
                    repayAmount: {"$sum": "$repayDetails.amount"},
                }
            },
            {
                $match: {
                    $expr: {
                        $or: [
                            {$eq: ["$loanAmount", 0]},
                            {$gte: ["$repayAmount", {$multiply: ["$loanAmount", 0.6]}]}
                        ]
                    }
                }
            }    
        ]).toArray();

        if (!candidateMongo || candidateMongo.length === 0) {
            return res.status(200).json({
                success: true, 
                rankingCandidates: []
            });
        }

        const accountIdList = candidateMongo.flatMap(c => c.contiAttivi.map(acc => acc.accountId));
        const accountPersonMap = {};
        const accountMapFinal = {};

        candidateMongo.forEach(c => {
            if (!accountMapFinal[c.personId]) {
                accountMapFinal[c.personId] = {
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
            WHERE targetAcc.fromId IN $accountIdList
            
            OPTIONAL MATCH (sourceAcc:Account)-[:TRANSFER*1..3]->(targetAcc)
            WITH targetAcc, count(distinct sourceAcc) AS accountTerziUnici
            
            OPTIONAL MATCH (sourceAcc:Account)-[:TRANSFER*1..3]->(targetAcc)
            OPTIONAL MATCH (sourceAcc)-[w:WITHDRAW]->()
            WITH targetAcc, accountTerziUnici, count(w) AS conteggioPrelieviNetwork
            
            WITH targetAcc,
                ((accountTerziUnici * 10) - (conteggioPrelieviNetwork)) AS indiceSolidita
            
            RETURN targetAcc.fromId AS AccountId, indiceSolidita
        `;

        const neo4jResult = await neo4jSession.run(queryCypher, {accountIdList});

        neo4jResult.records.forEach(record => {
            const accountId = record.get('AccountId');
            const score = record.get('indiceSolidita').toNumber();

            const personId = accountPersonMap[accountId];

            if (personId && accountMapFinal[personId]) {
                accountMapFinal[personId].affidability += score;
            }
        });

        const finalRanking = Object.values(accountMapFinal);
        finalRanking.sort((a, b) => b.affidability - a.affidability);
        const top20Investor = finalRanking.slice(0, 20);

        res.status(200).json({
            success: true,
            rankingCandidates: top20Investor
        });

    } catch (error) {
        console.error("Errore server durante l'elaborazione dei dati:", error);
        if (neo4jSession) {
            try {await neo4jSession.close();} catch (e) {console.error("Errore chiusura sessione:", e);}
        }

        return res.status(500).json({
            success: false, 
            message: "Errore interno del server durante il calcolo analitico dei possibili investitori." 
        });
    }
});

module.exports = router;