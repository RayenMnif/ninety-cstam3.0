import WebSocket from 'ws';
import { ERROR_CODES, EVENTS } from '../protocol/constants.js';
import { createErrorResponse } from '../protocol/errors.js';
import { StationService } from '../services/station-service.js';
import { RedisPresenceTracker } from '../redis/presence.js';

/**
 * Handles incoming CLIENT_HEARTBEAT messages.
 * Integrates Redis presence tracking and PostgreSQL status updates.
 */
export class HeartbeatHandler {
  /**
   * @param {object} [options={}]
   * @param {StationService} [options.stationService]
   * @param {import('pg').Pool | import('pg').Client | import('@electric-sql/pglite').PGlite} [options.db]
   * @param {RedisPresenceTracker} [options.presenceTracker]
   * @param {import('ioredis').Redis | import('../redis/client.js').InMemoryRedisClient} [options.redis]
   * @param {import('../connection-manager.js').ConnectionManager} [options.connectionManager]
   * @param {object} [options.logger]
   * @param {boolean} [options.echoValid=true]
   */
  constructor(options = {}) {
    this.connectionManager = options.connectionManager || null;
    this.logger = options.logger || console;
    this.echoValid = options.echoValid !== false;

    if (options.stationService) {
      this.stationService = options.stationService;
    } else if (options.db) {
      this.stationService = new StationService(options.db);
    } else {
      this.stationService = null;
    }

    if (options.presenceTracker) {
      this.presenceTracker = options.presenceTracker;
    } else if (options.redis) {
      this.presenceTracker = new RedisPresenceTracker(options.redis);
    } else {
      this.presenceTracker = null;
    }
  }

  /**
   * Safely send message payload to socket if OPEN.
   * @param {import('ws').WebSocket} socket
   * @param {object} message
   */
  _send(socket, message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        this.logger?.warn?.({ err }, 'Failed to send message over WebSocket');
      }
    }
  }

  /**
   * Process a valid CLIENT_HEARTBEAT payload.
   *
   * @param {import('ws').WebSocket} socket
   * @param {{ station_id: string, status: string }} payload
   * @returns {Promise<{ success: boolean, code?: string, station_id?: string, status?: string }>}
   */
  async handleHeartbeat(socket, payload) {
    const { station_id, status } = payload;
    let dbUpdated = false;
    let dbError = null;
    let stationFound = true;
    let updatedStation = null;

    // 1. Check & Update station record in PostgreSQL
    if (this.stationService) {
      try {
        const updateResult = await this.stationService.updateHeartbeat(station_id, status);
        if (!updateResult.found) {
          stationFound = false;
        } else {
          dbUpdated = true;
          updatedStation = updateResult.station;
        }
      } catch (err) {
        dbError = err;
        this.logger?.warn?.({ err: err.message, station_id }, 'PostgreSQL error during heartbeat update');
      }
    } else {
      // Station service not configured / DB considered unavailable
      dbError = new Error('Database service unavailable');
    }

    // 2. Unregistered station handling
    if (!dbError && !stationFound) {
      this.logger?.warn?.({ station_id }, `Station '${station_id}' is not registered`);
      this._send(socket, createErrorResponse(
        ERROR_CODES.STATION_NOT_FOUND,
        `Station '${station_id}' is not registered`
      ));
      return { success: false, code: ERROR_CODES.STATION_NOT_FOUND };
    }

    // 3. Update presence in Redis if station is registered (or if DB failed)
    let redisUpdated = false;
    let redisError = null;

    if (this.presenceTracker) {
      try {
        await this.presenceTracker.setPresence(station_id, status);
        redisUpdated = true;
      } catch (err) {
        redisError = err;
        this.logger?.warn?.({ err: err.message, station_id }, 'Redis error during heartbeat presence update');
      }
    } else {
      redisError = new Error('Redis presence tracker unavailable');
    }

    // 4. Handle combined failure scenarios
    if (dbError && redisError) {
      this.logger?.error?.(
        { dbError: dbError.message, redisError: redisError.message, station_id },
        'Both PostgreSQL and Redis failed during heartbeat ingestion'
      );
      this._send(socket, createErrorResponse(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'State storage unavailable'
      ));
      return { success: false, code: ERROR_CODES.SERVICE_UNAVAILABLE };
    }

    if (dbError) {
      this._send(socket, createErrorResponse(
        ERROR_CODES.DATABASE_ERROR,
        'Database operation failed'
      ));
      return { success: false, code: ERROR_CODES.DATABASE_ERROR };
    }

    if (redisError) {
      this._send(socket, createErrorResponse(
        ERROR_CODES.REDIS_ERROR,
        'Redis operation failed'
      ));
      return { success: false, code: ERROR_CODES.REDIS_ERROR };
    }

    // 5. Successful ingestion: associate socket with station_id
    if (this.connectionManager) {
      this.connectionManager.associateStation(socket, station_id);
    }

    if (this.echoValid) {
      this._send(socket, {
        event: EVENTS.CLIENT_HEARTBEAT,
        payload
      });
    }

    socket.emit('station:heartbeat', {
      station_id,
      status,
      updatedStation
    });

    return {
      success: true,
      station_id,
      status
    };
  }
}
