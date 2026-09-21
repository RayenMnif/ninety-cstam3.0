const buildApp = require('./app');

const start = async () => {
    try {
       const app = await buildApp(); 
       const port = process.env.PORT;
       const host = process.env.HOST;

        await app.listen({port, host});
        console.log(`Server listening on http://localhost:${port}`);

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

start();