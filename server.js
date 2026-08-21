const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectMongo = require('./config/mongo');
const {getSession} = require('./config/neo4j');

const app = express();
const PORT = process.env.PORT || 3000;
connectMongo();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/js/axios.min.js', express.static(path.join(__dirname, 'node_modules/axios/dist/axios.min.js')));

const loginRoutes = require('./routes/login');
//const privatoRoutes = require('./routes/privato');
//const aziendaRoutes = require('./routes/azienda');

app.use('/api/login', loginRoutes);
//app.use('/api/privato', privatoRoutes);
//app.use('/api/azienda', aziendaRoutes);

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`Server Express in esecuzione su http://localhost:${PORT}`);
    console.log(`==================================================`);
});