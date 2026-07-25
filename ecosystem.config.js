// PM2 process definition for HERO Sidekick.
// Bind the standalone Next.js server to loopback so only Nginx can reach it.
//
// Start:   pm2 start ecosystem.config.js
// Persist: pm2 save

module.exports = {
  apps: [
    {
      name: "sidekick-app",
      script: ".next/standalone/server.js",
      cwd: "/root/my-app",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        HOSTNAME: "127.0.0.1",
      },
      max_memory_restart: "750M",
      out_file: "logs/pm2-out.log",
      error_file: "logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
