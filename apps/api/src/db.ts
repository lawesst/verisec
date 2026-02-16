import "./env.js";
import mysql from "mysql2/promise";

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  MYSQLHOST,
  MYSQLPORT,
  MYSQLUSER,
  MYSQLPASSWORD,
  MYSQLDATABASE
} = process.env;

const host = DB_HOST ?? MYSQLHOST ?? "127.0.0.1";
const port = Number(DB_PORT ?? MYSQLPORT ?? "3306");
const user = DB_USER ?? MYSQLUSER ?? "root";
const password = DB_PASSWORD ?? MYSQLPASSWORD ?? "";
const database = DB_NAME ?? MYSQLDATABASE ?? "verisec";

export const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  connectionLimit: 10,
  namedPlaceholders: true,
  dateStrings: true,
  timezone: "Z"
});
