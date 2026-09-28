const getAvailableSlotsSchema = {
  summary: 'Query booked slots for a date',
  description: 'Returns all confirmed or checked-in reservations for a specific date to identify occupied time slots.',
  tags: ['Reservations'],
  querystring: {
    type: 'object',
    required: ['date'],
    properties: {
      date: { type: 'string', format: 'date', description: 'Target date in YYYY-MM-DD format' },
      stationId: { type: 'string', format: 'uuid', description: 'Optional workstation UUID to filter slots' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        date: { type: 'string', example: '2026-10-15' },
        bookedSlots: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              station_id: { type: 'string', format: 'uuid' },
              start_time: { type: 'string', format: 'date-time' },
              end_time: { type: 'string', format: 'date-time' },
              status: { type: 'string', example: 'CONFIRMED' },
            },
          },
        },
      },
    },
    400: {
      type: 'object',
      properties: { error: { type: 'string', example: 'date (YYYY-MM-DD) is required' } },
    },
  },
};

const createReservationSchema = {
  summary: 'Reserve & pay upfront',
  description: 'Reserves a workstation for a specific duration and deducts the total cost upfront from the wallet. Non-cancelable.',
  tags: ['Reservations'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['stationId', 'tariffId', 'startTime', 'durationMinutes'],
    properties: {
      stationId: { type: 'string', format: 'uuid', description: 'Target workstation UUID' },
      tariffId: { type: 'string', format: 'uuid', description: 'Selected tariff UUID' },
      startTime: { type: 'string', format: 'date-time', example: '2026-10-15T14:00:00Z', description: 'Future ISO timestamp' },
      durationMinutes: { type: 'integer', minimum: 1, example: 120, description: 'Duration in minutes' },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Reservation created and fully paid upfront. No cancellations allowed.' },
        reservation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            station_id: { type: 'string', format: 'uuid' },
            customer_id: { type: 'string', format: 'uuid' },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            total_cost_millimes: { type: 'string', example: '10000' },
            status: { type: 'string', example: 'CONFIRMED' },
          },
        },
        remainingBalanceMillimes: { type: 'string', example: '5000' },
      },
    },
    400: {
      type: 'object',
      properties: { error: { type: 'string', example: 'Insufficient wallet balance for upfront booking' } },
    },
    404: {
      type: 'object',
      properties: { error: { type: 'string', example: 'Tariff rate not found' } },
    },
    409: {
      type: 'object',
      properties: { error: { type: 'string', example: 'Station is already booked during this time slot' } },
    },
    500: {
      type: 'object',
      properties: { error: { type: 'string', example: 'Failed to complete upfront reservation' } },
    },
  },
};

const checkInReservationSchema = {
  summary: 'Check in to reservation',
  description: 'Converts a confirmed upfront reservation into an active workstation gaming session and issues a WebSocket start signal.',
  tags: ['Reservations'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Target reservation UUID' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Reservation converted to active session successfully' },
        session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            station_id: { type: 'string', format: 'uuid' },
            customer_id: { type: 'string', format: 'uuid' },
            tariff_id: { type: 'string', format: 'uuid' },
            status: { type: 'string', example: 'ACTIVE' },
            opened_at: { type: 'string', format: 'date-time' },
            version: { type: 'integer', example: 1 },
          },
        },
        delivered: { type: 'boolean', example: true },
      },
    },
    403: {
      type: 'object',
      properties: { error: { type: 'string', example: 'Forbidden: You can only check in to your own reservation' } },
    },
    404: {
      type: 'object',
      properties: { error: { type: 'string', example: 'Valid confirmed reservation not found' } },
    },
    409: {
      type: 'object',
      properties: { error: { type: 'string', example: 'Station currently has an active session' } },
    },
    500: {
      type: 'object',
      properties: { error: { type: 'string', example: 'Failed to convert reservation to active session' } },
    },
  },
};

module.exports = {
  getAvailableSlotsSchema,
  createReservationSchema,
  checkInReservationSchema,
};
