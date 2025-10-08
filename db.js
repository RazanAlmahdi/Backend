// config/db.js
const { Pool } = require('pg');
const { DefaultAzureCredential } = require('@azure/identity');
require('dotenv').config();

async function createDbPool() {
  // Get Azure AD token for Postgres
  const credential = new DefaultAzureCredential();
  const accessToken = await credential.getToken("https://ossrdbms-aad.database.windows.net");

  const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    password: accessToken.token, // Token instead of password
    ssl: { rejectUnauthorized: false }
  });

  return pool;
}

module.exports = createDbPool;

