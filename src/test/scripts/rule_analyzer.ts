// src/rule_analyzer.ts
import 'reflect-metadata';
import * as containerSetter from '../../model/ModelContainerSetter';
import container from '../../model/ModelContainer';
import IConfiguration from '../../model/IConfiguration';
import ILoggerModel from '../../model/ILoggerModel';
import IDBOperator from '../../model/db/IDBOperator';
import IRuleDB from '../../model/db/IRuleDB';
import IProgramDB from '../../model/db/IProgramDB';
import * as apid from '../../../api';

// Need to load the internal entities correctly or else Metadata errors happen
import '../../db/entities/Rule';

import '../../db/entities/Program';

async function analyzeRules() {
    containerSetter.set(container);
    container.get<ILoggerModel>('ILoggerModel').initialize();
    container.get<IConfiguration>('IConfiguration').getConfig();

    const dbOp = container.get<IDBOperator>('IDBOperator');
    const ruleDB = container.get<IRuleDB>('IRuleDB');
    const programDB = container.get<IProgramDB>('IProgramDB');

    try {
        await dbOp.getConnection();

        const [rules, totalRules] = await ruleDB.findAll({ limit: 1000 });
        console.log(`Fetched ${totalRules} rules from database.`);
        const activeRules = (rules as apid.Rule[]).filter(r => r.reserveOption.enable && !r.isTimeSpecification);

        const programToRules: { [programId: number]: apid.Rule[] } = {};

        // Execute exact EPGStation search logic
        for (const rule of activeRules) {
            const matchedPrograms = await programDB.findRule({
                searchOption: rule.searchOption,
                reserveOption: rule.reserveOption,
            });

            for (const program of matchedPrograms) {
                if (!programToRules[program.id]) programToRules[program.id] = [];
                programToRules[program.id].push(rule);
            }
        }

        console.log('\n--- Rule Conflict & Overlap Report ---');
        for (const [programIdStr, matchedRules] of Object.entries(programToRules)) {
            if (matchedRules.length > 1) {
                const programId = parseInt(programIdStr, 10);
                const programData = await programDB.findId(programId);
                console.log(`\nProgram: ${programData ? programData.name : programId}`);
                console.log(`Matched by ${matchedRules.length} rules:`);

                // Sort by ID to see which rule actually wins execution priority
                matchedRules
                    .sort((a, b) => a.id - b.id)
                    .forEach((r, idx) => {
                        const status = idx === 0 ? '(Will Record)' : '(Ignored/Conflict)';
                        console.log(`  - Rule ID ${r.id}: '${r.searchOption.keyword || '<No Keyword>'}' ${status}`);
                    });
            }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await dbOp.closeConnection();
        process.exit(0);
    }
}

analyzeRules();
