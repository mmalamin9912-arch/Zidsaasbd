// Explicit '.js' extension required: package.json sets "type": "module", so
// Vercel's Node ESM resolver rejects extensionless relative specifiers with
// ERR_MODULE_NOT_FOUND ('/var/task/api/products'). Vercel emits products.js.
import handler from './products.js';

export default handler;
