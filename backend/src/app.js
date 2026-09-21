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
    await app.register(require('./routes/health'), {prefix: '/api'});
    return app;
}
module.exports = buildApp;