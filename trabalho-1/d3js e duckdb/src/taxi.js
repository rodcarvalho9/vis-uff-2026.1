
import { loadDb } from './config';

export class Taxi {
    async init() {
        this.db = await loadDb();
        this.conn = await this.db.connect();

        this.table = 'taxi_2025';
        this.parquetFileName = 'green_tripdata_2025.parquet';
    }

    async loadTaxi() {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        const parquetUrl = `${import.meta.env.BASE_URL}parquet_processado/${this.parquetFileName}`;
        const res = await fetch(parquetUrl);

        const parquetBuffer = new Uint8Array(await res.arrayBuffer());
        await this.db.registerFileBuffer(this.parquetFileName, parquetBuffer);

        await this.conn.query(`
            CREATE OR REPLACE TABLE ${this.table} AS
                SELECT * 
                FROM read_parquet('${this.parquetFileName}');
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
