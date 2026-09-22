const jwt = require('jsonwebtoken');
const fp = require('fastify-plugin');

async function authPlugin(fastify, opts){
    fastify.decorate('authenticate', async function (request, reply) {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')){
                return reply.status(401).send({
                    error: 'Unauthorized: Missing token header'
                });
            }
            const token = authHeader.split(' ')[1];
            const secret = process.env.JWT_SECRET;
        
            const decoded = jwt.verify(token, secret);
            request.user = decoded;
            
        } catch (error) {
            return reply.status(401).send({
                error: 'Unauthorized: Invalid or expired token'
            });
        }
    })
}

module.exports = fp(authPlugin);