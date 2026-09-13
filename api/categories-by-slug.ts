// Explicit '.js' extension required: package.json sets "type": "module", so
// Vercel's Node ESM resolver rejects extensionless relative specifiers with
// ERR_MODULE_NOT_FOUND ('/var/task/api/categories'). Vercel emits categories.js.
import handler from './categories.js';

export default handler;
