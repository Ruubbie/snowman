import mysql from 'mysql2/promise';

/**
 * Create a mysql2/promise pool from a mysql:// connection URL.
 * @param {string} databaseUrl
 * @returns {import('mysql2/promise').Pool}
 */
export function createPool(databaseUrl) {
  return mysql.createPool({
    uri: databaseUrl,
    charset: 'utf8mb4_unicode_ci',
    dateStrings: false,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z', // store/read DATETIME as UTC
  });
}
