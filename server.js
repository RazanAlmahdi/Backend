// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { verifyToken } = require("./authHelper");
const { Pool } = require("pg");
const { DefaultAzureCredential } = require("@azure/identity");

const app = express();

const allowedOrigins = [
  "https://purple-field-0ffa0871e.2.azurestaticapps.net",
  "http://localhost:4280" // for local testing
];
app.use(cors({
  origin: true, // allow all origins temporarily
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// app.use(cors({
//   origin: (origin, callback) => {
//     if (!origin || allowedOrigins.includes(origin)) callback(null, true);
//     else callback(new Error("Not allowed by CORS"));
//   },
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   credentials: true,
// }));
// app.use(express.json());

// // Explicit preflight
// app.options("*", cors({
//   origin: allowedOrigins,
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   credentials: true
// }));


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

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://purple-field-0ffa0871e.2.azurestaticapps.net");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// Basic test route
app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

// // Get current logged-in user (like /api/me)
// app.get("/api/me", authenticate, async (req, res) => {
//   try {
//     const email = req.user.preferred_username || req.user.upn;
//     const result = await pool.query(
//       `SELECT u.*, r.role_name, d.department_name
//        FROM users u
//        LEFT JOIN roles r ON u.role_id = r.id
//        LEFT JOIN departments d ON u.department_id = d.id
//        WHERE u.user_principal_name = $1
//        LIMIT 1`,
//       [email]
//     );

//     if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
//     const user = result.rows[0];

//     // Map to dashboard
//     let dashboard = "default-dashboard.html";
//     const roleName = user.role_name?.toLowerCase();
//     if (roleName?.includes("manager")) dashboard = "pm-dashboard.html";
//     else if (roleName?.includes("leader")) dashboard = "tl-dashboard.html";
//     else if (roleName?.includes("engineer")) dashboard = "engineer-dashboard.html";

//     res.json({
//       message: "Authenticated",
//       user: {
//         id: user.id,
//         display_name: user.display_name,
//         email: user.user_principal_name,
//         role: user.role_name,
//         department_name: user.department_name,
//       },
//       dashboard_path: dashboard,
//     });
//   } catch (err) {
//     console.error("Error fetching user:", err.message);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // ========================= INDEX & PM ENDPOINTS =========================

// // GET /api/me - returns logged-in user info
// app.get("/api/me", authenticate, async (req, res) => {
//   try {
//     const email = req.user.preferred_username || req.user.upn;
//     const { rows } = await pool.query(
//       `SELECT u.id, u.display_name, u.user_principal_name, r.role_name, d.department_name
//        FROM users u
//        LEFT JOIN roles r ON u.role_id = r.id
//        LEFT JOIN departments d ON u.department_id = d.id
//        WHERE u.user_principal_name = $1
//        LIMIT 1`,
//       [email]
//     );

//     if (!rows.length) return res.status(404).json({ error: "User not found" });

//     const user = rows[0];

//     const redirect =
//       user.role_name.toLowerCase().includes("manager") ? "/pm-dashboard.html" :
//       user.role_name.toLowerCase().includes("leader") ? "/tl-dashboard.html" :
//       user.role_name.toLowerCase().includes("engineer") ? "/engineer-dashboard.html" :
//       "/index.html";

//     res.json({
//       id: user.id,
//       display_name: user.display_name,
//       email: user.user_principal_name,
//       role: user.role_name,
//       department_name: user.department_name,
//       redirect
//     });

//   } catch (err) {
//     console.error("Error in /api/me:", err);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // GET /api/services - fetch all services with department
// app.get("/api/services", authenticate, async (req, res) => {
//   try {
//     const { rows } = await pool.query(`
//       SELECT s.id, s.service_name, s.description, d.department_name
//       FROM services s
//       JOIN departments d ON s.department_id = d.id
//       ORDER BY d.department_name, s.service_name
//     `);
//     res.json(rows);
//   } catch (err) {
//     console.error("Error in /api/services:", err);
//     res.status(500).json({ error: "Failed to fetch services" });
//   }
// });

// // GET /api/departments - fetch all departments
// app.get("/api/departments", authenticate, async (req, res) => {
//   try {
//     const { rows } = await pool.query(`
//       SELECT id, department_name FROM departments ORDER BY department_name
//     `);
//     res.json(rows);
//   } catch (err) {
//     console.error("Error in /api/departments:", err);
//     res.status(500).json({ error: "Failed to fetch departments" });
//   }
// });

// // POST /api/requests - submit a new service request
// app.post("/api/requests", authenticate, async (req, res) => {
//   try {
//     const { project_name, specifications, deadline, priority, service_id, requested_by_user_id } = req.body;

//     if (!project_name || !service_id || !requested_by_user_id)
//       return res.status(400).json({ error: "Missing required fields" });

//     const { rows } = await pool.query(
//       `INSERT INTO requests (project_name, specifications, deadline, priority, service_id, requested_by_user_id, created_at)
//        VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id`,
//       [project_name, specifications, deadline, priority, service_id, requested_by_user_id]
//     );

//     res.status(201).json({ success: true, request_id: rows[0].id });
//   } catch (err) {
//     console.error("Error in POST /api/requests:", err);
//     res.status(500).json({ error: "Failed to create request" });
//   }
// });

// // GET /api/requests - optional: fetch all requests (for PM dashboard)
// app.get("/api/requests", authenticate, async (req, res) => {
//   try {
//     const { rows } = await pool.query(`
//       SELECT r.id, r.project_name, r.priority, s.service_name, d.department_name, r.status
//       FROM requests r
//       JOIN services s ON r.service_id = s.id
//       JOIN departments d ON s.department_id = d.id
//       ORDER BY r.created_at DESC
//     `);
//     res.json(rows);
//   } catch (err) {
//     console.error("Error in GET /api/requests:", err);
//     res.status(500).json({ error: "Failed to fetch requests" });
//   }
// });

// // ------------------------- ENGINEER ENDPOINTS -------------------------

// // Get all requests assigned to a specific engineer
// app.get("/api/engineer/tasks/:id", authenticate, async (req, res) => {
//   try {
//     const engineerId = req.params.id;
//     const result = await pool.query(
//       `SELECT r.*, s.service_name, d.department_name
//        FROM requests r
//        JOIN services s ON r.service_id = s.id
//        JOIN departments d ON r.department_id = d.id
//        JOIN assigned_users a ON a.request_id = r.id
//        WHERE a.assigned_to_user_id = $1
//        ORDER BY r.created_at DESC`,
//       [engineerId]
//     );
//     res.json(result.rows);
//   } catch (err) {
//     console.error("Error fetching engineer tasks:", err.message);
//     res.status(500).json({ error: "Failed to load engineer tasks" });
//   }
// });

// // Update the task status (in_progress, completed, overdue)
// app.put("/api/engineer/tasks/update", authenticate, async (req, res) => {
//   try {
//     const { request_id, status } = req.body;
//     if (!request_id || !status)
//       return res.status(400).json({ error: "Missing request_id or status" });

//     const result = await pool.query(
//       `UPDATE assigned_users
//        SET status = $1, updated_at = NOW()
//        WHERE request_id = $2 RETURNING *`,
//       [status, request_id]
//     );
//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("Error updating task:", err.message);
//     res.status(500).json({ error: "Failed to update task status" });
//   }
// });

// // Get engineer info
// app.get("/api/user/:id", authenticate, async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT id, display_name, department_id FROM users WHERE id = $1`,
//       [req.params.id]
//     );
//     res.json(result.rows[0] || {});
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });


// // ------------------------- TEAM LEADER ENDPOINTS -------------------------

// // Get TL info
// app.get("/api/user/:id", authenticate, async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT id, display_name, department_id FROM users WHERE id = $1`,
//       [req.params.id]
//     );
//     res.json(result.rows[0] || {});
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Return engineer role ID
// app.get("/api/roles/engineer", authenticate, async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT id FROM roles WHERE LOWER(role_name) LIKE '%engineer%' LIMIT 1`
//     );
//     res.json(result.rows[0] || {});
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Get engineers for a department
// app.get("/api/users", authenticate, async (req, res) => {
//   try {
//     const { department_id, role_id } = req.query;
//     const result = await pool.query(
//       `SELECT id, display_name FROM users WHERE department_id = $1 AND role_id = $2`,
//       [department_id, role_id]
//     );
//     res.json(result.rows);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Fetch requests by status + department
// app.get("/api/requests", authenticate, async (req, res) => {
//   try {
//     const { status, department_id } = req.query;
//     const result = await pool.query(
//       `SELECT * FROM requests WHERE status = $1 AND department_id = $2 ORDER BY created_at DESC`,
//       [status, department_id]
//     );
//     res.json(result.rows);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Approve request (move to in_progress)
// app.put("/api/requests/:id/approve", authenticate, async (req, res) => {
//   try {
//     const result = await pool.query(
//       `UPDATE requests SET status = 'in_progress' WHERE id = $1 RETURNING *`,
//       [req.params.id]
//     );
//     res.json(result.rows[0]);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Decline request
// app.delete("/api/requests/:id", authenticate, async (req, res) => {
//   try {
//     await pool.query(`DELETE FROM requests WHERE id = $1`, [req.params.id]);
//     res.json({ message: "Request declined/deleted" });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Assign engineers to a request
// app.post("/api/assign", authenticate, async (req, res) => {
//   try {
//     const { request_id, engineer_ids, assigned_by_team_leader_id } = req.body;
//     if (!request_id || !engineer_ids?.length)
//       return res.status(400).json({ error: "Missing required fields" });

//     const insertPromises = engineer_ids.map(id =>
//       pool.query(
//         `INSERT INTO assigned_users (request_id, assigned_to_user_id, assigned_by_team_leader_id, status, assigned_at)
//          VALUES ($1, $2, $3, 'assigned', NOW()) RETURNING *`,
//         [request_id, id, assigned_by_team_leader_id]
//       )
//     );
//     const results = await Promise.all(insertPromises);
//     res.json(results.map(r => r.rows[0]));
//   } catch (err) {
//     console.error("Error assigning engineers:", err.message);
//     res.status(500).json({ error: "Failed to assign engineers" });
//   }
// });
// ========================= INDEX & PM ENDPOINTS =========================

// GET /api/me - returns logged-in user info
app.get("/api/me", authenticate, async (req, res) => {
  try {
    const email = req.user.preferred_username || req.user.upn;
    const { rows } = await pool.query(
      `SELECT u.id, u.display_name, u.user_principal_name, r.role_name, d.department_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.user_principal_name = $1
       LIMIT 1`,
      [email]
    );

    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const user = rows[0];

    const redirect =
      user.role_name.toLowerCase().includes("manager") ? "/pm-dashboard.html" :
      user.role_name.toLowerCase().includes("leader") ? "/tl-dashboard.html" :
      user.role_name.toLowerCase().includes("engineer") ? "/engineer-dashboard.html" :
      "/index.html";

    res.json({
      id: user.id,
      display_name: user.display_name,
      email: user.user_principal_name,
      role: user.role_name,
      department_name: user.department_name,
      redirect
    });

  } catch (err) {
    console.error("Error in /api/me:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/services - fetch all services with department
app.get("/api/services", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.service_name, s.description, d.department_name
      FROM services s
      JOIN departments d ON s.department_id = d.id
      ORDER BY d.department_name, s.service_name
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error in /api/services:", err);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

// GET /api/departments - fetch all departments
app.get("/api/departments", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, department_name FROM departments ORDER BY department_name
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error in /api/departments:", err);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

// POST /api/requests - submit a new service request
app.post("/api/requests", authenticate, async (req, res) => {
  try {
    const { project_name, specifications, deadline, priority, service_id, requested_by_user_id } = req.body;

    if (!project_name || !service_id || !requested_by_user_id)
      return res.status(400).json({ error: "Missing required fields" });

    const { rows } = await pool.query(
      `INSERT INTO requests (project_name, specifications, deadline, priority, service_id, requested_by_user_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id`,
      [project_name, specifications, deadline, priority, service_id, requested_by_user_id]
    );

    res.status(201).json({ success: true, request_id: rows[0].id });
  } catch (err) {
    console.error("Error in POST /api/requests:", err);
    res.status(500).json({ error: "Failed to create request" });
  }
});

// ========================= REQUESTS (PM + TL unified) =========================

// Unified GET /api/requests
// - PMs see all requests
// - TLs can pass ?department_id=... to see only their department
// - Optional ?status=... filter
app.get("/api/requests", authenticate, async (req, res) => {
  try {
    const { status, department_id } = req.query;
    let query = `
      SELECT r.id, r.project_name, r.priority, r.status, r.created_at,
             s.service_name, d.department_name
      FROM requests r
      JOIN services s ON r.service_id = s.id
      JOIN departments d ON s.department_id = d.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push(`r.status = $${params.length + 1}`);
      params.push(status);
    }

    if (department_id) {
      conditions.push(`s.department_id = $${params.length + 1}`);
      params.push(department_id);
    }

    if (conditions.length) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY r.created_at DESC";

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/requests:", err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// ========================= ENGINEER ENDPOINTS =========================

// Get all requests assigned to a specific engineer
app.get("/api/engineer/tasks/:id", authenticate, async (req, res) => {
  try {
    const engineerId = req.params.id;
    const result = await pool.query(
      `SELECT r.*, s.service_name, d.department_name
       FROM requests r
       JOIN services s ON r.service_id = s.id
       JOIN departments d ON s.department_id = d.id
       JOIN assigned_users a ON a.request_id = r.id
       WHERE a.assigned_to_user_id = $1
       ORDER BY r.created_at DESC`,
      [engineerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching engineer tasks:", err.message);
    res.status(500).json({ error: "Failed to load engineer tasks" });
  }
});

// Update the task status (in_progress, completed, overdue)
app.put("/api/engineer/tasks/update", authenticate, async (req, res) => {
  try {
    const { request_id, status } = req.body;
    if (!request_id || !status)
      return res.status(400).json({ error: "Missing request_id or status" });

    const result = await pool.query(
      `UPDATE assigned_users
       SET status = $1, updated_at = NOW()
       WHERE request_id = $2 RETURNING *`,
      [status, request_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating task:", err.message);
    res.status(500).json({ error: "Failed to update task status" });
  }
});

// ========================= SHARED USER & ROLE ENDPOINTS =========================

// Get user info (used by both TL & Engineer dashboards)
app.get("/api/user/:id", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, display_name, department_id FROM users WHERE id = $1`,
      [req.params.id]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return engineer role ID
app.get("/api/roles/engineer", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id FROM roles WHERE LOWER(role_name) LIKE '%engineer%' LIMIT 1`
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get engineers for a department
app.get("/api/users", authenticate, async (req, res) => {
  try {
    const { department_id, role_id } = req.query;
    const result = await pool.query(
      `SELECT id, display_name FROM users WHERE department_id = $1 AND role_id = $2`,
      [department_id, role_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================= TEAM LEADER ACTIONS =========================

// Approve request (move to in_progress)
app.put("/api/requests/:id/approve", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE requests SET status = 'in_progress' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Decline request
app.delete("/api/requests/:id", authenticate, async (req, res) => {
  try {
    await pool.query(`DELETE FROM requests WHERE id = $1`, [req.params.id]);
    res.json({ message: "Request declined/deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assign engineers to a request
app.post("/api/assign", authenticate, async (req, res) => {
  try {
    const { request_id, engineer_ids, assigned_by_team_leader_id } = req.body;
    if (!request_id || !engineer_ids?.length)
      return res.status(400).json({ error: "Missing required fields" });

    const insertPromises = engineer_ids.map(id =>
      pool.query(
        `INSERT INTO assigned_users (request_id, assigned_to_user_id, assigned_by_team_leader_id, status, assigned_at)
         VALUES ($1, $2, $3, 'assigned', NOW()) RETURNING *`,
        [request_id, id, assigned_by_team_leader_id]
      )
    );
    const results = await Promise.all(insertPromises);
    res.json(results.map(r => r.rows[0]));
  } catch (err) {
    console.error("Error assigning engineers:", err.message);
    res.status(500).json({ error: "Failed to assign engineers" });
  }
});


// ========================= END OF ENDPOINTS =========================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
