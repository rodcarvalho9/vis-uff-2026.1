
import { loadDb } from './config';

export class Taxi {
    async init() {
        this.db = await loadDb();
        this.conn = await this.db.connect();

        this.color = "green";
        this.table = 'taxi_2023';
    }

    async loadTaxi() {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        const url = `/parquet_processado/${this.color}_tripdata_2023.parquet`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch parquet file: ${res.statusText}`);
        await this.db.registerFileBuffer('taxi_data', new Uint8Array(await res.arrayBuffer()));

        await this.conn.query(`
            CREATE TABLE ${this.table} AS
                SELECT * 
                FROM read_parquet('taxi_data');
        `);
    }

    async query(sql) {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        let result = await this.conn.query(sql);
        return result.toArray().map(row => row.toJSON());
    }

    async test(limit = 10) {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        const sql = `
                SELECT * 
                FROM ${this.table}
                LIMIT ${limit}
            `;

        return await this.query(sql);
    }
}