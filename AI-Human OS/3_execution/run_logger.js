// run_logger.js

export function logStep(msg) {
  const now = new Date().toLocaleTimeString();
  console.log(`\n🟦 [${now}] ${msg}`);
}

export function logSub(msg) {
  console.log(`   ↳ ${msg}`);
}

export function logSuccess(msg) {
  console.log(`   ✅ ${msg}`);
}

export function logWarn(msg) {
  console.log(`   ⚠️ ${msg}`);
}

export function logError(msg) {
  console.log(`   ❌ ${msg}`);
}

export function logDivider() {
  console.log("\n----------------------------------------");
}

export function timeStart(label) {
  console.time(`⏱ ${label}`);
}

export function timeEnd(label) {
  console.timeEnd(`⏱ ${label}`);
}