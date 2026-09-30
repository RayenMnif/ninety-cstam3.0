const crypto = require('crypto');
const { registerAgentSchema, agentLookupSchema } = require('../schemas/agent.schema');

async function agent(fastify, opts) {
  fastify.post('/agent/register', { schema: registerAgentSchema }, async (request, reply) => {
    const { hostname, ipAddress, macAddress, stationId } = request.body || {};

    const cleanHost = (hostname || 'UNKNOWN-PC').trim();
    const cleanIp = ipAddress || request.ip || '127.0.0.1';
    const cleanMac = macAddress ? macAddress.replace(/[^a-fA-F0-9]/g, '').toLowerCase() : '';
    const formattedMac = cleanMac ? (cleanMac.match(/.{1,2}/g)?.join(':') || cleanMac) : '00:00:00:00:00:00';
    const newStationId = (stationId && stationId.length === 36) ? stationId : crypto.randomUUID();

    try {
      // 1. Check if hostname exists in database
      const existingHostRes = await fastify.pg.query(
        'SELECT id FROM stations WHERE LOWER(hostname) = LOWER($1)',
        [cleanHost]
      );

      if (existingHostRes.rows.length > 0) {
        const oldStationId = existingHostRes.rows[0].id;

        // Delete associated sessions first to avoid RESTRICT foreign key error
        await fastify.pg.query('DELETE FROM sessions WHERE station_id = $1', [oldStationId]);

        // Delete the existing station row
        await fastify.pg.query('DELETE FROM stations WHERE id = $1', [oldStationId]);
      }

      // 2. Insert new station row with the new station_id
      const insertRes = await fastify.pg.query(
        `INSERT INTO stations (id, hostname, ip_address, mac_address, status)
         VALUES ($1, $2, $3, $4, 'AVAILABLE')
         RETURNING id, status`,
        [newStationId, cleanHost, cleanIp, formattedMac]
      );

      const station = insertRes.rows[0];

      return reply.send({
        success: true,
        stationId: station.id,
        status: station.status,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to identify station' });
    }
  });

  fastify.get('/agent/lookup', {schema: agentLookupSchema}, async (request, reply) => {
    const { mac, hostname } = request.query;

    if (!mac && !hostname) {
      return reply.code(400).send({ error: 'Provide either mac or hostname' });
    }

    const cleanMac = mac ? mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase() : null;

    try {
      const res = await fastify.pg.query(
        `SELECT id, hostname, ip_address, mac_address, status 
         FROM stations 
         WHERE ($1::text IS NOT NULL AND LOWER(REPLACE(REPLACE(mac_address, ':', ''), '-', '')) = $1)
            OR ($2::text IS NOT NULL AND LOWER(hostname) = LOWER($2))`,
        [cleanMac, hostname || null]
      );

      if (res.rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Station not found' });
      }

      return reply.send({
        success: true,
        station: res.rows[0]
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database lookup failed' });
    }
  });
}

module.exports = agent;