import pg from 'pg';

console.log('port', process.env.DATABASE_PORT);
export const pool = new pg.Pool({
	user: process.env.DATABASE_USER,
	host: process.env.DATABASE_HOST,
	port: process.env.DATABASE_PORT,
	database: 'symptopm_checker',
	password: process.env.DATABASE_PASSWORD ? process.env.DATABASE_PASSWORD : '',
});
