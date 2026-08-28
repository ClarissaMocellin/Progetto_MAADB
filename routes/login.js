const express = require('express');
const router = express.Router();
const connectMongo = require('../config/mongo');

router.post('/extractProfiles', async (req, res) => {
    const {role, name} = req.body;
    const collectionName = role === 'azienda' ? 'Company' : 'Person';
    const errorText = role === 'azienda' ? "Nessuna azienda attiva trovata con questo nome." : "Nessun privato attivo trovato con questo nome";
    const partialName = collectionName.toLowerCase();

    try {
        const db = await connectMongo();
        const targetCollection = db.collection(collectionName);
        const dynamicNameField = `${partialName}Name`;

        const records = await targetCollection.find({
            [dynamicNameField]: name, 
            isBlocked: false 
        }).toArray();
    
        if (records.length === 0) {
            return res.status(404).json({
                success: false, 
                error: errorText
            });
        }

        const entityList = records.map(item => ({
            id: item[`${partialName}Id`], 
            name: item[`${partialName}Name`], 
            country: item["country"]
        }));

        return res.json({
            success: true, 
            user: entityList
        });

    } catch (error) {
        return res.status(500).json({
            success: false, 
            error: "Errore interno del server di database."
        });
    }
});    

module.exports = router;