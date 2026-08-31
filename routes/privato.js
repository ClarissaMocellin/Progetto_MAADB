const express = require('express');
const router = express.Router();
const connectMongo = require('../config/mongo');
const {getNeo4jSession} = require('../config/neo4j');

router.get('/accounts', async (req, res) => {
    try {
        const personId = req.query.personId;
        if (!personId) {
            return res.status(400).json({
                success: false, 
                message: "Parametro 'personId' mancante nella richiesta." 
            });
        }

        const db = await connectMongo();
        const foundAccounts = await db.collection("PersonOwnAccount").find({ 
            personId: personId 
        }).toArray();

        const formattedResult = foundAccounts.map(conto => conto.accountId);

        return res.status(200).json({
            success: true,
            accounts: formattedResult
        });

    } catch (error) {
        console.error("Errore nel server durante il recupero dei conti:", error);
        return res.status(500).json({
            success: false, 
            message: "Errore interno del server durante il recupero dei conti." 
        });
    }
});

router.get('/bankStatement', async (req, res) => {
    let sessionNeo4j;

    try {
        let {idSelectedAccount, year, month} = req.query;
        if (!idSelectedAccount || !year || !month) {
            return res.status(400).json({
                success: false, 
                error: "Parametri obbligatori mancanti."
            });
        }

        const yearInt = parseInt(year)
        const monthInt = parseInt(month)
        const startDate = new Date(Date.UTC(yearInt, monthInt - 1, 1, 0, 0, 0, 0)).toISOString();
        const endDate = new Date(Date.UTC(yearInt, monthInt, 1, 0, 0, 0, 0)).toISOString();
        const startYearDate = new Date(Date.UTC(yearInt, 0, 1, 0, 0, 0, 0)).toISOString();
        const endYearDate = new Date(Date.UTC(yearInt + 1, 0, 1, 0, 0, 0, 0)).toISOString();

        // ============================== Neo4j ===================================
        sessionNeo4j = getNeo4jSession();

        const queryCypher = `
        MATCH (myAccount:Account {fromId: $idSelectedAccount})

        CALL (myAccount) {
            CALL (myAccount) {
                OPTIONAL MATCH (myAccount)-[outDirect:TRANSFER]->(:Account)
                WHERE outDirect.createTime >= $startDate AND outDirect.createTime < $endDate
                RETURN COALESCE(SUM(outDirect.amount), 0) AS sommaTransfer
            }
            CALL (myAccount) {
                OPTIONAL MATCH (myAccount)-[wDirect:WITHDRAW]->()
                WHERE wDirect.createTime >= $startDate AND wDirect.createTime < $endDate
                RETURN COALESCE(SUM(wDirect.amount), 0) AS sommaWithdraw
            }
            RETURN (sommaTransfer + sommaWithdraw) AS totaleUsciteMese
        }
        
        CALL (myAccount) {
            OPTIONAL MATCH (:Account)-[inDirect:TRANSFER]->(myAccount)
            WHERE inDirect.createTime >= $startDate AND inDirect.createTime < $endDate
            RETURN COALESCE(SUM(inDirect.amount), 0) AS totaleEntrateMese
        }       

        CALL (myAccount) {
            MATCH (myAccount)-[out:TRANSFER]->(dest:Account)
            WHERE out.createTime >= $startDate AND out.createTime < $endDate
            
            WITH myAccount, dest,
                COUNT(DISTINCT out) AS numeroAzioniMese,
                SUM(out.amount) AS totaleSoldiSpostatiMese
        
            OPTIONAL MATCH (dest)-[relEsistente:TRANSFER]->(dest2:Account)
            WHERE dest2 <> myAccount
            
            OPTIONAL MATCH (dest)-[out2:TRANSFER]->(dest2)
            WHERE out2.createTime >= $startYearDate AND out2.createTime < $endYearDate
            
            WITH dest, dest2, numeroAzioniMese, totaleSoldiSpostatiMese,
                COUNT(DISTINCT out2) AS azioniTraDueFinale,
                SUM(out2.amount) AS totaleSoldiSpostatiFinaleAnnuo
        
            CALL (dest2) {
                WITH dest2
                WHERE dest2 IS NOT NULL
                OPTIONAL MATCH (dest2)-[tAnno:TRANSFER]-()
                WHERE tAnno.createTime >= $startYearDate AND tAnno.createTime < $endYearDate
                RETURN COUNT(DISTINCT tAnno) AS azioniTotaliAnno
            }
        
            RETURN COLLECT({
                intermedioId: dest.fromId,
                finaleId: case when dest2 is not null then dest2.fromId else null end,
                azioniTraDue: numeroAzioniMese,
                totaleSoldiSpostati: totaleSoldiSpostatiMese,
                azioniTraDueFinale: case when dest2 is not null then azioniTraDueFinale else 0 end,
                totaleSoldiSpostatiFinaleAnnuo: case when dest2 is not null then coalesce(totaleSoldiSpostatiFinaleAnnuo, 0) else 0 end,
                azioniTotaliAnnoFinale: case when dest2 is not null then azioniTotaliAnno else 0 end
           }) AS listaUsciteStrutturate
        }

        CALL (myAccount) {
            MATCH (src:Account)-[in:TRANSFER]->(myAccount)
            WHERE in.createTime >= $startDate AND in.createTime < $endDate
            
            WITH myAccount, src,
                COUNT(DISTINCT in) AS numeroAzioniMeseSrc,
                SUM(in.amount) AS totaleSoldiSpostatiMeseSrc

            OPTIONAL MATCH (src2:Account)-[relEsistente:TRANSFER]->(src)
            WHERE src2 <> myAccount

            OPTIONAL MATCH (src2)-[in2:TRANSFER]->(src)
            WHERE in2.createTime >= $startYearDate AND in2.createTime < $endYearDate

            
            WITH src, src2, numeroAzioniMeseSrc, totaleSoldiSpostatiMeseSrc,
                COUNT(DISTINCT in2) AS azioniTraDueFinaleSrc,
                SUM(in2.amount) AS totaleSoldiSpostatiFinaleSrc
       
            CALL (src2) {
               WITH src2
               WHERE src2 IS NOT NULL
               OPTIONAL MATCH (src2)-[tAnnoSrc:TRANSFER]-()
               WHERE tAnnoSrc.createTime >= $startYearDate AND tAnnoSrc.createTime < $endYearDate
               RETURN COUNT(DISTINCT tAnnoSrc) AS azioniTotaliAnnoSrc    
            }
            
            RETURN COLLECT({
                intermedioId: src.fromId,
                finaleId: case when src2 is not null then src2.fromId else null end,
                azioniTraDue: numeroAzioniMeseSrc,
                totaleSoldiSpostati: coalesce(totaleSoldiSpostatiMeseSrc, 0),
                azioniTraDueFinale: case when src2 is not null then azioniTraDueFinaleSrc else 0 end,
                totaleSoldiSpostatiFinaleAnnuo: case when src2 is not null then coalesce(totaleSoldiSpostatiFinaleSrc, 0) else 0 end,
                azioniTotaliAnnoFinale: case when src2 is not null then azioniTotaliAnnoSrc else 0 end
            }) AS listaEntrateStrutturate
        }

        RETURN 
            totaleUsciteMese,
            totaleEntrateMese,
            COALESCE(listaUsciteStrutturate, []) AS listaUscite,
            COALESCE(listaEntrateStrutturate, []) AS listaEntrate
        `;

        const resultGraph = await sessionNeo4j.run(queryCypher, {
            idSelectedAccount: idSelectedAccount,
            startDate: startDate,
            endDate: endDate,
            startYearDate: startYearDate,
            endYearDate: endYearDate
        });

        let totMonthSpendings = 0;
        let totMonthProfit = 0;
        let finalSpendings = [];
        let finalProfit = [];
        const accountIdsToSearch = new Set();

        if (resultGraph.records.length > 0) {
            const record = resultGraph.records[0];
            totMonthSpendings = parseNeo4jNumber(record.get('totaleUsciteMese'));
            totMonthProfit = parseNeo4jNumber(record.get('totaleEntrateMese'));

            finalSpendings = record.get('listaUscite') || [];
            finalProfit = record.get('listaEntrate') || [];
            
            finalSpendings.forEach(item => {
                if (item.intermedioId) accountIdsToSearch.add(item.intermedioId);
                if (item.finaleId) accountIdsToSearch.add(item.finaleId);
            });
            
            finalProfit.forEach(item => {
                if (item.intermedioId) accountIdsToSearch.add(item.intermedioId);
                if (item.finaleId) accountIdsToSearch.add(item.finaleId);
            });
        }
        
        // ============================== MongoDB ===================================
        const dbMongo = await connectMongo();
        const accountIdsArray = Array.from(accountIdsToSearch);

        const [relCompaniesAccounts, relPersonAccounts] = await Promise.all([
            accountIdsArray.length > 0
                ? dbMongo.collection('CompanyOwnAccount').find({accountId: {$in: accountIdsArray}}).toArray()
                : Promise.resolve([]),
            accountIdsArray.length > 0
                ? dbMongo.collection('PersonOwnAccount').find({accountId: {$in: accountIdsArray}}).toArray()
                : Promise.resolve([])
        ]);

        const [companies, persons] = await Promise.all([
            relCompaniesAccounts.length > 0 
                ? dbMongo.collection('Company')
                    .find(
                        {companyId: {$in: relCompaniesAccounts.map(l => l.companyId)}},
                        {projection: {companyId: 1, companyName: 1, isBlocked: 1}}
                    )
                    .toArray() 
                : Promise.resolve([]),
                
            relPersonAccounts.length > 0 
                ? dbMongo.collection('Person')
                    .find(
                        {personId: {$in: relPersonAccounts.map(l => l.personId)}},
                        {projection: {personId: 1, personName: 1, isBlocked: 1}}
                    )
                    .toArray() 
                : Promise.resolve([])
        ]);

        const personalInformationMap = new Map();
        const companiesMap = new Map(companies.map(c => [c.companyId, c]));
        const personsMap = new Map(persons.map(p => [p.personId, p]));
        
        relCompaniesAccounts.forEach(l => {
            const az = companiesMap.get(l.companyId);
            if (az) personalInformationMap.set(l.accountId, {nome: az.companyName, tipo: "Company", bloccato: az.isBlocked});
        });

        relPersonAccounts.forEach(l => {
            const pr = personsMap.get(l.personId);
            if (pr) personalInformationMap.set(l.accountId, {nome: pr.personName, tipo: "Person", bloccato: pr.isBlocked});
        });

        const getNumber = (value) => {
            if (value == null) return 0;
            if (typeof value === 'object' && value.low !== undefined) return value.low;
            const p = Number(value);
            return isNaN(p) ? 0 : p;
        };

        const enrichInitialStructure = (item) => {
            const idIntermedioStr = item.intermedioId || '';
            const idFinaleStr = item.finaleId || '';    

            const intermediateInfo = personalInformationMap.get(idIntermedioStr) || {};
            const finalInfo = personalInformationMap.get(idFinaleStr) || {};
            
            return {
                intermediateName: intermediateInfo.nome || `Nome Unknown ${idIntermedioStr}`,
                intermediateType: intermediateInfo.tipo || "Unknown",
                finalName: finalInfo.nome || `Nome Unknown ${idFinaleStr}`,
                finalType: finalInfo.tipo || "Unknown",
                finalBlocked: finalInfo.nome ? "Attivo" : "Unknoun",
                monthTotalAction: getNumber(item.azioniTraDue),
                monthTotalActionYear: getNumber(item.azioniTraDueFinale),
                monthTotalMoney: parseFloat(getNumber(item.totaleSoldiSpostati).toFixed(2)),
                monthTotalMoneyYear: parseFloat(getNumber(item.totaleSoldiSpostatiFinaleAnnuo).toFixed(2)),
                totFinalAccountActionYear: getNumber(item.azioniTotaliAnnoFinale),
            };
        };

        return res.json({
            success: true,
            financialSummary: {
                totalProfit: parseFloat(totMonthProfit.toFixed(2)),
                totalSpendings: parseFloat(totMonthSpendings.toFixed(2)),
            },
            profitList: finalProfit.map(item => enrichInitialStructure(item)),
            spendingsList: finalSpendings.map(item => enrichInitialStructure(item))
        });

    } catch (error) {
        console.error("Errore nel calcolo:", error);
        return res.status(500).json({success: false, error: "Errore interno del server."});
    } finally {
        if (sessionNeo4j) {
            await sessionNeo4j.close();
        }
    }
});

router.get('/investorsRanking', async (req, res) => {
    let neo4jSession;
    
    try {
        // ============================== MongoDB ===========================================
        const mongoDb = await connectMongo();
        
        const activeCompanies = await mongoDb.collection('Company')
            .find({isBlocked: false})
            .project({companyId: 1, companyName: 1})
            .toArray();

        const activeCompanyIds = activeCompanies.map(company => company.companyId);
        if (activeCompanyIds.length === 0) {
            return res.status(200).json({
                success: true,
                ranking: []
            });
        }

        const companyNamesMap = {};
        activeCompanies.forEach(c => {
            companyNamesMap[c.companyId] = c.companyName;
        });
        
        // ================================== Neo4j =======================================
        neo4jSession = getNeo4jSession();

        const cypherQuery = `
            MATCH (companyAccount:Company)
            WHERE companyAccount.investorId IN $activeCompanyIds
            
            OPTIONAL MATCH (directInvestor)-[:INVEST_IN]->(companyAccount)
            WHERE directInvestor <> companyAccount

            OPTIONAL MATCH (indirectInvestor)-[:INVEST_IN]->(middleInvestor)-[:INVEST_IN]->(companyAccount)
            WHERE indirectInvestor <> companyAccount 
                AND indirectInvestor <> middleInvestor
                AND NOT (indirectInvestor)-[:INVEST_IN]->(companyAccount)
            
            RETURN companyAccount.investorId AS companyId,
                COUNT(DISTINCT directInvestor) AS directInvestors,
                COUNT(DISTINCT indirectInvestor) AS indirectInvestors        
        `;

        const neo4jGraphResult = await neo4jSession.run(cypherQuery, {activeCompanyIds});

        // ==================== MongoDB ====================
        const mongoLoansData = await mongoDb.collection('CompanyApplyLoan').aggregate([
            {
                $match: {
                    companyId: {$in: activeCompanyIds}
                }
            },
            {
                $lookup: {
                    from: 'Loan',
                    localField: 'loanId',
                    foreignField: 'loanId',
                    as: 'loanDetails'
                }
            },
            {
                $lookup: {
                    from: 'AccountRepayLoan',
                    localField: 'loanId',
                    foreignField: 'loanId',
                    as: 'repayDetails'
                }
            },
            {
                $project: {
                    companyId: 1,
                    loanAmount: {$ifNull: [{$arrayElemAt: ["$loanDetails.loanAmount", 0]}, 0]},
                    repayAmount: {$sum: {$ifNull: ["$repayDetails.amount", 0]}}
                }
            },
            {
                $group: {
                    _id: "$companyId",
                    totalLoanAmount: {$sum: "$loanAmount"},
                    totalRepayAmount: {$sum: "$repayAmount"}
                }
            }
        ]).toArray()                     

        const networkCredibilityMap = {};
        neo4jGraphResult.records.forEach(record => {
            networkCredibilityMap[record.get('companyId')] = {
                directInvestors: getSafeNumber(record.get('directInvestors')),
                indirectInvestors: getSafeNumber(record.get('indirectInvestors'))
            };
        });

        const financialMap = {};
        activeCompanyIds.forEach(id => {
            financialMap[id] = {
                totalLoanAmount: 0, 
                totalRepayAmount: 0
            };
        });

        mongoLoansData.forEach(item => {
            const cId = item._id
            if (cId) {
                if (financialMap[cId]) {
                    financialMap[cId].totalLoanAmount = item.totalLoanAmount || 0;
                    financialMap[cId].totalRepayAmount = item.totalRepayAmount || 0;
                }
            }
        });

        const companyRanking = activeCompanyIds.map(companyId => {
            const network = networkCredibilityMap[companyId] || {directInvestors: 0, indirectInvestors: 0};
            
            const finance = financialMap[companyId];
            const totLoan = finance.totalLoanAmount;
            const totRepay = finance.totalRepayAmount;
            
            const finalScore = (network.directInvestors * 1.0) + (network.indirectInvestors * 0.5);

            return {
                companyId: companyId,
                companyName: companyNamesMap[companyId] || "Unknown Company",
                totLoan: totLoan,
                totRepay: parseFloat(totRepay.toFixed(2)),
                finalInvestmentScore: parseFloat(finalScore.toFixed(2))
            };
        });

        companyRanking.sort((a, b) => b.finalInvestmentScore - a.finalInvestmentScore);
        const top20Ranking = companyRanking.slice(0, 20);
        
        return res.status(200).json({
            success: true,
            ranking: top20Ranking
        });

    } catch (error) {
        console.error("Errore nel recupero della classifica:", error);
        return res.status(500).json({
            success: false, 
            error: error.message
        });
    } finally {
        if (neo4jSession) await neo4jSession.close();
    }
});

module.exports = router;

function parseNeo4jNumber(val, isInt = false) {
    if (val?.toNumber) return val.toNumber();
    if (val == null) return 0;
    return isInt ? (parseInt(val, 10) || 0) : (parseFloat(val) || 0);
}

function getSafeNumber(value) {
    if (value == null) {
        return 0;
    }
    if (typeof value === 'object' && value.low !== undefined) {
        return value.low;
    }
    
    var parsed = Number(value);
    if (isNaN(parsed)) {
        return 0;
    } else {
        return parsed;
    }
}