# Progetto MAADB

E' un progetto Node.js che utilizza MongoDB (con Sharding e Replica Set) e Neo4j.

## Configurazione del Database

### 1. MongoDB
Comandi per ricreare la struttura comprensiva di due shard e tre nodi per ogni replica set, questi sono riportati in un file start.bat per permettere l'avvio dei diversi terminali tutti assieme:

```bash
@echo off
set USER_PATH=[cartella_in_cui_creare_il_cluster]

echo === CREAZIONE CARTELLE DEI DATI ===
if not exist "%USER_PATH%\config" mkdir "%USER_PATH%\config"
if not exist "%USER_PATH%\sh1_n1" mkdir "%USER_PATH%\sh1_n1"
if not exist "%USER_PATH%\sh1_n2" mkdir "%USER_PATH%\sh1_n2"
if not exist "%USER_PATH%\sh1_n3" mkdir "%USER_PATH%\sh1_n3"
if not exist "%USER_PATH%\sh2_n1" mkdir "%USER_PATH%\sh2_n1"
if not exist "%USER_PATH%\sh2_n2" mkdir "%USER_PATH%\sh2_n2"
if not exist "%USER_PATH%\sh2_n3" mkdir "%USER_PATH%\sh2_n3"

echo === AVVIO CONFIG SERVER (1 NODO) ===
start "Config Server" mongod --configsvr --replSet configReplSet --dbpath "%USER_PATH%\config" --port 27019 --bind_ip localhost --wiredTigerCacheSizeGB 0.25

echo === AVVIO SHARD 1 (REPLICA SET - 3 NODI) ===
start "Shard 1 - Nodo 1" mongod --shardsvr --replSet sh1ReplSet --dbpath "%USER_PATH%\sh1_n1" --port 27011 --bind_ip localhost --wiredTigerCacheSizeGB 0.25
start "Shard 1 - Nodo 2" mongod --shardsvr --replSet sh1ReplSet --dbpath "%USER_PATH%\sh1_n2" --port 27012 --bind_ip localhost --wiredTigerCacheSizeGB 0.25
start "Shard 1 - Nodo 3" mongod --shardsvr --replSet sh1ReplSet --dbpath "%USER_PATH%\sh1_n3" --port 27013 --bind_ip localhost --wiredTigerCacheSizeGB 0.25

echo === AVVIO SHARD 2 (REPLICA SET - 3 NODI) ===
start "Shard 2 - Nodo 1" mongod --shardsvr --replSet sh2ReplSet --dbpath "%USER_PATH%\sh2_n1" --port 27014 --bind_ip localhost --wiredTigerCacheSizeGB 0.25
start "Shard 2 - Nodo 2" mongod --shardsvr --replSet sh2ReplSet --dbpath "%USER_PATH%\sh2_n2" --port 27015 --bind_ip localhost --wiredTigerCacheSizeGB 0.25
start "Shard 2 - Nodo 3" mongod --shardsvr --replSet sh2ReplSet --dbpath "%USER_PATH%\sh2_n3" --port 27016 --bind_ip localhost --wiredTigerCacheSizeGB 0.25

timeout /t 5 /nobreak > nul

echo === AVVIO ROUTER MONGOS ===
start "Router Mongos" mongos --configdb configReplSet/localhost:27019 --port 27017 --bind_ip localhost

echo CLUSTER AVVIATO
pause
```

Comandi relativi alla configurazione dei diversi nodi, questi dovranno essere eseguiti una sola volta dal momento che le informazioni verranno salvate all'interno del server config:

```bash
// Connessione al server config, creazione di un replica set con un solo elemento, se stesso
mongosh --port 27019
rs.initiate()
exit

// Connessione a un nodo del primo shard per creazione del replica set
mongosh --port 27011
rs.initiate({
   _id: "sh1ReplSet",
   members: [
      {_id:0, host:"localhost:27011"},
      {_id:1, host:"localhost:27012"},
      {_id:2, host:"localhost:27013"}
   ]
})
exit

// Connessione a un nodo del secondo shard per creazione del replica set
mongosh --port 27014
rs.initiate({
   _id: "sh2ReplSet",
   members: [
      {_id:0, host:"localhost:27014"},
      {_id:1, host:"localhost:27015"},
      {_id:2, host:"localhost:27016"}
   ]
})
exit

// Collegamento al router dei tre replica set creati precedentemente
mongosh --port 27017
sh.addShard("sh1ReplSet/localhost:27011,localhost:27012,localhost:27013")
sh.addShard("sh2ReplSet/localhost:27014,localhost:27015,localhost:27016")

// Attivazione sharding su FinBenchDB e impostazione chiave con creazione delle 11 collezioni: Account, Company, Person, Medium, Loan, CompanyOwnAccount, PersonOwnAccount, etc.
sh.enableSharding("FinBenchDB")
sh.shardCollection("FinBenchDB.nome_collezione", {campo_per_sharding: "hashed"})

```
**Nota: I dati sono stati caricati nelle collezioni utilizzando MongoDB Compass partendo da dei file JSON precedentemente ripuliti**

### 2. Neo4j (Neo4j Desktop)
Creato il DB relativo utilizzando l'app Desktop disponibile. Contiene i dati relativi alle transazioni e agli investimenti.

## Esecuzione progetto
Prima di lanciare il progetto, serve avviare sia Mongo che Neo4j e successivamente utilizzare il comando:

```bash
node server.js
```

## Impostazione file .env
```bash
PORT=3000

MONGO_URI=mongo_url

NEO4J_URI=neo4j_url
NEO4J_USER=neo4j_user
NEO4J_PASSWORD=neo4j_password
NEO4J_DATABASE=neo4j_nome_db
```