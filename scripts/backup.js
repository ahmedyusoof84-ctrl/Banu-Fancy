import 'dotenv/config';
import {createDatabase} from '../server/db.js';
import {saveBackup} from '../server/backup.js';
const db=await createDatabase();try{console.log('Backup saved:',await saveBackup(db));}finally{await db.close();}
