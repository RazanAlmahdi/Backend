
// authHelper.js
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const msalConfig = require('./authConfig'); // your MSAL config file

// Create JWKS client using your tenant's OpenID configuration
const client = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${msalConfig.auth.tenantId}/discovery/v2.0/keys`
});

// Helper to get the signing key from the token header
function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

/**
 * Verify an Azure AD (Entra ID) access token
 * @param {string} token - JWT token from Authorization header
 * @returns {Promise<Object|null>} - decoded payload if valid, null otherwise
 */
async function verifyToken(token) {
    return new Promise((resolve, reject) => {
        if (!token) return resolve(null);

        jwt.verify(
            token,
            getKey,
            {
                algorithms: ['RS256'],
                audience: 'api://7c004284-596c-49c6-843e-25a7c6b87ba0', // your app registration's client ID
                issuer: `https://login.microsoftonline.com/${msalConfig.auth.tenantId}/v2.0`
            },
            (err, decoded) => {
                if (err) {
                    console.error("Token verification error:", err.message);
                    return resolve(null);
                }
                
        console.log("Decoded token:", decoded);
                resolve(decoded);
            }
        );
    });
}

module.exports = { verifyToken };


