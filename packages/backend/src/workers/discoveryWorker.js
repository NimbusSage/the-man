// discoveryWorker.js — stub: prevents Docker restart loop by keeping the process alive
console.log('✓ Discovery worker started (idle — awaiting implementation)');
setInterval(() => {}, 1 << 30);
process.on('SIGTERM', () => process.exit(0));
