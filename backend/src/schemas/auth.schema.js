const loginSchema = {
    summary: 'User Login',
    description: 'Authenticates a user by email and password, returning a signed JWT access token and user profile.',
    tags: ['Auth'],
    body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
            email: { type: 'string', format: 'email', description: 'User account email address' },
            password: { type: 'string', description: 'Plaintext password' },
        },
    },
    response: {
        200: {
            description: 'Authentication successful. Returns JWT access token and user info.',
            type: 'object',
            properties: {
                token: { type: 'string', description: 'JWT Bearer token' },
                user: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        username: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        role: { type: 'string' },
                    },
                },
            },
        },
        400: {
            description: 'Missing required credentials.',
            type: 'object',
            properties: {
                error: { type: 'string' },
                message: { type: 'string' },
                statusCode: { type: 'integer' },
            },
        },
        401: {
            description: 'Invalid email or password.',
            type: 'object',
            properties: {
                error: { type: 'string' },
            },
        },
        403: {
            description: 'Account deactivated or banned.',
            type: 'object',
            properties: {
                error: { type: 'string' },
            },
        },
        500: {
            description: 'Internal server error.',
            type: 'object',
            properties: {
                error: { type: 'string' },
            },
        },
    },
};

const signupSchema = {
    summary: 'Register New User',
    description: 'Creates a new gamer account, initializes a dedicated wallet with 0 balance, and issues an access token.',
    tags: ['Auth'],
    body: {
        type: 'object',
        required: ['email', 'username', 'password'],
        properties: {
            email: { type: 'string', format: 'email', description: 'Unique user email address' },
            username: { type: 'string', minLength: 3, maxLength: 50, description: 'Unique gamer display handle' },
            password: { type: 'string', minLength: 6, description: 'User password' },
        },
    },
    response: {
        201: {
            description: 'User successfully created with an active wallet.',
            type: 'object',
            properties: {
                token: { type: 'string', description: 'JWT Bearer token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                user: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid', example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e' },
                        username: { type: 'string', example: 'ninja_gamer' },
                        email: { type: 'string', format: 'email', example: 'newgamer@example.com' },
                        role: { type: 'string', example: 'GAMER' },
                    },
                },
            },
        },
        400: {
            description: 'Missing required registration parameters.',
            type: 'object',
            properties: {
                error: { type: 'string', example: 'email, username, password are required' },
                message: { type: 'string', example: 'body must have required property password' },
                statusCode: { type: 'integer', example: 400 },
            },
        },
        409: {
            description: 'Email or username already taken.',
            type: 'object',
            properties: {
                error: { type: 'string', example: 'Email or username is already taken' },
            },
        },
        500: {
            description: 'Internal server error during registration.',
            type: 'object',
            properties: {
                error: { type: 'string', example: 'Internal server error during registration' },
            },
        },
    },
};

const currentUserSchema = {
    summary: 'Get Current Authenticated User',
    description: 'Retrieves profile information and current wallet balance in millimes for the authenticated caller.',
    tags: ['Auth'],
    security: [{ bearerAuth: [] }],
    response: {
        200: {
            description: 'Current user profile with wallet balance in millimes.',
            type: 'object',
            properties: {
                user: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
                        username: { type: 'string', example: 'pro_gamer' },
                        email: { type: 'string', format: 'email', example: 'gamer@example.com' },
                        role: { type: 'string', example: 'GAMER' },
                        status: { type: 'string', example: 'ACTIVE' },
                        balance_millimes: { type: 'string', description: 'Wallet balance in millimes', example: '15000' },
                    },
                },
            },
        },
        401: {
            description: 'Unauthorized: Missing or invalid token.',
            type: 'object',
            properties: {
                error: { type: 'string', example: 'Unauthorized: Missing token header' },
            },
        },
        404: {
            description: 'User not found.',
            type: 'object',
            properties: {
                error: { type: 'string', example: 'User not found' },
            },
        },
        500: {
            description: 'Internal server error.',
            type: 'object',
            properties: {
                error: { type: 'string', example: 'Internal Server Error' },
            },
        },
    },
};

module.exports = {
    loginSchema,
    signupSchema,
    currentUserSchema,
};
