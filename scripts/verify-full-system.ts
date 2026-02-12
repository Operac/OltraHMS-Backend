import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SCRIPTS = [
    'scripts/verify-admin-flow.ts',
    'scripts/verify-doctor-flow.ts',
    'scripts/verify-lab-flow.ts',
    'scripts/verify-pharmacy-flow.ts',
    'scripts/verify-inpatient-flow.ts',
    'scripts/verify-receptionist-flow.ts',
    'scripts/verify-telemedicine-suite.ts'
];

async function runFullSystemCheck() {
    console.log('🚀 Starting Full System Verification...');
    let passed = 0;
    let failed = 0;

    for (const script of SCRIPTS) {
        console.log(`\n---------------------------------------------------`);
        console.log(`▶️ Running: ${script}`);
        console.log(`---------------------------------------------------`);
        try {
            const { stdout, stderr } = await execAsync(`npx ts-node ${script}`, { cwd: process.cwd() });
            console.log(stdout);
            if (stderr) console.error(stderr);
            console.log(`✅ ${script} PASSED`);
            passed++;
        } catch (error: any) {
            console.error(`❌ ${script} FAILED`);
            console.error(error.stdout || error.message);
            failed++;
        }
    }

    console.log(`\n===================================================`);
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`===================================================`);
    
    if (failed > 0) process.exit(1);
}

runFullSystemCheck();
