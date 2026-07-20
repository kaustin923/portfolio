const fs = require('node:fs');

const originalWatch = fs.watch;
fs.watch = (...args) => {
  const watcher = originalWatch(...args);
  watcher.on('error', (error) => {
    if (error?.code !== 'EMFILE') {
      process.nextTick(() => {
        throw error;
      });
    }
  });
  return watcher;
};
