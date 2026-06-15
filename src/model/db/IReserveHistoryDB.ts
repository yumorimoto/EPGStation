import ReserveHistory from '../../db/entities/ReserveHistory';

export default interface IReserveHistoryDB {
    insertOnce(reserve: ReserveHistory): Promise<void>;
    insertMany(reserves: ReserveHistory[]): Promise<void>;
}
