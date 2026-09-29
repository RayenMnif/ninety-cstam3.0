const Fastify = require('fastify');
const fastifyPostgres = require('@fastify/postgres');
const fastifyRedis = require('@fastify/redis');

require('dotenv').config();

async function buildApp(){
    const app = Fastify({logger: true});

    await app.register(fastifyPostgres, {
        connectionString: process.env.DATABASE_URL, 
    });
    await app.register(fastifyRedis, {
        url: process.env.REDIS_URL,
    })

    await app.register(require('@fastify/websocket'));
    
    await app.register(require('./plugins/websocket'));
    await app.register(require('./plugins/billing'));
    await app.register(require('./plugins/auth'));
    
    await app.register(require('./routes/health'), {prefix: '/api'});
    await app.register(require('./routes/auth'), {prefix: '/api/auth'});
    await app.register(require('./routes/ws'));
    await app.register(require('./routes/sessions'), { prefix: '/api/sessions' });
    await app.register(require('./routes/wallets'), {prefix: '/api/wallets'});

    return app;
}
module.exports = buildApp;