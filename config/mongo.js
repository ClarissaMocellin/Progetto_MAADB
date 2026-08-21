const { MongoClient } = require('mongodb');

const url = process.env.MONGO_URI; 
const client = new MongoClient(url);
let dbInstance = null;

async function connectMongo() {
    try {
        if (dbInstance) return dbInstance;

        await client.connect();
        console.log("Connessione a MongoDB completata con successo!");
        dbInstance = client.db(); 
        
        return dbInstance;
    } catch (error) {
        console.error("Errore durante la connessione a MongoDB:", error);
        process.exit(1);
    }
}

module.exports = connectMongo;