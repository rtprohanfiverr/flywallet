const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!SECRET) throw new Error('JWT_SECRET is not set in environment variables');

/**
 * Sign a JWT token for a user
 * @param {{ id: string, email: string, role: string }} payload
 */
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
