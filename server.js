
const express = require("express");
const path = require("path");
require("dotenv").config();



const pool = require("./db");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// 1. Home route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 2. Test MySQL connection
app.get("/api/health", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 AS connected");

        res.json({
            message: "Backend and MySQL connected successfully",
            database: process.env.DB_NAME,
            connected: rows[0].connected === 1
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            error: "Database connection failed"
        });
    }
});

// 3. Get all locations
app.get("/api/locations", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM Locations ORDER BY location_id"
        );

        res.json(rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Could not fetch locations" });
    }
});

// 4. Get all weather observations with city names
app.get("/api/weather", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                w.observation_id,
                l.location_name,
                l.city,
                l.state,
                w.observation_time,
                w.temperature,
                w.humidity,
                w.rainfall,
                w.wind_speed
            FROM Weather_Observations w
            JOIN Locations l
                ON w.location_id = l.location_id
            ORDER BY w.observation_time DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            error: "Could not fetch weather observations"
        });
    }
});

// 5. Get observations for a particular city
app.get("/api/weather/city/:city", async (req, res) => {
    try {
        const city = req.params.city;

        const [rows] = await pool.execute(`
            SELECT
                l.city,
                w.observation_id,
                w.observation_time,
                w.temperature,
                w.humidity,
                w.rainfall,
                w.wind_speed
            FROM Weather_Observations w
            JOIN Locations l
                ON w.location_id = l.location_id
            WHERE LOWER(l.city) = LOWER(?)
            ORDER BY w.observation_time DESC
        `, [city]);

        res.json(rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "City search failed" });
    }
});

// 6. Add a weather observation
app.post("/api/weather", async (req, res) => {
    try {
        const {
            location_id,
            observation_time,
            temperature,
            humidity,
            rainfall,
            wind_speed
        } = req.body;

        if (
            location_id == null ||
            !observation_time ||
            temperature == null ||
            humidity == null ||
            rainfall == null ||
            wind_speed == null
        ) {
            return res.status(400).json({
                error: "All weather fields are required"
            });
        }

        const values = [
            location_id,
            observation_time,
            temperature,
            humidity,
            rainfall,
            wind_speed
        ];

        const numericValues = [
            location_id, temperature, humidity, rainfall, wind_speed
        ];

        if (
            numericValues.some(value =>
                typeof value !== "number" || !Number.isFinite(value)
            ) ||
            !Number.isInteger(location_id) ||
            location_id <= 0 ||
            humidity < 0 || humidity > 100 ||
            rainfall < 0 ||
            wind_speed < 0
        ) {
            return res.status(400).json({
                error: "Invalid numeric values. Humidity must be 0–100; rainfall and wind speed cannot be negative."
            });
        }

        const [result] = await pool.execute(`
            INSERT INTO Weather_Observations
            (location_id, observation_time, temperature,
             humidity, rainfall, wind_speed)
            VALUES (?, ?, ?, ?, ?, ?)
        `, values);

        res.status(201).json({
            message: "Weather observation added successfully",
            observation_id: result.insertId
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            error: "Could not add observation. Check the location ID and date format."
        });
    }
});

// 7. Average temperature by city
app.get("/api/weather/summary/average-temperature", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                l.city,
                ROUND(AVG(w.temperature), 2) AS average_temperature,
                COUNT(w.observation_id) AS total_observations
            FROM Locations l
            LEFT JOIN Weather_Observations w
                ON l.location_id = w.location_id
            GROUP BY l.location_id, l.city
            ORDER BY l.city
        `);

        res.json(rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            error: "Could not calculate average temperatures"
        });
    }
});

// Handle unknown routes
app.use((req, res) => {
    res.status(404).json({ error: "API route not found" });
});

// Start the server only after confirming the database works
async function startServer() {
    try {
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();

        const port = Number(process.env.PORT || 3000);

        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
            console.log("MySQL database connected successfully");
        });
    } catch (error) {
        console.error("Could not connect to MySQL:", error.message);
        process.exit(1);
    }
}

startServer();
