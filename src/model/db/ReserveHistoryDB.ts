import { inject, injectable } from 'inversify';
import ReserveHistory from '../../db/entities/ReserveHistory';
import ILogger from '../ILogger';
import ILoggerModel from '../ILoggerModel';
import IDBOperator from './IDBOperator';
import IReserveHistoryDB from './IReserveHistoryDB';

@injectable()
export default class ReserveHistoryDB implements IReserveHistoryDB {
    private log: ILogger;
    private op: IDBOperator;

    constructor(@inject('ILoggerModel') logger: ILoggerModel, @inject('IDBOperator') op: IDBOperator) {
        this.log = logger.getLogger();
        this.op = op;
    }

    public async insertOnce(reserve: ReserveHistory): Promise<void> {
        const connection = await this.op.getConnection();
        const queryRunner = connection.createQueryRunner();
        await queryRunner.startTransaction();

        try {
            await queryRunner.manager.insert(ReserveHistory, reserve);
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            this.log.system.error('insertOnce ReserveHistory error');
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    public async insertMany(reserves: ReserveHistory[]): Promise<void> {
        if (reserves.length === 0) return;
        const connection = await this.op.getConnection();
        const queryRunner = connection.createQueryRunner();
        await queryRunner.startTransaction();

        try {
            await queryRunner.manager.insert(ReserveHistory, reserves);
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            this.log.system.error('insertMany ReserveHistory error');
            throw err;
        } finally {
            await queryRunner.release();
        }
    }
}
