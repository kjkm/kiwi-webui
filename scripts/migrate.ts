import { closeDatabase, getDatabase } from '../src/lib/server/db/database.js';

getDatabase();
closeDatabase();
console.log('Database migrations complete.');
