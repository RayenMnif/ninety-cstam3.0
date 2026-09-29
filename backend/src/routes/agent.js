const { registerAgentSchema } = require('../schemas/agent.schema');

async function agent(fastify, opts) {
  fastify.post('/agent/register', { schema: registerAgentSchema }, async (request, reply) => {
    const { hostname, ipAddress, macAddress } = request.body || {};

    if (!macAddress) {
      return reply.code(400).send({ error: 'MAC address is required' });
    }

    const cleanMac = macAddress.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    const formattedMac = cleanMac.match(/.{1,2}/g)?.join(':') || macAddress.toLowerCase();

    try {
      // 1. Search DB matching Hostname OR MAC Address
      let res = await fastify.pg.query(
        `SELECT id, status FROM stations 
         WHERE LOWER(hostname) = LOWER($1)
            OR LOWER(REPLACE(REPLACE(mac_address, ':', ''), '-', '')) = $2`,
        [hostname || '', cleanMac]
      );

      let station;

      if (res.rows.length > 0) {
        station = res.rows[0];

        // 2. Update existing station row with real MAC & IP
        const updateRes = await fastify.pg.query(
          `UPDATE stations 
           SET ip_address = $1, 
               hostname = $2, 
               mac_address = $3,
               status = CASE WHEN status = 'OFFLINE' THEN 'AVAILABLE' ELSE status END,
               updated_at = NOW()
           WHERE id = $4
           RETURNING id, status`,
          [ipAddress || '127.0.0.1', hostname || 'UNKNOWN-PC', formattedMac, station.id]
        );
        station = updateRes.rows[0];
      } else {
        // 3. Insert new station row if neither MAC nor Hostname matched
        res = await fastify.pg.query(
          `INSERT INTO stations (hostname, ip_address, mac_address, status)
           VALUES ($1, $2, $3, 'AVAILABLE')
           RETURNING id, status`,
          [hostname || 'UNKNOWN-PC', ipAddress || '127.0.0.1', formattedMac]
        );
        station = res.rows[0];
      }

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

fastify.get('/agent/lookup', async (request, reply) => {
  const { mac, hostname } = request.query;

  if (!mac && !hostname) {
    return reply.code(400).send({ error: 'Provide either mac or hostname' });
  }

  const cleanMac = mac ? mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase() : null;

  try {
    const res = await fastify.pg.query(
      `SELECT id, hostname, ip_address, mac_address, status, updated_at 
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