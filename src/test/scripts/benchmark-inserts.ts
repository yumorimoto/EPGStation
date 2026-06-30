/* eslint-disable @typescript-eslint/no-var-requires */
import { DataSource } from 'typeorm';
import Program from '../../db/entities/Program';
import Channel from '../../db/entities/Channel';
import Rule from '../../db/entities/Rule';
import Reserve from '../../db/entities/Reserve';
import Recorded from '../../db/entities/Recorded';
import RecordedHistory from '../../db/entities/RecordedHistory';
import VideoFile from '../../db/entities/VideoFile';
import Thumbnail from '../../db/entities/Thumbnail';
import DropLogFile from '../../db/entities/DropLogFile';

async function runBenchmark() {
    console.log('Starting Benchmark...');

    const dataSource = new DataSource({
        type: 'sqlite',
        database: ':memory:',
        entities: [
            Program,
            Channel,
            Rule,
            Reserve,
            Recorded,
            RecordedHistory,
            VideoFile,
            Thumbnail,
            DropLogFile,
            require('../../db/entities/RecordedTag').default,
        ],
        synchronize: true,
        logging: false,
        driver: require('sqlite3'),
    });

    await dataSource.initialize();
    console.log('Database initialized in memory.');

    // Utility to measure execution time
    const measure = async (name: string, fn: () => Promise<void>) => {
        const start = performance.now();
        await fn();
        const end = performance.now();
        const duration = end - start;
        console.log(`[${name}] Time: ${duration.toFixed(2)} ms`);
        return duration;
    };

    // 1. Benchmark Programs (10,000 records)
    const programCount = 10000;
    const programs: any[] = [];
    for (let i = 0; i < programCount; i++) {
        programs.push({
            id: i + 1,
            channelId: (i % 100) + 1,
            eventId: i + 1,
            serviceId: (i % 100) + 1,
            networkId: 1,
            startAt: Date.now() + i * 1000,
            endAt: Date.now() + i * 1000 + 3600000,
            startHour: 10,
            week: 1,
            duration: 3600000,
            isFree: true,
            name: `Program ${i}`,
            description: `Description for program ${i}`,
            extended: `Extended details for program ${i}`,
            channelType: 'GR',
            channelTypeId: 1,
            channel: `CH${(i % 100) + 1}`,
            updateTime: Date.now(),
            halfWidthName: `Program ${i}`,
            shortName: `P${i}`,
            halfWidthDescription: `Desc ${i}`,
            halfWidthExtended: `Ext ${i}`,
            rawExtended: ``,
            rawHalfWidthExtended: ``,
        });
    }

    console.log(`\n--- Program Benchmark (${programCount} records) ---`);
    const programRepo = dataSource.getRepository(Program);

    // Baseline: N+1
    await measure('Program - N+1 Insert', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            for (const program of programs) {
                await queryRunner.manager.insert(Program, program);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await programRepo.clear();

    // Chunked Insert
    await measure('Program - Chunked Insert (Size: 500)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            const chunkSize = 500;
            for (let i = 0; i < programs.length; i += chunkSize) {
                const chunk = programs.slice(i, i + chunkSize);
                await queryRunner.manager.insert(Program, chunk);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await programRepo.clear();

    // 2. Benchmark Rules (500 records)
    const ruleCount = 500;
    const rules: any[] = [];
    for (let i = 0; i < ruleCount; i++) {
        rules.push({
            keyword: `Rule ${i}`,
            ignoreKeyword: '',
            keyCS: false,
            keyRegExp: false,
            title: false,
            description: false,
            extended: false,
            ignoreKeyCS: false,
            ignoreKeyRegExp: false,
            ignoreTitle: false,
            ignoreDescription: false,
            ignoreExtended: false,
            GR: true,
            BS: true,
            CS: true,
            SKY: true,
            isFree: true,
            enable: true,
            allowEndLack: true,
        });
    }

    console.log(`\n--- Rule Benchmark (${ruleCount} records) ---`);
    const ruleRepo = dataSource.getRepository(Rule);

    await measure('Rule - N+1 Insert', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            for (const rule of rules) {
                await queryRunner.manager.insert(Rule, rule);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await ruleRepo.clear();

    await measure('Rule - Chunked Insert (Size: 500)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            const chunkSize = 500;
            for (let i = 0; i < rules.length; i += chunkSize) {
                const chunk = rules.slice(i, i + chunkSize);
                await queryRunner.manager.insert(Rule, chunk);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await ruleRepo.clear();

    // 3. Benchmark Channels (100 records) Upsert Pattern
    const channelCount = 100;
    const channels: any[] = [];
    for (let i = 0; i < channelCount; i++) {
        channels.push({
            id: i + 1,
            serviceId: i + 1,
            networkId: 1,
            name: `Channel ${i}`,
            halfWidthName: `C${i}`,
            remoteControlKeyId: i + 1,
            hasLogoData: false,
            channelType: 'GR',
            channelTypeId: 1,
            channel: `CH${i}`,
            type: 1,
        });
    }

    console.log(`\n--- Channel Upsert Benchmark (${channelCount} records) ---`);
    const channelRepo = dataSource.getRepository(Channel);
    // pre-fill half
    await channelRepo.insert(channels.slice(0, 50));

    await measure('Channel - N+1 Upsert (Catch/Update)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            for (const channel of channels) {
                await queryRunner.manager.insert(Channel, channel).catch(async err => {
                    await queryRunner.manager.update(Channel, channel.id, channel).catch(() => {
                        console.error(err);
                    });
                });
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await channelRepo.clear();
    await channelRepo.insert(channels.slice(0, 50));

    await measure('Channel - Chunked Upsert (Save)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            const chunkSize = 500;
            for (let i = 0; i < channels.length; i += chunkSize) {
                const chunk = channels.slice(i, i + chunkSize);
                await queryRunner.manager.save(Channel, chunk);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await channelRepo.clear();

    // 4. Benchmark Reserves (300 records)
    const reserveCount = 300;
    const reserves: any[] = [];
    for (let i = 0; i < reserveCount; i++) {
        reserves.push({
            programId: i + 1,
            ruleId: 1,
            isSkip: false,
            isManual: false,
            isConflict: false,
            isTimeSpecified: false,
            startAt: Date.now(),
            endAt: Date.now() + 3600000,
            channelId: 1,
            channel: `CH1`,
            channelType: `GR`,
            halfWidthDescription: `Desc`,
            halfWidthExtended: `Ext`,
            rawExtended: ``,
            rawHalfWidthExtended: ``,
            name: `Reserve ${i}`,
            halfWidthName: `R${i}`,
            updateTime: Date.now(),
            description: '',
            extended: '',
            isFree: true,
            allowEndLack: true,
        });
    }

    console.log(`\n--- Reserve Benchmark (${reserveCount} records) ---`);
    const reserveRepo = dataSource.getRepository(Reserve);

    await measure('Reserve - N+1 Insert (With Identity Return)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            for (const reserve of reserves) {
                const result = await queryRunner.manager.insert(Reserve, reserve);
                reserve.id = result.identifiers[0].id;
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await reserveRepo.clear();

    await measure('Reserve - Chunked Insert (With Identity Return)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            const chunkSize = 500;
            for (let i = 0; i < reserves.length; i += chunkSize) {
                const chunk = reserves.slice(i, i + chunkSize);
                const result = await queryRunner.manager.insert(Reserve, chunk);
                for (let j = 0; j < chunk.length; j++) {
                    chunk[j].id = result.identifiers[j].id;
                }
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await reserveRepo.clear();

    // 5. Benchmark Recorded (1000 records)
    const recordedCount = 1000;
    const recorded: any[] = [];
    for (let i = 0; i < recordedCount; i++) {
        recorded.push({
            id: i + 1,
            isRecording: false,
            channelId: 1,
            startAt: Date.now(),
            endAt: Date.now() + 3600000,
            duration: 3600000,
            name: `Recorded ${i}`,
            halfWidthName: `Rec${i}`,
            description: '',
            halfWidthDescription: '',
            extended: '',
            halfWidthExtended: '',
            rawExtended: '',
            rawHalfWidthExtended: '',
            channelType: 'GR',
            channel: 'CH1',
            dropLogFileId: null,
        });
    }

    console.log(`\n--- Recorded Benchmark (${recordedCount} records) ---`);
    const recordedRepo = dataSource.getRepository(Recorded);

    await measure('Recorded - N+1 Insert', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            for (const rec of recorded) {
                await queryRunner.manager.insert(Recorded, rec);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await recordedRepo.clear();

    await measure('Recorded - Chunked Insert (Size: 500)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            const chunkSize = 500;
            for (let i = 0; i < recorded.length; i += chunkSize) {
                const chunk = recorded.slice(i, i + chunkSize);
                await queryRunner.manager.insert(Recorded, chunk);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    // 6. Benchmark VideoFile (1000 records)
    const videoFileCount = 1000;
    const videoFiles: any[] = [];
    for (let i = 0; i < videoFileCount; i++) {
        videoFiles.push({
            name: `VideoFile ${i}`,
            parentDirectoryName: 'testDir',
            filePath: `/test/${i}.ts`,
            type: 'ts',
            size: 1024 * 1024 * 100, // 100MB
        });
    }

    console.log(`\n--- VideoFile Benchmark (${videoFileCount} records) ---`);
    const videoFileRepo = dataSource.getRepository(VideoFile);

    await measure('VideoFile - N+1 Insert', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            for (const vf of videoFiles) {
                await queryRunner.manager.insert(VideoFile, vf);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await videoFileRepo.clear();

    await measure('VideoFile - Chunked Insert (Size: 500)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            const chunkSize = 500;
            for (let i = 0; i < videoFiles.length; i += chunkSize) {
                const chunk = videoFiles.slice(i, i + chunkSize);
                await queryRunner.manager.insert(VideoFile, chunk);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    // 7. Benchmark Thumbnail (1000 records)
    const thumbnailCount = 1000;
    const thumbnails: any[] = [];
    for (let i = 0; i < thumbnailCount; i++) {
        thumbnails.push({
            recordedId: i + 1,
            filePath: `/test/thumbnail_${i}.jpg`,
        });
    }

    console.log(`\n--- Thumbnail Benchmark (${thumbnailCount} records) ---`);
    const thumbnailRepo = dataSource.getRepository(Thumbnail);

    await measure('Thumbnail - N+1 Insert', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            for (const thumb of thumbnails) {
                await queryRunner.manager.insert(Thumbnail, thumb);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await thumbnailRepo.clear();

    await measure('Thumbnail - Chunked Insert (Size: 500)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            const chunkSize = 500;
            for (let i = 0; i < thumbnails.length; i += chunkSize) {
                const chunk = thumbnails.slice(i, i + chunkSize);
                await queryRunner.manager.insert(Thumbnail, chunk);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    // 8. Benchmark DropLogFile (1000 records)
    const dropLogFileCount = 1000;
    const dropLogFiles: any[] = [];
    for (let i = 0; i < dropLogFileCount; i++) {
        dropLogFiles.push({
            errorCnt: i,
            dropCnt: i,
            scramblingCnt: i,
            filePath: `/test/drop_${i}.log`,
        });
    }

    console.log(`\n--- DropLogFile Benchmark (${dropLogFileCount} records) ---`);
    const dropLogFileRepo = dataSource.getRepository(DropLogFile);

    await measure('DropLogFile - N+1 Insert', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            for (const drop of dropLogFiles) {
                await queryRunner.manager.insert(DropLogFile, drop);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await dropLogFileRepo.clear();

    await measure('DropLogFile - Chunked Insert (Size: 500)', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.startTransaction();
        try {
            const chunkSize = 500;
            for (let i = 0; i < dropLogFiles.length; i += chunkSize) {
                const chunk = dropLogFiles.slice(i, i + chunkSize);
                await queryRunner.manager.insert(DropLogFile, chunk);
            }
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    });

    await dataSource.destroy();
}
runBenchmark().catch(console.error);
