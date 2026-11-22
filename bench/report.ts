// Rebuild every RESULTS.md from the recorded runs (no benchmark is run).
import { writeReports } from './lib/report.ts';
import { services } from './registry.ts';

for (const f of writeReports(services)) console.log(`Wrote ${f}`);
