// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { verifyToken } = require("./authHelper");
const { Pool } = require("pg");
const { DefaultAzureCredential } = require("@azure/identity");

const app = express();
app.use(express.json());
app.use(cors());

let pool;

(async () => {
  try {
    if (process.env.USE_AZURE_AD_FOR_DB === "true") {
      // Future: Azure AD token auth
      const credential = new DefaultAzureCredential();
      const token = await credential.getToken("https://ossrdbms-aad.database.windows.net");
      pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: token.token,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 5432,
        ssl: { rejectUnauthorized: false },
      });
    } else {
      // Classic username/password auth
      pool = new Pool({
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        port: process.env.PGPORT || 5432,
        ssl: { rejectUnauthorized: false },
      });
    }
    console.log("✅ Connected to Postgres DB.");
  } catch (err) {
    console.error("❌ Failed to connect to DB:", err.message);
  }
})();

// Middleware to verify Azure AD token
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

  const token = authHeader.split(" ")[1];
  const decoded = await verifyToken(token);
  if (!decoded) return res.status(403).json({ error: "Invalid token" });

  req.user = decoded;
  next();
}

// Basic test route
app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

// Get current logged-in user (like /api/me)
app.get("/api/me", authenticate, async (req, res) => {
  try {
    const email = req.user.preferred_username || req.user.upn;
    const result = await pool.query(
      `SELECT u.*, r.role_name, d.department_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.user_principal_name = $1
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const user = result.rows[0];

    // Map to dashboard
    let dashboard = "default-dashboard.html";
    const roleName = user.role_name?.toLowerCase();
    if (roleName?.includes("manager")) dashboard = "pm-dashboard.html";
    else if (roleName?.includes("leader")) dashboard = "tl-dashboard.html";
    else if (roleName?.includes("engineer")) dashboard = "engineer-dashboard.html";

    res.json({
      message: "Authenticated",
      user: {
        id: user.id,
        display_name: user.display_name,
        email: user.user_principal_name,
        role: user.role_name,
        department_name: user.department_name,
      },
      dashboard_path: dashboard,
    });
  } catch (err) {
    console.error("Error fetching user:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
