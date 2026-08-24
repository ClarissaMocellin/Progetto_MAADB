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
        console.log("ID:", personIdstr)
        const db = await connectMongo();
        const targetCollection = db.collection("PersonOwnAccount");

        
        const foundAccounts = await targetCollection.find({  
            personId: personIdstr 
        }).toArray();

        const formattedResult = foundAccounts.map(conto => {
            return {
                accountId: conto.accountId ? conto.accountId.toString() : conto._id.toString()
            };
        });
        
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

        const startDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1, 0, 0, 0, 0)).toISOString();
        const endDate = new Date(Date.UTC(parseInt(year), parseInt(month), 1, 0, 0, 0, 0)).toISOString();
        const startYearDate = new Date(Date.UTC(parseInt(year), 0, 1, 0, 0, 0, 0)).toISOString();
        const endYearDate = new Date(Date.UTC(parseInt(year) + 1, 0, 1, 0, 0, 0, 0)).toISOString();
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
                intermedioNome: coalesce(dest.name, ""),
                intermedioTipo: coalesce(dest.type, ""),
                finaleNome: coalesce(dest2.name, ""),
                finaleTipo: coalesce(dest2.type, ""),
                azioniTraDue: numeroAzioniMese,
                totaleSoldiSpostati: totaleSoldiSpostatiMese,
                azioniTraDueFinale: case when dest2 is not null then azioniTraDueFinale else 0 end,
                totaleSoldiSpostatiFinaleAnnuo: case when dest2 is not null then coalesce(totaleSoldiSpostatiFinaleAnnuo, 0) else 0 end,
                azioniTotaliAnnoFinale: case when dest2 is not null then azioniTotaliAnno else 0 end
            }) AS listaUsciteConsolidate
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
                intermedioNome: coalesce(src.name, ""),
                intermedioTipo: coalesce(src.type, ""),
                finaleNome: coalesce(src2.name, ""),
                finaleTipo: coalesce(src2.type, ""),
                azioniTraDue: numeroAzioniMeseSrc,
                totaleSoldiSpostati: coalesce(totaleSoldiSpostatiMeseSrc, 0),
                azioniTraDueFinale: case when src2 is not null then azioniTraDueFinaleSrc else 0 end,
                totaleSoldiSpostatiFinale: case when src2 is not null then coalesce(totaleSoldiSpostatiFinaleSrc, 0) else 0 end,
                azioniTotaliAnnoFinale: case when src2 is not null then azioniTotaliAnnoSrc else 0 end
            }) AS listaEntrateConsolidate
        }

        RETURN 
            totaleUsciteMese,
            totaleEntrateMese,
            COALESCE(listaUsciteConsolidate, []) AS listaUscite,
            COALESCE(listaEntrateConsolidate, []) AS listaEntrate
        `;

        const resultGraph = await sessionNeo4j.run(queryCypher, {
            idSelectedAccount: idSelectedAccount,
            startDate: startDate,
            endDate: endDate,
            startYearDate:startYearDate,
            endYearDate: endYearDate
        });

        let totaleUsciteMese = 0;
        let totaleEntrateMese = 0;
        const usciteFinali = [];
        const entrateFinali = [];
        const idContiDaCercare = new Set();

        if (resultGraph.records.length > 0) {
            const record = resultGraph.records[0];
            totaleUsciteMese = parseNeo4jNumber(record.get('totaleUsciteMese'));
            totaleEntrateMese = parseNeo4jNumber(record.get('totaleEntrateMese'));
        
            const usciteConsolidate = record.get('listaUscite') || [];
            const entrateConsolidate = record.get('listaEntrate') || [];
            
            usciteConsolidate.forEach(item => {
                const idIntermedio = item.intermedioId ? String(item.intermedioId) : '';
                const idFinale = item.finaleId ? String(item.finaleId) : '';
                
                if (idIntermedio) idContiDaCercare.add(idIntermedio);
                if (idFinale) idContiDaCercare.add(idFinale);
                usciteFinali.push(item);
            });
            
            entrateConsolidate.forEach(item => {
                const idIntermedio = item.intermedioId ? String(item.intermedioId) : '';
                const idFinale = item.finaleId ? String(item.finaleId) : '';
                
                if (idIntermedio) idContiDaCercare.add(idIntermedio);
                if (idFinale) idContiDaCercare.add(idFinale);
                entrateFinali.push(item);
            });
        }
        
        // ============================== MongoDB ===================================
        const dbMongo = await connectMongo();
        const arrayIdConti = Array.from(idContiDaCercare).map(id => {
            if (id && id.low !== undefined) return id.toString(); 
            return String(id).trim();
        });

        const [legamiAziende, legamiPersone] = await Promise.all([
            arrayIdConti.length > 0
                ? dbMongo.collection('CompanyOwnAccount').find({ accountId: { $in: arrayIdConti } }).toArray()
                : Promise.resolve([]),
            arrayIdConti.length > 0
                ? dbMongo.collection('PersonOwnAccount').find({ accountId: { $in: arrayIdConti } }).toArray()
                : Promise.resolve([])
        ]);

        console.log(legamiAziende, legamiPersone);

        const [aziende, persone] = await Promise.all([
            legamiAziende.length > 0 
                ? dbMongo.collection('Company').find({ companyId: { $in: legamiAziende.map(l => l.companyId.toString()) } }).toArray() 
                : Promise.resolve([]),
            legamiPersone.length > 0 
                ? dbMongo.collection('Person').find({ personId: { $in: legamiPersone.map(l => l.personId.toString()) } }).toArray() 
                : Promise.resolve([])
        ]);

        const mappaAnagrafiche = new Map();
        
        legamiAziende.forEach(l => {
            const az = aziende.find(c => c.companyId.toString() === l.companyId.toString());
            if (az) mappaAnagrafiche.set(l.accountId.toString(), { nome: az.companyName, tipo: "Company", bloccato: az.isBlocked ?? false });
        });

        legamiPersone.forEach(l => {
            const pr = persone.find(p => p.personId.toString() === l.personId.toString());
            if (pr) mappaAnagrafiche.set(l.accountId.toString(), { nome: pr.personName, tipo: "Person", bloccato: pr.isBlocked ?? false });
        });

        const arricchisciFlussoConsolidato = (item) => {
            const idIntermedioStr = item.intermedioId ? item.intermedioId.toString() : '';
            const idFinaleStr = item.finaleId ? item.finaleId.toString() : '';
            
            const anagraficaIntermedio = mappaAnagrafiche.get(idIntermedioStr) || {};
            const anagraficaFinale = mappaAnagrafiche.get(idFinaleStr) || {};
            
            const getNumero = (valore) => {
                if (valore === null || valore === undefined) return 0;
                if (typeof valore === 'object' && valore.low !== undefined) return valore.low;
                const p = Number(valore);
                return isNaN(p) ? 0 : p;
            };

            const azioniMese = getNumero(item.azioniTraDue);
            const soldiSpostati = parseFloat(getNumero(item.totaleSoldiSpostati).toFixed(2));
            const azioniAnnueFinale = getNumero(item.azioniTraDueFinale);
            const soldiSpostatiFinaleAnnuo = parseFloat(getNumero(item.totaleSoldiSpostatiFinaleAnnuo).toFixed(2));
            const azioniAnno = getNumero(item.azioniTotaliAnnoFinale);

            return {
                intermedioNome: anagraficaIntermedio.nome || `Nome Unknown ${idIntermedioStr}`,
                intermedioTipo: anagraficaIntermedio.tipo || "Unknown",
                finaleNome: anagraficaFinale.nome || `Nome Unknown ${idFinaleStr}`,
                finaleTipo: anagraficaFinale.tipo || "Unknown",
                azioniNelMese: azioniMese,
                azioniAnnueFinale: azioniAnnueFinale,
                importo: soldiSpostati,
                importoFinaleAnnuo: soldiSpostatiFinaleAnnuo,
                trasferimentiRicevutiContoFinale: azioniAnno,
            };
        };

        const elencoUsciteFinali = usciteFinali.map(item => arricchisciFlussoConsolidato(item));
        const elencoEntrateFinali = entrateFinali.map(item => arricchisciFlussoConsolidato(item));

        return res.json({
            success: true,
            riassuntoFinanziario: {
                entrateTotali: parseFloat(totaleEntrateMese.toFixed(2)),
                usciteTotali: parseFloat(totaleUsciteMese.toFixed(2)),
            },
            listaEntrate: elencoEntrateFinali,
            listaUscite: elencoUsciteFinali
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