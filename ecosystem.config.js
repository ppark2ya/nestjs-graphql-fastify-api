module.exports = {
  apps: [
    {
      name: 'nestjs-graphql-fastify-api',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
