// PM2: supervisor de procesos de Mundo Pets
// Uso: pm2 start ecosystem.config.js   |   pm2 logs mundo-pets   |   pm2 status
module.exports = {
  apps: [
    {
      name: 'mundo-pets',
      script: 'backend/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true
    }
  ]
};