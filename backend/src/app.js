const Fastify = require('fastify');
const fastifyPostgres = require('@fastify/postgres');
const fastifyRedis = require('@fastify/redis');
const { AuthHandler } = require('./handlers/auth-handler');

require('dotenv').config();

async function buildApp(){
    const app = Fastify({
      logger: true, 
      ajv: {
        customOptions: {
        keywords: ['example'], 
        },
      },
    });

    await app.register(fastifyPostgres, {
        connectionString: process.env.DATABASE_URL, 
    });
    await app.register(fastifyRedis, {
        url: process.env.REDIS_URL,
    })

    const authHandler = new AuthHandler({
      db: app.pg,
      logger: app.log
    });
    app.decorate('authHandler', authHandler);

    // api docs 
    await app.register(require('@fastify/swagger'), {
        openapi: {
          info: {
            title: 'Esports Venue Management API',
            description: 'Backend REST API for workstation management, atomic billing, and session control.',
            version: '1.0.0',
          },
          servers: [
            {
              url: 'http://localhost:3000',
              description: 'Development Server',
            },
          ],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Enter your JWT access token',
              },
            },
          },
        },
      });
    
      await app.register(require('@fastify/swagger-ui'), {
        routePrefix: '/docs',
        uiConfig: {
          docExpansion: 'list',
          deepLinking: false,
        },
        uiHooks: {
          onRequest: function (request, reply, next) {
            next();
          },
          preHandler: function (request, reply, next) {
            next();
          },
        },
        staticCSP: true,
        transformStaticCSP: (header) => header,
      });

      
    await app.register(require('@fastify/websocket'));
    
    await app.register(require('./plugins/websocket'));
    await app.register(require('./plugins/auth'));
    await app.register(require('./plugins/sessionMonitor'));
    
    await app.register(require('./routes/health'), {prefix: '/api'});
    await app.register(require('./routes/auth'), {prefix: '/api/auth'});
    await app.register(require('./routes/ws'));
    await app.register(require('./routes/sessions'), { prefix: '/api/sessions' });
    await app.register(require('./routes/wallets'), {prefix: '/api/wallets'});
    await app.register(require('./routes/reservations'), {prefix: '/api/reservations'});
    await app.register(require('./routes/stations'), {prefix: '/api'});
    await app.register(require('./routes/tariff'), {prefix: '/api/tariff'});
    // await app.register(require('./routes/adminBan'), {prefix: '/api/admin'});
    await app.register(require('./routes/agent'), {prefix: '/api'});

    return app;
}
module.exports = buildApp;