module.exports = {
  apps: [
    {
      name: "uhub",
      script: "./server.js",
      instances: 1,
      exec_mode: "fork", // Изменено с cluster на fork для одного процесса
      watch: false,
      max_memory_restart: "500M",
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
    },
  ],
}
