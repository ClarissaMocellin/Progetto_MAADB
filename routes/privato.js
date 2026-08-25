const express = require('express');
const router = express.Router();
const connectMongo = require('../config/mongo');
const { getNeo4jSession } = require('../config/neo4j');

router.get('/conti', async (req, res) => {
    try {
        const personIdstr = req.query.personId;
        if (!personIdstr) {
            return res.status(400).json({ 
                success: false, 
                message: "Parametro 'personId' mancante nella richiesta." 
            });
        }
        const db = await connectMongo();
        const foundAccounts = await db.collection("PersonOwnAccount").find({  
            personId: personIdstr 
        }).toArray();

        const formattedResult = foundAccounts.map(conto => ({ accountId: conto.accountId }));

        return res.status(200).json({
            success: true,
            accounts: formattedResult
        });

    } catch (error) {
        console.error("Errore nel server durante il recupero dei conti utenti:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Errore interno del server durante il recupero dei conti." 
        });
    }
});

router.get('/estratto-conto', async (req, res) => {
    let sessionNeo4j;

    try {
        let { idSelectedAccount, year, month } = req.query;

        if (!idSelectedAccount || !year || !month) {
            return res.status(400).json({ success: false, error: "Parametri obbligatori mancanti." });
        }

        const yearInt = parseInt(year)
        const monthInt = parseInt(month)
        const startDate = new Date(Date.UTC(yearInt, monthInt - 1, 1, 0, 0, 0, 0)).toISOString();
        const endDate = new Date(Date.UTC(yearInt, monthInt, 1, 0, 0, 0, 0)).toISOString();
        const startYearDate = new Date(Date.UTC(yearInt, 0, 1, 0, 0, 0, 0)).toISOString();
        const endYearDate = new Date(Date.UTC(yearInt + 1, 0, 1, 0, 0, 0, 0)).toISOString();
        sessionNeo4j = getNeo4jSession();

        // ============================== Neo4j ===================================
        const queryCypher = `
        MATCH (myAccount:Account {accountId: $idSelectedAccount})

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
                intermedioId: dest.accountId,
                finaleId: case when dest2 is not null then dest2.accountId else null end,
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
                intermedioId: src.accountId,
                finaleId: case when src2 is not null then src2.accountId else null end,
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
            startYearDate:startYearDate,
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
                if (item.intermedioId) accountIdsToSearch.add(String(item.intermedioId));
                if (item.finaleId) accountIdsToSearch.add(String(item.finaleId));
            });
        }
        
        // ============================== MongoDB ===================================
        const dbMongo = await connectMongo();
        const accountIdsArray = Array.from(accountIdsToSearch);

        const [relCompaniesAccounts, relPersonAccounts] = await Promise.all([
            accountIdsArray.length > 0
                ? dbMongo.collection('CompanyOwnAccount').find({ accountId: { $in: accountIdsArray } }).toArray()
                : Promise.resolve([]),
            accountIdsArray.length > 0
                ? dbMongo.collection('PersonOwnAccount').find({ accountId: { $in: accountIdsArray } }).toArray()
                : Promise.resolve([])
        ]);

        const [companies, persons] = await Promise.all([
            relCompaniesAccounts.length > 0 
                ? dbMongo.collection('Company').find({ companyId: { $in: relCompaniesAccounts.map(l => l.companyId) } }).toArray() 
                : Promise.resolve([]),
            relPersonAccounts.length > 0 
                ? dbMongo.collection('Person').find({ personId: { $in: relPersonAccounts.map(l => l.personId) } }).toArray() 
                : Promise.resolve([])
        ]);

        const personalInformationMap = new Map();
        const companiesMap = new Map(companies.map(c => [c.companyId, c]));
        const personsMap = new Map(persons.map(p => [p.personId, p]));
        
        relCompaniesAccounts.forEach(l => {
            const az = companiesMap.get(l.companyId);
            if (az) personalInformationMap.set(l.accountId, { nome: az.companyName, tipo: "Company", bloccato: az.isBlocked });
        });

        relPersonAccounts.forEach(l => {
            const pr = personsMap.get(l.personId);
            if (pr) personalInformationMap.set(l.accountId, { nome: pr.personName, tipo: "Person", bloccato: pr.isBlocked });
        });

        const enrichInitialStructure = (item) => {
            const idIntermedioStr = item.intermedioId || '';
            const idFinaleStr = item.finaleId || '';
            
            const getNumber = (value) => {
                if (value == null) return 0;
                if (typeof value === 'object' && value.low !== undefined) return value.low;
                const p = Number(value);
                return isNaN(p) ? 0 : p;
            };    

            const intermediateInfo = personalInformationMap.get(idIntermedioStr) || {};
            const finalInfo = personalInformationMap.get(idFinaleStr) || {};
            
            return {
                intermediateName: intermediateInfo.nome || `Nome Unknown ${idIntermedioStr}`,
                intermediateType: intermediateInfo.tipo || "Unknown",
                finalName: finalInfo.nome || `Nome Unknown ${idFinaleStr}`,
                finalType: finalInfo.tipo || "Unknown",
                monthTotalAction: getNumber(item.azioniTraDue),
                monthTotalActionYear: getNumber(item.azioniTraDueFinale),
                monthTotalMoney: parseFloat(getNumber(item.totaleSoldiSpostati).toFixed(2)),
                monthTotalMoneyYear: parseFloat(getNumber(item.totaleSoldiSpostatiFinaleAnnuo).toFixed(2)),
                totFinalAccountActionYear: getNumber(item.azioniTotaliAnnoFinale),
            };
        };

        return res.json({
            success: true,
            riassuntoFinanziario: {
                entrateTotali: parseFloat(totMonthProfit.toFixed(2)),
                usciteTotali: parseFloat(totMonthSpendings.toFixed(2)),
            },
            profitList: finalProfit.map(item => enrichInitialStructure(item)),
            spendingsList: finalSpendings.map(item => enrichInitialStructure(item))
        });

    } catch (error) {
        console.error("Errore nel calcolo federato:", error);
        return res.status(500).json({ success: false, error: "Errore interno del server." });
    } finally {
        if (sessionNeo4j) {
            await sessionNeo4j.close();
        }
    }
});

module.exports = router;

function parseNeo4jNumber(val, isInt = false) {
    if (val?.toNumber) return val.toNumber();
    if (val == null) return 0;
    return isInt ? (parseInt(val, 10) || 0) : (parseFloat(val) || 0);
}